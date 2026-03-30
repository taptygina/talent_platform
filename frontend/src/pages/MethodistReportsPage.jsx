import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectStatus, formatProjectType } from '../utils/labels'

export function MethodistReportsPage() {
  const { user } = useAuth()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [teacherSearch, setTeacherSearch] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canView = useMemo(() => ['methodist', 'curator', 'admin'].includes(user?.role), [user?.role])

  const loadReport = async (params = {}) => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get('/projects/methodist_report/', {
        params: {
          date_from: (params.dateFrom ?? dateFrom) || undefined,
          date_to: (params.dateTo ?? dateTo) || undefined,
          teacher_search: (params.teacherSearch ?? teacherSearch) || undefined,
          limit: 20,
        },
      })
      setData(response.data)
    } catch {
      setError('Не удалось загрузить отчеты методиста.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadReport({ dateFrom, dateTo, teacherSearch })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, teacherSearch])

  if (!canView) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>Отчеты методиста</h1>
          <p>Раздел доступен только методисту, куратору и администратору.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page analytics-sandwich-layout">
      <section className="panel">
        <h1>Отчеты методиста</h1>
        <p className="muted-text">Статистика завершенных проектов, нагрузка преподавателей и успеваемость студентов.</p>
        <div className="toolbar-actions wrap-actions">
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <input
            value={teacherSearch}
            onChange={(event) => setTeacherSearch(event.target.value)}
            placeholder="Поиск преподавателя"
          />
        </div>
      </section>

      {loading ? <section className="panel">Загрузка отчетов...</section> : null}
      {error ? <section className="panel error">{error}</section> : null}

      {data ? (
        <>
          <section className="cards-grid">
            <article className="panel soft-panel">
              <h2>Завершенные проекты</h2>
              <p>
                <strong>{data.completed_total ?? 0}</strong>
              </p>
            </article>
            <article className="panel soft-panel">
              <h2>Среднее завершенных на преподавателя</h2>
              <p>
                <strong>{data.avg_completed_by_teacher ?? 0}</strong>
              </p>
            </article>
          </section>

          <section className="data-grid">
            <article className="panel">
              <h2>Завершенные по типам</h2>
              <ul className="list">
                {(data.completed_by_type || []).map((row) => (
                  <li key={row.type} className="list-item">
                    <span>{formatProjectType(row.type)}</span>
                    <strong>{row.total}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2>Распределение по статусам</h2>
              <ul className="list">
                {(data.projects_by_status || []).map((row) => (
                  <li key={row.status} className="list-item">
                    <span>{formatProjectStatus(row.status)}</span>
                    <strong>{row.total}</strong>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="data-grid">
            <article className="panel">
              <h2>Нагрузка преподавателей</h2>
              <ul className="list">
                {(data.teacher_workload || []).map((row) => (
                  <li key={row.id} className="list-item">
                    <div>
                      <strong>
                        {row.last_name} {row.first_name} ({row.username})
                      </strong>
                      <p>Всего проектов: {row.total_projects}</p>
                    </div>
                    <strong>Завершено: {row.completed_projects}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2>Успеваемость студентов</h2>
              <ul className="list">
                {(data.student_performance || []).map((row) => (
                  <li key={row.id} className="list-item">
                    <div>
                      <strong>
                        {row.last_name} {row.first_name} ({row.username})
                      </strong>
                      <p>Группа: {row.group_name || '-'}</p>
                    </div>
                    <strong>Завершено: {row.completed_projects}</strong>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </main>
  )
}
