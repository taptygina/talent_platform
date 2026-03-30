import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatRole } from '../utils/labels'

const primaryNavItems = [
  { to: '/', label: 'Главная' },
  { to: '/projects', label: 'Проекты' },
  { to: '/projects/new', label: 'Создать проект' },
  { to: '/teams', label: 'Команды' },
  { to: '/feed', label: 'Лента проектов' },
  { to: '/notifications', label: 'Уведомления' },
]

const extraNavItems = [
  { to: '/projects/templates', label: 'Шаблоны проектов' },
  { to: '/teacher/deadlines', label: 'Календарь дедлайнов' },
  { to: '/supervisor-invites', label: 'Приглашения' },
  { to: '/portfolio', label: 'Портфолио' },
  { to: '/methodist/reports', label: 'Отчеты методиста' },
  { to: '/users/manage', label: 'Пользователи' },
  { to: '/users/import', label: 'Импорт пользователей' },
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
        <div className="header-top">
          <div className="brand-box">
            <Link to="/" className="brand-title">
              Инженерия проектов
            </Link>
            <p className="brand-subtitle">Платформа управления учебными и творческими проектами</p>
          </div>

          <div className="user-box">
            <span className="user-name">{user?.full_name || user?.username}</span>
            <span className="user-role">{formatRole(user?.role)}</span>
            <button type="button" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>

        <nav className="nav" aria-label="Основная навигация">
          {primaryNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
            >
              {item.to === '/notifications' ? `${item.label} (${unreadCount})` : item.label}
            </NavLink>
          ))}
          <details className="nav-more">
            <summary>Еще</summary>
            <div className="nav-more-menu">
              {extraNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </details>
        </nav>
      </header>

      <Outlet />
    </div>
  )
}
