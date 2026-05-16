import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatRole } from '../utils/labels'
import { Icon } from './Icon'

const primaryNavItems = [
  { to: '/', label: '\u0413\u043b\u0430\u0432\u043d\u0430\u044f', icon: 'home', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/projects', label: '\u041f\u0440\u043e\u0435\u043a\u0442\u044b', icon: 'briefcase', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/projects/archive', label: '\u0410\u0440\u0445\u0438\u0432 \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432', icon: 'archive', roles: ['teacher', 'curator', 'admin'] },
  { to: '/projects/new', label: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442', icon: 'plus', roles: ['teacher', 'curator', 'admin'] },
  { to: '/teams', label: '\u041a\u043e\u043c\u0430\u043d\u0434\u044b', icon: 'users', roles: ['teacher', 'curator', 'admin'] },
  { to: '/feed', label: '\u041b\u0435\u043d\u0442\u0430 \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432', icon: 'grid', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/notifications', label: '\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f', icon: 'bell', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
]

const extraNavItems = [
  { to: '/profile', label: '\u041f\u0440\u043e\u0444\u0438\u043b\u044c', icon: 'user', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/projects/templates', label: '\u0428\u0430\u0431\u043b\u043e\u043d\u044b \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432', icon: 'file', roles: ['teacher', 'curator', 'admin'] },
  { to: '/projects/review', label: '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432', icon: 'check', roles: ['teacher', 'curator', 'admin'] },
  { to: '/teacher/deadlines', label: '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0434\u0435\u0434\u043b\u0430\u0439\u043d\u043e\u0432', icon: 'calendar', roles: ['teacher', 'curator', 'admin'] },
  { to: '/supervisor-invites', label: '\u041f\u0440\u0438\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u044f', icon: 'inbox', roles: ['student', 'teacher', 'curator', 'admin'] },
  { to: '/portfolio', label: '\u041f\u043e\u0440\u0442\u0444\u043e\u043b\u0438\u043e', icon: 'book', roles: ['teacher', 'methodist', 'curator', 'admin'] },
  { to: '/methodist/reports', label: '\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430', icon: 'chart', roles: ['student', 'teacher', 'methodist', 'curator', 'admin'] },
  { to: '/analytics/teacher-workload', label: '\u041d\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043f\u0440\u0435\u043f\u043e\u0434\u0430\u0432\u0430\u0442\u0435\u043b\u0435\u0439', icon: 'settings', roles: ['methodist', 'curator', 'admin'] },
  { to: '/users/manage', label: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438', icon: 'users', roles: ['curator', 'admin'] },
  { to: '/users/import', label: '\u0418\u043c\u043f\u043e\u0440\u0442 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439', icon: 'file', roles: ['curator', 'admin'] },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [unreadCount, setUnreadCount] = useState(0)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreRef = useRef(null)
  const role = user?.role || ''
  const isProjectDetailRoute = /^\/projects\/\d+/.test(location.pathname)

  const filteredPrimaryNavItems = useMemo(
    // Показываем только маршруты, доступные текущей роли.
    () => primaryNavItems.filter((item) => item.roles.includes(role)),
    [role],
  )
  const filteredExtraNavItems = useMemo(
    () => extraNavItems.filter((item) => item.roles.includes(role)),
    [role],
  )
  const notificationLabel = unreadCount ? `Уведомления (${unreadCount})` : 'Уведомления'
  const mobileQuickActions = isProjectDetailRoute
    ? [
        {
          to: `${location.pathname}#project-stages`,
          label: user?.role === 'student' ? 'Сдать этап' : 'Статус',
          icon: 'check',
        },
        { to: `${location.pathname}#project-comments`, label: 'Комментарий', icon: 'file' },
        { to: '/notifications', label: notificationLabel, icon: 'bell' },
      ]
    : [
        { to: '/projects', label: 'Статусы', icon: 'briefcase' },
        { to: '/notifications', label: notificationLabel, icon: 'bell' },
        { to: '/profile', label: 'Профиль', icon: 'user' },
      ]

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

    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') setIsMoreOpen(false)
    }

    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onDocumentKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!location.hash) return

    const id = decodeURIComponent(location.hash.slice(1))
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash, location.pathname])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Перейти к основному содержимому
      </a>
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
              <Icon name={item.icon} size={16} />
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
                aria-controls="extra-navigation-menu"
                onClick={() => setIsMoreOpen((prev) => !prev)}
              >
                <Icon name="chevronDown" size={16} />
                {'\u0415\u0449\u0435'}
              </button>

              <div
                id="extra-navigation-menu"
                className={`nav-more-menu ${isMoreOpen ? 'nav-more-menu-open' : ''}`}
                role="menu"
                aria-label="Дополнительная навигация"
              >
                {filteredExtraNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      isActive ? 'nav-more-link nav-more-link-active' : 'nav-more-link'
                    }
                    onClick={() => setIsMoreOpen(false)}
                    role="menuitem"
                  >
                    <Icon name={item.icon} size={16} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ) : null}
        </nav>
      </header>

      <div id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </div>
      <nav className="mobile-quick-actions" aria-label="Быстрые действия">
        {mobileQuickActions.map((item) => (
          <Link key={`${item.to}-${item.label}`} to={item.to} className="mobile-quick-action">
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
