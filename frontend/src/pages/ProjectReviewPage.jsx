import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiClient } from '../api/client'
import { CardGridSkeleton, EmptyState, InlineError } from '../components/InterfaceState'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectStatus, formatProjectType } from '../utils/labels'

const statusOptions = [
  { value: '', label: 'Все статусы' },
  { value: 'planned', label: 'Запланирован' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'review', label: 'На проверке' },
  { value: 'done', label: 'Завершен' },
  { value: 'cancelled', label: 'Отменен' },
]

const reviewFilterOptions = [
  { value: '', label: 'Все проекты' },
  { value: 'pending', label: 'Есть сдачи на проверке' },
  { value: 'attention', label: 'Есть доработки или долги' },
  { value: 'ready', label: 'Готовность 100%' },
]

const statusClassByValue = {
  planned: 'status-chip status-planned',
  in_progress: 'status-chip status-in-progress',
  review: 'status-chip status-review',
  done: 'status-chip status-done',
  cancelled: 'status-chip status-cancelled',
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function getDeadlineMeta(project) {
  const rawDate = project.end_date
  if (!rawDate) return { label: 'Срок проекта не задан', tone: 'neutral' }
  if (project.status === 'done') return { label: `Завершен к ${formatDate(rawDate)}`, tone: 'good' }
  if (project.status === 'cancelled') return { label: `Отменен, срок был ${formatDate(rawDate)}`, tone: 'neutral' }

  const target = new Date(rawDate)
  if (Number.isNaN(target.getTime())) return { label: 'Срок проекта не задан', tone: 'neutral' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const days = Math.ceil((target - today) / 86400000)

  if (days < 0) return { label: `Просрочка проекта ${Math.abs(days)} дн.`, tone: 'danger' }
  if (days <= 7) return { label: `До срока проекта ${days} дн.`, tone: 'warning' }
  return { label: `Срок проекта: ${formatDate(rawDate)}`, tone: 'neutral' }
}

function getSubmissionForStudent(stage, studentId) {
  return (stage?.submissions || []).find((submission) => submission.student === studentId)
}

function buildProjectSummary(project) {
  const students = (project.participants || []).filter((participant) => participant.role === 'student')
  const stages = project.stages || []
  const totalCells = students.length * stages.length
  const counts = {
    approved: 0,
    submitted: 0,
    needsChanges: 0,
    draft: 0,
    missing: 0,
  }

  students.forEach((student) => {
    stages.forEach((stage) => {
      const submission = getSubmissionForStudent(stage, student.id)
      if (!submission) counts.missing += 1
      else if (submission.status === 'approved') counts.approved += 1
      else if (submission.status === 'submitted') counts.submitted += 1
      else if (submission.status === 'needs_changes') counts.needsChanges += 1
      else counts.draft += 1
    })
  })

  const progress = totalCells ? Math.round((counts.approved / totalCells) * 100) : 0
  const nextStage = stages.find((stage) =>
    students.some((student) => {
      const submission = getSubmissionForStudent(stage, student.id)
      return !submission || submission.status !== 'approved'
    }),
  )

  let priority = 'neutral'
  let actionText = 'Открыть проект'
  let statusText = 'Работа идет по плану'
  if (counts.submitted > 0) {
    priority = 'warning'
    actionText = 'Проверить сдачи'
    statusText = `${counts.submitted} сдач ждут проверки`
  } else if (counts.needsChanges > 0) {
    priority = 'danger'
    statusText = `${counts.needsChanges} сдач требуют доработки`
  } else if (counts.missing > 0) {
    statusText = `${counts.missing} сдач еще нет`
  } else if (totalCells > 0 && progress === 100) {
    priority = 'good'
    statusText = 'Все обязательные сдачи приняты'
  }

  return {
    studentsCount: students.length,
    stagesCount: stages.length,
    totalCells,
    progress,
    nextStage,
    actionText,
    statusText,
    priority,
    ...counts,
  }
}

function getSummaryTotals(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.projects += 1
      acc.pending += row.summary.submitted
      acc.needsChanges += row.summary.needsChanges
      acc.missing += row.summary.missing
      acc.totalCells += row.summary.totalCells
      acc.approved += row.summary.approved
      return acc
    },
    { projects: 0, pending: 0, needsChanges: 0, missing: 0, totalCells: 0, approved: 0 },
  )
}

