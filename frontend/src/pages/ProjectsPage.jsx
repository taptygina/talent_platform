import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiClient } from '../api/client'
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

const projectTypeEmoji = {
  contest: '🏆',
  olympiad: '🎯',
  coursework: '📚',
  diploma: '🎓',
  other: '🧩',
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

export function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
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

        <div className="projects-filter-grid" style={{ marginTop: '16px' }}>
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

        <div className="toolbar" style={{ marginTop: '16px' }}>
          <div className="toolbar-actions">
            <button type="button" onClick={resetFilters}>
              Сбросить фильтры
            </button>
          </div>
          <p className="muted-text">
            Всего проектов: <strong>{count}</strong>
          </p>
        </div>
      </section>

      <section className="projects-cards-grid" style={{ marginTop: '24px' }}>
        {projects.map((project) => (
          <article key={project.id} className="panel project-tile">
            <div className="project-tile-head">
              <h3 className="project-tile-title">
                <span className="project-type-emoji" aria-hidden="true">
                  {projectTypeEmoji[project.type] || projectTypeEmoji.other}
                </span>{' '}
                {project.title}
              </h3>
              <span className={statusClassByValue[project.status] || 'status-chip'}>
                {formatProjectStatus(project.status)}
              </span>
            </div>

            <div className="project-meta-rows">
              <p>
                <span className="muted-text">Тип:</span> <strong>{formatProjectType(project.type)}</strong>
              </p>
              <p>
                <span className="muted-text">Команда:</span> <strong>{project.team_name || '-'}</strong>
              </p>
              <p>
                <span className="muted-text">Публикация:</span>{' '}
                <strong>{project.is_published ? 'Опубликован' : 'Не опубликован'}</strong>
              </p>
              <p>
                <span className="muted-text">Дата создания:</span> <strong>{formatDate(project.created_at)}</strong>
              </p>
            </div>

            <div className="toolbar-actions" style={{ marginTop: '8px' }}>
              <Link className="button-link" to={`/projects/${project.id}`}>
                Подробнее
              </Link>
            </div>
          </article>
        ))}
      </section>

      {loading ? <section className="panel" style={{ marginTop: '16px' }}>Загрузка проектов...</section> : null}
      {!loading && projects.length === 0 ? <section className="panel" style={{ marginTop: '16px' }}>Проекты не найдены.</section> : null}

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
