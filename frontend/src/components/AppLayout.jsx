import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatRole } from '../utils/labels'

const primaryNavItems = [
  { to: '/', label: '\u0413\u043b\u0430\u0432\u043d\u0430\u044f', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/projects', label: '\u041f\u0440\u043e\u0435\u043a\u0442\u044b', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/projects/archive', label: '\u0410\u0440\u0445\u0438\u0432 \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432', roles: ['teacher', 'curator', 'admin'] },
  { to: '/projects/new', label: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442', roles: ['teacher', 'curator', 'admin'] },
  { to: '/teams', label: '\u041a\u043e\u043c\u0430\u043d\u0434\u044b', roles: ['teacher', 'curator', 'admin'] },
  { to: '/feed', label: '\u041b\u0435\u043d\u0442\u0430 \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/notifications', label: '\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
]

const extraNavItems = [
  { to: '/profile', label: '\u041f\u0440\u043e\u0444\u0438\u043b\u044c', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/projects/templates', label: '\u0428\u0430\u0431\u043b\u043e\u043d\u044b \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432', roles: ['teacher', 'curator', 'admin'] },
  { to: '/stages/review', label: '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u044d\u0442\u0430\u043f\u043e\u0432', roles: ['teacher', 'curator', 'admin'] },
  { to: '/teacher/deadlines', label: '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0434\u0435\u0434\u043b\u0430\u0439\u043d\u043e\u0432', roles: ['teacher', 'curator', 'admin'] },
  { to: '/supervisor-invites', label: '\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', roles: ['student', 'teacher', 'curator', 'admin'] },
  { to: '/portfolio', label: '\u041f\u043e\u0440\u0442\u0444\u043e\u043b\u0438\u043e', roles: ['teacher', 'methodist', 'curator', 'admin'] },
  { to: '/methodist/reports', label: '\u041e\u0442\u0447\u0435\u0442\u044b \u043c\u0435\u0442\u043e\u0434\u0438\u0441\u0442\u0430', roles: ['methodist', 'curator', 'admin'] },
  { to: '/users/manage', label: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438', roles: ['curator', 'admin'] },
  { to: '/users/import', label: '\u0418\u043c\u043f\u043e\u0440\u0442 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439', roles: ['curator', 'admin'] },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreRef = useRef(null)
  const role = user?.role || ''

  const filteredPrimaryNavItems = useMemo(
    // Показываем только маршруты, доступные текущей роли.
    () => primaryNavItems.filter((item) => item.roles.includes(role)),
    [role],
  )
  const filteredExtraNavItems = useMemo(
    () => extraNavItems.filter((item) => item.roles.includes(role)),
    [role],
  )

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
    // Периодически обновляем счетчик непрочитанных без перезагрузки страницы.
    timer = setInterval(loadUnread, 30000)
    return () => {
      ignore = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const onDocumentClick = (event) => {
      // Закрываем выпадающее меню "Еще" при клике вне блока.
      if (!moreRef.current) return
      if (!moreRef.current.contains(event.target)) {
        setIsMoreOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-top">
          <div className="brand-box">
            <Link to="/" className="brand-title">
              {'\u0418\u043d\u0436\u0435\u043d\u0435\u0440\u0438\u044f \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432'}
            </Link>
            <p className="brand-subtitle">{'\u041f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0430 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u0443\u0447\u0435\u0431\u043d\u044b\u043c\u0438 \u0438 \u0442\u0432\u043e\u0440\u0447\u0435\u0441\u043a\u0438\u043c\u0438 \u043f\u0440\u043e\u0435\u043a\u0442\u0430\u043c\u0438'}</p>
          </div>

          <div className="user-box">
            <span className="user-name">{user?.full_name || user?.username}</span>
            <span className="user-role">{formatRole(user?.role)}</span>
            <button type="button" onClick={logout}>
              {'\u0412\u044b\u0439\u0442\u0438'}
            </button>
          </div>
        </div>

        <nav className="nav" aria-label={'\u041e\u0441\u043d\u043e\u0432\u043d\u0430\u044f \u043d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f'}>
          {filteredPrimaryNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
              onClick={() => setIsMoreOpen(false)}
            >
              {item.to === '/notifications' ? `${item.label} (${unreadCount})` : item.label}
            </NavLink>
          ))}

          {filteredExtraNavItems.length ? (
            <div className="nav-more" ref={moreRef}>
              <button
                type="button"
                className={`nav-more-toggle ${isMoreOpen ? 'nav-more-toggle-active' : ''}`}
                aria-expanded={isMoreOpen}
                aria-haspopup="menu"
                onClick={() => setIsMoreOpen((prev) => !prev)}
              >
                {'\u0415\u0449\u0435'}
              </button>

              <div className={`nav-more-menu ${isMoreOpen ? 'nav-more-menu-open' : ''}`} role="menu">
                {filteredExtraNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      isActive ? 'nav-more-link nav-more-link-active' : 'nav-more-link'
                    }
                    onClick={() => setIsMoreOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ) : null}
        </nav>
      </header>

      <Outlet />
    </div>
  )
}
