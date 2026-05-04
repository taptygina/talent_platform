import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatNotificationType, formatRole } from '../utils/labels'

function buildNotificationLink(item) {
  if (item.project && item.stage) return `/projects/${item.project}#stage-${item.stage}`
  if (item.project) return `/projects/${item.project}`
  return '/notifications'
}

export function DashboardPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)

  useEffect(() => {
    let ignore = false
    const loadEvents = async () => {
      setLoadingEvents(true)
      try {
        const { data } = await apiClient.get('/notifications/', {
          params: { page: 1, ordering: '-created_at' },
        })
        if (!ignore) setNotifications((data.results || []).slice(0, 5))
      } catch {
        if (!ignore) setNotifications([])
      } finally {
        if (!ignore) setLoadingEvents(false)
      }
    }

    loadEvents()
    return () => {
      ignore = true
    }
  }, [])

  const markRead = async (id) => {
    await apiClient.post(`/notifications/${id}/mark_read/`)
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)))
  }

  return (
    <main className="page dashboard-z-layout">
      <section className="panel dashboard-hero">
        <div>
          <h1>Главная панель</h1>
          <p>
            Добро пожаловать, <strong>{user?.full_name || user?.username}</strong>. Здесь вы быстро переходите к проектам,
            этапам и ключевым событиям.
          </p>
        </div>
        <div className="dashboard-role-box">
          <span className="muted-text">Роль</span>
          <strong>{formatRole(user?.role)}</strong>
        </div>
      </section>

      <section className="dashboard-cta-grid">
        <article className="panel soft-panel dashboard-cta-card">
          <h2>Проекты</h2>
          <p>Создание, управление этапами и контроль статусов.</p>
          <Link className="button-link" to="/projects">
            Перейти к проектам
          </Link>
        </article>

        <article className="panel soft-panel dashboard-cta-card">
          <h2>Портфолио и аналитика</h2>
          <p>Рейтинг студентов и преподавателей, динамика в графиках.</p>
          <Link className="button-link" to="/portfolio">
            Открыть аналитику
          </Link>
        </article>

        <article className="panel soft-panel dashboard-cta-card">
          <h2>Создание проекта</h2>
          <p>Быстрый старт проекта для группы или команды.</p>
          <Link className="button-link" to="/projects/new">
            Создать проект
          </Link>
        </article>
      </section>

      <section className="panel dashboard-events-panel">
        <div className="toolbar">
          <h2>Умные уведомления: последние 5 событий</h2>
          <Link to="/notifications">Все уведомления</Link>
        </div>

        {loadingEvents ? <p>Загрузка событий...</p> : null}

        <ul className="list">
          {notifications.map((item) => (
            <li key={item.id} className="list-item">
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <p>
                  {formatNotificationType(item.type)} | {new Date(item.created_at).toLocaleString('ru-RU')}
                </p>
                <p>Статус: {item.is_read ? 'прочитано' : 'непрочитано'}</p>
              </div>
              <div className="project-form">
                <Link className="button-link" to={buildNotificationLink(item)}>
                  Перейти к объекту
                </Link>
                {!item.is_read ? (
                  <button type="button" onClick={() => markRead(item.id)}>
                    Отметить прочитанным
                  </button>
                ) : null}
              </div>
            </li>
          ))}

          {!loadingEvents && notifications.length === 0 ? (
            <li className="list-item">Событий пока нет.</li>
          ) : null}
        </ul>
      </section>
    </main>
  )
}
