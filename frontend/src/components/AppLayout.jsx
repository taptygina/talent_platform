import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatRole } from '../utils/labels'

const navItems = [
  { to: '/', label: 'Главная' },
  { to: '/projects', label: 'Проекты' },
  { to: '/teams', label: 'Команды' },
  { to: '/feed', label: 'Лента проектов' },
  { to: '/supervisor-invites', label: 'Приглашения' },
  { to: '/portfolio', label: 'Портфолио' },
  { to: '/projects/new', label: 'Создать проект' },
  { to: '/users/manage', label: 'Пользователи' },
  { to: '/users/import', label: 'Импорт пользователей' },
  { to: '/notifications', label: 'Уведомления' },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let ignore = false
    let timer

    const loadUnread = async () => {
      try {
        const { data } = await apiClient.get('/notifications/', {
          params: { is_read: false, page: 1 },
        })
        if (!ignore) setUnreadCount(data.count || 0)
      } catch {
        if (!ignore) setUnreadCount(0)
      }
    }

    loadUnread()
    timer = setInterval(loadUnread, 30000)
    return () => {
      ignore = true
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand-box">
          <Link to="/" className="brand-title">
            Инженерия проектов
          </Link>
          <p className="brand-subtitle">Платформа управления учебными и творческими проектами</p>
        </div>

        <nav className="nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
            >
              {item.to === '/notifications' ? `${item.label} (${unreadCount})` : item.label}
            </NavLink>
          ))}
        </nav>

        <div className="user-box">
          <span className="user-name">{user?.full_name || user?.username}</span>
          <span className="user-role">{formatRole(user?.role)}</span>
          <button type="button" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  )
}
