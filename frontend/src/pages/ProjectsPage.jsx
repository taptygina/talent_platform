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

  const resetFilters = () => {
    setSearchParams({ page: '1' })
  }

  return (
    <main className="page f-layout">
      <aside className="panel soft-panel side-filter">
        <h1>Проекты</h1>
        <p className="muted-text">Управление проектами и расширенный поиск для куратора/преподавателя.</p>

        <label>
          Поиск (название, описание, руководитель)
          <input placeholder="Введите запрос" value={search} onChange={(e) => updateParams({ search: e.target.value })} />
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

        <div className="toolbar-actions">
          <button type="button" onClick={resetFilters}>
            Сбросить фильтры
          </button>
          <Link className="button-link" to="/projects/new">
            Создать проект
          </Link>
        </div>

        <p>
          Всего проектов: <strong>{count}</strong>
        </p>
      </aside>

      <section className="panel">
        <div className="toolbar">
          <h2>Список проектов</h2>
          <span className="muted-text">Фильтрация по статусу, типу, команде и датам</span>
        </div>

        {loading ? <p>Загрузка проектов...</p> : null}

        <div className="cards-grid projects-grid">
          {projects.map((project) => (
            <article key={project.id} className="panel soft-panel project-card">
              <h3>{project.title}</h3>
              <p>
                Тип: <strong>{formatProjectType(project.type)}</strong>
              </p>
              <p>
                Статус: <strong>{formatProjectStatus(project.status)}</strong>
              </p>
              {project.academic_group_name ? <p>Учебная группа: {project.academic_group_name}</p> : null}
              {project.team_name ? <p>Команда: {project.team_name}</p> : null}
              <p>Публикация: {project.is_published ? 'Да' : 'Нет'}</p>
              <Link className="button-link" to={`/projects/${project.id}`}>
                Открыть
              </Link>
            </article>
          ))}
        </div>

        {!loading && projects.length === 0 ? <p>Проекты не найдены.</p> : null}

        <div className="pager">
          <button
            disabled={page <= 1}
            onClick={() =>
              setSearchParams({
                ...(search ? { search } : {}),
                ...(status ? { status } : {}),
                ...(type ? { type } : {}),
                ...(team ? { team } : {}),
                ...(startDateFrom ? { start_date_from: startDateFrom } : {}),
                ...(startDateTo ? { start_date_to: startDateTo } : {}),
                page: String(page - 1),
              })
            }
          >
            Назад
          </button>
          <span>
            Страница {page} из {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() =>
              setSearchParams({
                ...(search ? { search } : {}),
                ...(status ? { status } : {}),
                ...(type ? { type } : {}),
                ...(team ? { team } : {}),
                ...(startDateFrom ? { start_date_from: startDateFrom } : {}),
                ...(startDateTo ? { start_date_to: startDateTo } : {}),
                page: String(page + 1),
              })
            }
          >
            Вперед
          </button>
        </div>
      </section>
    </main>
  )
}