export function ProjectReviewPage() {
  const { user } = useAuth()
  const canReview = ['teacher', 'curator', 'admin'].includes(user?.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const review = searchParams.get('review') || ''

  const loadProjects = useCallback(async () => {
    if (!canReview) return
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/projects/', {
        params: {
          search: search || undefined,
          status: status || undefined,
          ordering: '-created_at',
        },
      })
      const listRows = data.results || []
      const details = await Promise.all(listRows.map((project) => apiClient.get(`/projects/${project.id}/`)))
      const nextProjects = details.map((response) => response.data)
      setProjects(
        user?.role === 'teacher'
          ? nextProjects.filter((project) => project.supervisor?.id === user.id)
          : nextProjects,
      )
    } catch {
      setProjects([])
      setError('Не удалось загрузить проекты для проверки. Повторите запрос или измените фильтры.')
    } finally {
      setLoading(false)
    }
  }, [canReview, search, status, user?.id, user?.role])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const rows = useMemo(() => {
    const withSummary = projects.map((project) => ({
      project,
      summary: buildProjectSummary(project),
      deadline: getDeadlineMeta(project),
    }))

    if (review === 'pending') return withSummary.filter((row) => row.summary.submitted > 0)
    if (review === 'attention') {
      return withSummary.filter((row) => row.summary.needsChanges > 0 || row.summary.missing > 0)
    }
    if (review === 'ready') return withSummary.filter((row) => row.summary.totalCells > 0 && row.summary.progress === 100)
    return withSummary
  }, [projects, review])

  const totals = useMemo(() => getSummaryTotals(rows), [rows])
  const totalProgress = totals.totalCells ? Math.round((totals.approved / totals.totalCells) * 100) : 0

  const updateParams = (patch) => {
    const next = { search, status, review, ...patch }
    Object.keys(next).forEach((key) => {
      if (!next[key]) delete next[key]
    })
    setSearchParams(next)
  }

  const resetFilters = () => setSearchParams({})

  if (!canReview) {
    return (
      <main className="page">
        <InlineError
          title="Проверка проектов недоступна"
          description="Доступ есть у преподавателя, куратора и администратора."
        />
      </main>
    )
  }

  return (
    <main className="page project-review-page">
      <section className="page-hero">
        <div className="page-hero-main">
          <h1>Проверка проектов</h1>
          <p className="muted-text">
            Общая готовность считается по всем участникам и этапам, поэтому куратор видит состояние проекта без длинных таблиц.
          </p>
        </div>
        <div className="page-hero-actions">
          <Link className="button-link" to="/projects">
            Все проекты
          </Link>
        </div>
      </section>

      <section className="panel project-review-summary">
        <div>
          <span className="meta-label">Общая готовность</span>
          <strong>{totalProgress}%</strong>
        </div>
        <div>
          <span className="meta-label">Проектов в выборке</span>
          <strong>{totals.projects}</strong>
        </div>
        <div>
          <span className="meta-label">Ждут проверки</span>
          <strong>{totals.pending}</strong>
        </div>
        <div>
          <span className="meta-label">Доработки и долги</span>
          <strong>{totals.needsChanges + totals.missing}</strong>
        </div>
      </section>

      <section className="panel page-controls">
        <details className="filters-collapse" open>
          <summary>Фильтры проверки</summary>
          <div className="filters-collapse-body">
            <div className="projects-filter-grid">
              <label>
                Поиск
                <input
                  placeholder="Название проекта, руководитель, описание"
                  value={search}
                  onChange={(event) => updateParams({ search: event.target.value })}
                />
              </label>
              <label>
                Статус проекта
                <select value={status} onChange={(event) => updateParams({ status: event.target.value })}>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Фокус проверки
                <select value={review} onChange={(event) => updateParams({ review: event.target.value })}>
                  {reviewFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="button-ghost" onClick={resetFilters}>
                Сбросить фильтры
              </button>
            </div>
          </div>
        </details>
      </section>

      {error ? (
        <InlineError
          title="Не удалось загрузить проекты"
          description={error}
          onRetry={loadProjects}
        />
      ) : null}

      {loading ? <CardGridSkeleton count={4} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          icon="check"
          title="Проектов для проверки нет"
          description="Это значит, что под выбранные фильтры нет проектов. Сбросьте фильтры или откройте общий список проектов."
          action={
            <>
              <button type="button" className="button-ghost" onClick={resetFilters}>
                Сбросить фильтры
              </button>
              <Link className="button-link" to="/projects">
                Все проекты
              </Link>
            </>
          }
        />
      ) : null}

      {!loading && !error && rows.length ? (
        <section className="project-review-grid">
          {rows.map(({ project, summary, deadline }) => (
            <article key={project.id} className="panel project-review-card">
              <div className="project-review-card-head">
                <div>
                  <h2>{project.title}</h2>
                  <p className="muted-text">
                    {formatProjectType(project.type)} · {project.supervisor?.full_name || project.supervisor?.username || 'Руководитель не указан'}
                  </p>
                </div>
                <span className={statusClassByValue[project.status] || 'status-chip'}>
                  {formatProjectStatus(project.status)}
                </span>
              </div>

              <div className={`critical-banner critical-${summary.priority}`}>
                <span>{summary.statusText}</span>
              </div>

              <div className="project-review-progress">
                <div className="project-review-progress-head">
                  <span>Готовность по всем участникам</span>
                  <strong>{summary.progress}%</strong>
                </div>
                <div className="stage-progress-track" aria-hidden="true">
                  <span style={{ width: `${summary.progress}%` }} />
                </div>
              </div>

              <div className="project-review-stats">
                <div>
                  <span className="meta-label">Участники</span>
                  <strong>{summary.studentsCount}</strong>
                </div>
                <div>
                  <span className="meta-label">Этапы</span>
                  <strong>{summary.stagesCount}</strong>
                </div>
                <div>
                  <span className="meta-label">Принято</span>
                  <strong>{summary.approved}</strong>
                </div>
                <div>
                  <span className="meta-label">На проверке</span>
                  <strong>{summary.submitted}</strong>
                </div>
                <div>
                  <span className="meta-label">Доработки</span>
                  <strong>{summary.needsChanges}</strong>
                </div>
                <div>
                  <span className="meta-label">Нет сдачи</span>
                  <strong>{summary.missing}</strong>
                </div>
              </div>

              <div className="project-review-context">
                <span>{deadline.label}</span>
                <span>
                  Следующий проблемный этап:{' '}
                  <strong>{summary.nextStage ? `${summary.nextStage.order}. ${summary.nextStage.title}` : 'нет'}</strong>
                </span>
              </div>

              <div className="next-action-row">
                <span>{summary.actionText}</span>
                <div className="toolbar-actions">
                  <Link className="button-link" to={`/projects/${project.id}`}>
                    Открыть проект
                  </Link>
                  {summary.submitted > 0 ? (
                    <Link className="button-link secondary-link" to={`/stages/review?project=${project.id}`}>
                      К сдачам
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  )
}
