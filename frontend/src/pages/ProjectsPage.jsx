import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'
import { CardGridSkeleton, EmptyState, InlineError } from '../components/InterfaceState'
import { formatProjectStatus, formatProjectType } from '../utils/labels'

const typeOptions = [
  { value: '', label: 'Все типы' },
  { value: 'contest', label: 'Конкурс' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'coursework', label: 'Курсовой проект' },
  { value: 'diploma', label: 'Дипломный проект' },
  { value: 'other', label: 'Другое' },
]

const statusOptions = [
  { value: '', label: 'Все статусы' },
  { value: 'planned', label: 'Запланирован' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'review', label: 'На проверке' },
  { value: 'done', label: 'Завершен' },
  { value: 'cancelled', label: 'Отменен' },
]

const projectTypeIcon = {
  contest: 'star',
  olympiad: 'rocket',
  coursework: 'book',
  diploma: 'briefcase',
  other: 'grid',
}

const statusClassByValue = {
  planned: 'status-chip status-planned',
  in_progress: 'status-chip status-in-progress',
  review: 'status-chip status-review',
  done: 'status-chip status-done',
  cancelled: 'status-chip status-cancelled',
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function getDeadlineMeta(project) {
  const rawDate = project.end_date || project.start_date
  if (!rawDate) return { label: 'Срок не задан', tone: 'neutral' }
  const target = new Date(rawDate)
  if (Number.isNaN(target.getTime())) return { label: 'Срок не задан', tone: 'neutral' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const days = Math.ceil((target - today) / 86400000)
  if (project.status === 'done') return { label: `Завершен к ${formatDate(rawDate)}`, tone: 'good' }
  if (project.status === 'cancelled') return { label: `Отменен, срок был ${formatDate(rawDate)}`, tone: 'neutral' }
  if (days < 0) return { label: `Просрочка ${Math.abs(days)} дн.`, tone: 'danger' }
  if (days <= 7) return { label: `До срока ${days} дн.`, tone: 'warning' }
  return { label: `Срок: ${formatDate(rawDate)}`, tone: 'neutral' }
}

function getNextProjectAction(project) {
  if (project.status === 'planned') return 'Запустить работу'
  if (project.status === 'in_progress') return 'Проверить ближайший этап'
  if (project.status === 'review') return 'Перейти к проверке'
  if (project.status === 'done' && !project.is_published) return 'Подготовить публикацию'
  if (project.status === 'done') return 'Посмотреть результат'
  if (project.status === 'cancelled') return 'Открыть архивную карточку'
  return 'Открыть проект'
}

export function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [teams, setTeams] = useState([])
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page') || 1)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const type = searchParams.get('type') || ''
  const team = searchParams.get('team') || ''
  const startDateFrom = searchParams.get('start_date_from') || ''
  const startDateTo = searchParams.get('start_date_to') || ''

  useEffect(() => {
    let ignore = false
    const loadTeams = async () => {
      try {
        const { data } = await apiClient.get('/projects/teams/')
        if (!ignore) setTeams(data || [])
      } catch {
        if (!ignore) setTeams([])
      }
    }
    loadTeams()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    const loadProjects = async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await apiClient.get('/projects/', {
          params: {
            page,
            search: search || undefined,
            status: status || undefined,
            type: type || undefined,
            team: team || undefined,
            start_date_from: startDateFrom || undefined,
            start_date_to: startDateTo || undefined,
            ordering: '-created_at',
          },
        })
        if (!ignore) {
          setProjects(data.results ?? [])
          setCount(data.count ?? 0)
        }
      } catch {
        if (!ignore) {
          setProjects([])
          setCount(0)
          setError('Проекты не загрузились. Проверьте фильтры или повторите запрос.')
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadProjects()
    return () => {
      ignore = true
    }
  }, [page, search, status, type, team, startDateFrom, startDateTo])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / 20)), [count])

  const updateParams = (patch) => {
    const next = {
      search,
      status,
      type,
      team,
      start_date_from: startDateFrom,
      start_date_to: startDateTo,
      page: '1',
      ...patch,
    }

    Object.keys(next).forEach((key) => {
      if (!next[key]) delete next[key]
    })

    setSearchParams(next)
  }

  const resetFilters = () => setSearchParams({ page: '1' })

  const goToPage = (nextPage) => {
    setSearchParams({
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(team ? { team } : {}),
      ...(startDateFrom ? { start_date_from: startDateFrom } : {}),
      ...(startDateTo ? { start_date_to: startDateTo } : {}),
      page: String(nextPage),
    })
  }

  return (
    <main className="page">
      <section className="panel projects-header-panel">
        <div className="toolbar">
          <div>
            <h1>Проекты</h1>
            <p className="muted-text">Поиск, фильтры и работа с проектами в одном экране.</p>
          </div>
          <div className="toolbar-actions">
            <Link className="button-link" to="/projects/new">
              Создать проект
            </Link>
          </div>
        </div>

        <details className="filters-collapse" open>
          <summary>Фильтры и параметры поиска</summary>
          <div className="filters-collapse-body">
            <div className="projects-filter-grid">
              <label>
                Поиск
                <input
                  placeholder="Название, описание, руководитель"
                  value={search}
                  onChange={(e) => updateParams({ search: e.target.value })}
                />
              </label>

              <label>
                Статус
                <select value={status} onChange={(event) => updateParams({ status: event.target.value })}>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Тип проекта
                <select value={type} onChange={(event) => updateParams({ type: event.target.value })}>
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Команда
                <select value={team} onChange={(event) => updateParams({ team: event.target.value })}>
                  <option value="">Все команды</option>
                  {teams.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Начало проекта: с
                <input type="date" value={startDateFrom} onChange={(event) => updateParams({ start_date_from: event.target.value })} />
              </label>

              <label>
                Начало проекта: по
                <input type="date" value={startDateTo} onChange={(event) => updateParams({ start_date_to: event.target.value })} />
              </label>
            </div>

            <div className="toolbar">
              <div className="toolbar-actions">
                <button type="button" className="button-ghost" onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              </div>
              <p className="muted-text">
                Всего проектов: <strong>{count}</strong>
              </p>
            </div>
          </div>
        </details>
      </section>

      {error ? (
        <InlineError
          title="Не удалось загрузить проекты"
          description={error}
          onRetry={() => updateParams({})}
        />
      ) : null}

      {loading ? <CardGridSkeleton count={6} /> : null}

      {!loading && !error && projects.length ? (
        <section className="projects-cards-grid" style={{ marginTop: '24px' }}>
          {projects.map((project) => {
          const deadline = getDeadlineMeta(project)
          return (
            <article key={project.id} className="panel project-tile">
              <div className="project-card-priority">
                <div className="project-tile-head">
                  <h3 className="project-tile-title">
                    <span className="project-type-icon" aria-hidden="true">
                      <Icon name={projectTypeIcon[project.type] || projectTypeIcon.other} size={20} />
                    </span>
                    {project.title}
                  </h3>
                  <span className={statusClassByValue[project.status] || 'status-chip'}>
                    {formatProjectStatus(project.status)}
                  </span>
                </div>

                <div className={`critical-banner critical-${deadline.tone}`}>
                  <span>{deadline.label}</span>
                </div>
              </div>

              <div className="project-card-answer-grid">
                <div>
                  <span className="meta-label">Ответственный</span>
                  <strong>{project.supervisor_name || '-'}</strong>
                </div>
                <div>
                  <span className="meta-label">Команда</span>
                  <strong>{project.team_name || project.academic_group_name || '-'}</strong>
                </div>
                <div>
                  <span className="meta-label">Тип</span>
                  <strong>{formatProjectType(project.type)}</strong>
                </div>
                <div>
                  <span className="meta-label">Публикация</span>
                  <strong>{project.is_published ? 'Опубликован' : 'Не опубликован'}</strong>
                </div>
              </div>

              <div className="next-action-row">
                <span>{getNextProjectAction(project)}</span>
                <Link className="button-link" to={`/projects/${project.id}`}>
                  Подробнее
                </Link>
              </div>
            </article>
          )
          })}
        </section>
      ) : null}

      {!loading && !error && projects.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title="Проекты не найдены"
          description="Это значит, что под выбранные фильтры ничего не подходит. Сбросьте фильтры или создайте новый проект."
          action={
            <>
              <button type="button" className="button-ghost" onClick={resetFilters}>
                Сбросить фильтры
              </button>
              <Link className="button-link" to="/projects/new">
                Создать проект
              </Link>
            </>
          }
        />
      ) : null}

      <section className="panel" style={{ marginTop: '16px' }}>
        <div className="pager">
          <button disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            Назад
          </button>
          <span>
            Страница {page} из {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
            Вперед
          </button>
        </div>
      </section>
    </main>
  )
}
