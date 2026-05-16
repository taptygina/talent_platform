import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'
import { useAuth } from '../features/auth/AuthContext'
import { formatNotificationType, formatRole } from '../utils/labels'

function buildNotificationLink(item) {
  if (item.project && item.stage) return `/projects/${item.project}#stage-${item.stage}`
  if (item.project) return `/projects/${item.project}`
  return '/notifications'
}

const roleDashboardConfig = {
  student: {
    title: 'Рабочий стол студента',
    description: 'Главное здесь: ближайшие этапы, дедлайны, обратная связь и понятный прогресс по проектам.',
    metrics: [
      { label: 'Задачи', value: 'Проекты', hint: 'Откройте активные этапы и сдачи', icon: 'briefcase' },
      { label: 'Дедлайны', value: 'Сроки', hint: 'Проверьте ближайшие даты', icon: 'calendar' },
      { label: 'Обратная связь', value: 'Ответы', hint: 'Комментарии преподавателя и доработки', icon: 'bell' },
    ],
    actions: [
      { title: 'Мои проекты', text: 'Статусы, этапы, сдачи и комментарии по текущей работе.', to: '/projects', label: 'Открыть проекты', icon: 'briefcase' },
      { title: 'Уведомления', text: 'Новые комментарии, решения по сдачам и приглашения.', to: '/notifications', label: 'Проверить события', icon: 'bell' },
      { title: 'Витрина проектов', text: 'Посмотреть опубликованные проекты и идеи других команд.', to: '/feed', label: 'Открыть витрину', icon: 'grid' },
    ],
  },
  teacher: {
    title: 'Панель преподавателя',
    description: 'Фокус на проверке, приоритизации сдач и быстрой обратной связи студентам.',
    metrics: [
      { label: 'Проверка', value: 'Сдачи', hint: 'Проекты, где нужен ответ', icon: 'check' },
      { label: 'Сроки', value: 'Календарь', hint: 'Дедлайны и задержки по этапам', icon: 'calendar' },
      { label: 'Шаблоны', value: 'DOCX', hint: 'Актуальные шаблоны проектов', icon: 'file' },
    ],
    actions: [
      { title: 'Проверка проектов', text: 'Карточки проектов с прогрессом команды и ближайшим проблемным этапом.', to: '/projects/review', label: 'Перейти к проверке', icon: 'check' },
      { title: 'Календарь дедлайнов', text: 'Быстро понять, где сроки горят и кому нужна обратная связь.', to: '/teacher/deadlines', label: 'Открыть календарь', icon: 'calendar' },
      { title: 'Шаблоны проектов', text: 'Проверить актуальность шаблонов и структуры отчетов.', to: '/projects/templates', label: 'Открыть шаблоны', icon: 'file' },
    ],
  },
  methodist: {
    title: 'Штаб методиста',
    description: 'Мониторинг дисциплины выполнения, KPI, рисков и нагрузки преподавателей без лишнего шума.',
    metrics: [
      { label: 'KPI', value: 'Отчеты', hint: 'Динамика, статусы, распределения', icon: 'chart' },
      { label: 'Риски', value: 'Контроль', hint: 'Просрочки и слабые зоны', icon: 'settings' },
      { label: 'Нагрузка', value: 'Баланс', hint: 'Прогноз и перераспределение', icon: 'users' },
    ],
    actions: [
      { title: 'Аналитика выполнения', text: 'Единая картина по проектам, статусам и динамике.', to: '/methodist/reports', label: 'Открыть отчеты', icon: 'chart' },
      { title: 'Нагрузка преподавателей', text: 'Мониторинг перегрузки и инструменты перераспределения.', to: '/analytics/teacher-workload', label: 'Открыть нагрузку', icon: 'settings' },
      { title: 'Портфолио', text: 'Рейтинги, достижения и развитие участников.', to: '/portfolio', label: 'Открыть портфолио', icon: 'book' },
    ],
  },
  curator: {
    title: 'Панель куратора',
    description: 'Системный контроль: права, аудит, безопасность, пользователи и операционные настройки.',
    metrics: [
      { label: 'Права', value: 'Роли', hint: 'Пользователи и доступы', icon: 'users' },
      { label: 'Данные', value: 'Импорт', hint: 'Массовая загрузка учетных записей', icon: 'file' },
      { label: 'Контроль', value: 'Архив', hint: 'Проекты, шаблоны и операции', icon: 'archive' },
    ],
    actions: [
      { title: 'Пользователи', text: 'Управление ролями, доступами и учетными записями.', to: '/users/manage', label: 'Открыть пользователей', icon: 'users' },
      { title: 'Импорт пользователей', text: 'Загрузка списков и подготовка доступов для участников.', to: '/users/import', label: 'Открыть импорт', icon: 'file' },
      { title: 'Архив проектов', text: 'Системная проверка завершенных и скрытых проектов.', to: '/projects/archive', label: 'Открыть архив', icon: 'archive' },
    ],
  },
  admin: null,
}

roleDashboardConfig.admin = roleDashboardConfig.curator

export function DashboardPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const config = roleDashboardConfig[user?.role] || roleDashboardConfig.student

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
          <h1>{config.title}</h1>
          <p>
            Добро пожаловать, <strong>{user?.full_name || user?.username}</strong>. {config.description}
          </p>
        </div>
        <div className="dashboard-role-box">
          <span className="muted-text">Роль</span>
          <strong>{formatRole(user?.role)}</strong>
        </div>
      </section>

      <section className="role-focus-grid" aria-label="Главные показатели роли">
        {config.metrics.map((item) => (
          <article className="role-focus-card" key={item.label}>
            <span className="role-focus-icon" aria-hidden="true">
              <Icon name={item.icon} size={20} />
            </span>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.hint}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-cta-grid">
        {config.actions.map((action) => (
          <article className="panel soft-panel dashboard-cta-card" key={action.to}>
            <span className="dashboard-card-icon" aria-hidden="true">
              <Icon name={action.icon} size={22} />
            </span>
            <h2>{action.title}</h2>
            <p>{action.text}</p>
            <Link className="button-link" to={action.to}>
              {action.label}
            </Link>
          </article>
        ))}
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
