import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import { ToastMessage } from '../components/ToastMessage'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectStatus } from '../utils/labels'

function zoneMeta(zone) {
  if (zone === 'critical') return { tone: 'risk', label: 'Критическая' }
  if (zone === 'high') return { tone: 'review', label: 'Высокая' }
  if (zone === 'normal') return { tone: 'success', label: 'Нормальная' }
  return { tone: 'neutral', label: 'Низкая' }
}

function actionLabel(action) {
  if (action === 'reduce') return 'СНИЗИТЬ'
  if (action === 'increase') return 'ПОВЫСИТЬ'
  return '—'
}

export function TeacherWorkloadPage() {
  const { user } = useAuth()
  const canView = useMemo(() => ['methodist', 'curator', 'admin'].includes(user?.role), [user?.role])

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalBusy, setModalBusy] = useState(false)
  const [modalBusyText, setModalBusyText] = useState('')
  const [toast, setToast] = useState({ message: '', type: 'info', visible: false })

  const [modalOpen, setModalOpen] = useState(false)
  const [modalTeacherHint, setModalTeacherHint] = useState(null)
  const [sourceTeacherId, setSourceTeacherId] = useState('')
  const [targetTeacherId, setTargetTeacherId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sourceProjects, setSourceProjects] = useState([])

  const showToast = (message, type = 'info') => {
    setToast({ message, type, visible: true })
    window.setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }))
    }, 2500)
  }

  const loadReport = async (nextYear = year, nextMonth = month, silent = false) => {
    if (!silent) {
      setLoading(true)
      setModalBusy(true)
      setModalBusyText('Загружаем отчет по нагрузке преподавателей...')
    }
    setError('')
    try {
      const response = await apiClient.get('/projects/teacher_workload/', {
        params: { year: nextYear, month: nextMonth },
      })
      setData(response.data)
    } catch {
      const message = 'Не удалось загрузить отчет по нагрузке преподавателей.'
      setError(message)
      showToast(message, 'error')
    } finally {
      if (!silent) {
        setLoading(false)
        setModalBusy(false)
        setModalBusyText('')
      }
    }
  }

  useEffect(() => {
    loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadReport(year, month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const rows = data?.rows || []
  const history = data?.history || []
  const historyPeak = [...history].sort((left, right) => (right.avg_load || 0) - (left.avg_load || 0))[0]
  const workloadInsight = historyPeak?.avg_load
    ? `Пиковая средняя нагрузка была в ${historyPeak.month}: ${historyPeak.avg_load}.`
    : 'Пока нет данных для вывода по динамике.'

  const shiftMonth = (delta) => {
    const index = year * 12 + (month - 1) + delta
    setYear(Math.floor(index / 12))
    setMonth((index % 12) + 1)
  }

  const exportXlsx = async () => {
    try {
      setModalBusy(true)
      setModalBusyText('Формируем Excel-отчет...')
      const response = await apiClient.get('/projects/teacher_workload/', {
        params: { year, month, export: 'xlsx' },
        responseType: 'blob',
      })
      const blob = new Blob([response.data], { type: response.headers['content-type'] })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `otchet_nagruzka_prepodavateley_${year}_${String(month).padStart(2, '0')}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      showToast('Excel-отчет успешно сформирован.', 'info')
    } catch {
      showToast('Не удалось сформировать Excel-отчет.', 'error')
    } finally {
      setModalBusy(false)
      setModalBusyText('')
    }
  }

  const loadTeacherProjects = async (teacherId) => {
    if (!teacherId) {
      setSourceProjects([])
      return
    }
    setModalBusy(true)
    setModalBusyText('Загружаем проекты выбранного преподавателя...')
    try {
      const response = await apiClient.get('/projects/teacher_workload_projects/', {
        params: { teacher_id: teacherId },
      })
      setSourceProjects(response.data?.projects || [])
    } catch {
      setSourceProjects([])
      showToast('Не удалось загрузить список проектов преподавателя.', 'error')
    } finally {
      setModalBusy(false)
      setModalBusyText('')
    }
  }

  const openReassignModal = async (row) => {
    const isIncrease = row.action === 'increase'
    let initialSourceTeacherId = row.teacher_id
    let initialTargetTeacherId = row.teacher_id

    if (isIncrease) {
      const overloaded = rows.filter((item) => item.action === 'reduce' && item.teacher_id !== row.teacher_id)
      const availableSources = rows
        .filter((item) => item.teacher_id !== row.teacher_id && (item.active_projects || 0) > 0)
        .sort((left, right) => (right.active_projects || 0) - (left.active_projects || 0))
      initialSourceTeacherId = overloaded[0]?.teacher_id || availableSources[0]?.teacher_id || ''
      initialTargetTeacherId = row.teacher_id
    } else {
      const freeTeachers = rows
        .filter((item) => item.teacher_id !== row.teacher_id && (item.action === 'increase' || item.zone === 'normal'))
        .sort((left, right) => (left.active_projects || 0) - (right.active_projects || 0))
      initialTargetTeacherId = freeTeachers[0]?.teacher_id || ''
    }

    setModalTeacherHint(row)
    setSourceTeacherId(initialSourceTeacherId ? String(initialSourceTeacherId) : '')
    setTargetTeacherId(initialTargetTeacherId ? String(initialTargetTeacherId) : '')
    setProjectId('')
    setModalOpen(true)
    await loadTeacherProjects(initialSourceTeacherId)
  }

  const onSourceTeacherChange = async (value) => {
    setSourceTeacherId(value)
    setProjectId('')
    await loadTeacherProjects(value)
  }

  const submitReassign = async () => {
    if (!projectId || !targetTeacherId || sourceTeacherId === targetTeacherId) return
    setSaving(true)
    setModalBusy(true)
    setModalBusyText('Перераспределяем проект между преподавателями...')
    try {
      const response = await apiClient.post('/projects/teacher_workload_reassign/', {
        project_id: Number(projectId),
        target_teacher_id: Number(targetTeacherId),
      })

      const updatedProjectId = Number(projectId)
      const sourceTeacherNum = Number(sourceTeacherId)
      const targetTeacherNum = Number(targetTeacherId)

      setData((prev) => {
        if (!prev?.rows) return prev
        const nextRows = prev.rows.map((item) => {
          if (item.teacher_id === sourceTeacherNum) {
            const active = Math.max(0, (item.active_projects || 0) - 1)
            return { ...item, active_projects: active }
          }
          if (item.teacher_id === targetTeacherNum) {
            const active = (item.active_projects || 0) + 1
            return { ...item, active_projects: active }
          }
          return item
        })
        return { ...prev, rows: nextRows }
      })

      setSourceProjects((prev) => prev.filter((project) => project.id !== updatedProjectId))
      setModalOpen(false)
      setModalTeacherHint(null)
      showToast(response?.data?.detail || 'Проект успешно перераспределен.', 'info')

      await loadReport(year, month, true)
    } catch (requestError) {
      const message = requestError?.response?.data?.message || requestError?.response?.data?.detail || 'Не удалось перераспределить проект.'
      setError(String(message))
      showToast(String(message), 'error')
    } finally {
      setSaving(false)
      setModalBusy(false)
      setModalBusyText('')
    }
  }

  if (!canView) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>Нагрузка преподавателей</h1>
          <p>Раздел доступен методисту, куратору и администратору.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page analytics-sandwich-layout">
      <ToastMessage message={toast.message} type={toast.type} visible={toast.visible} />

      <section className="panel">
        <h1>Нагрузка преподавателей</h1>
        <div className="toolbar-actions wrap-actions">
          <button type="button" onClick={() => shiftMonth(-1)}>{'<'}</button>
          <strong>{`${year}-${String(month).padStart(2, '0')}`}</strong>
          <button type="button" onClick={() => shiftMonth(1)}>{'>'}</button>
          <button type="button" className="button-ghost" onClick={exportXlsx}>Экспорт в Excel</button>
        </div>
      </section>

      {loading ? <section className="panel">Загрузка отчета...</section> : null}
      {error ? <section className="panel error">{error}</section> : null}

      {data ? (
        <>
          <section className="panel soft-panel">
            <h2>Сводка</h2>
            <ul className="list">
              <li className="list-item"><span>Всего преподавателей</span><strong>{data.summary.total_teachers}</strong></li>
              <li className="list-item"><span>С перегрузкой (&gt;{data.thresholds.high_max} проектов)</span><strong>{data.summary.critical_overloaded}</strong></li>
              <li className="list-item"><span>С низкой загрузкой (до {data.thresholds.low_max} проектов)</span><strong>{data.summary.low_load}</strong></li>
              <li className="list-item"><span>Средняя нагрузка</span><strong>{data.summary.avg_load}</strong></li>
            </ul>
          </section>

          <section className="panel">
            <h2>Таблица преподавателей</h2>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Преподаватель</th>
                    <th>Активных проектов</th>
                    <th>На проверке (этапов)</th>
                    <th>Прогноз на след. месяц</th>
                    <th>Зона</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const zone = zoneMeta(row.zone)
                    const forecastLabel = `${row.forecast_next_month} (${row.forecast_delta >= 0 ? '+' : ''}${row.forecast_delta})`
                    return (
                      <tr key={row.teacher_id}>
                        <td>
                          <span className={`zone-marker zone-marker-${zone.tone}`} aria-hidden="true" />
                          {row.teacher_name}
                        </td>
                        <td>{row.active_projects}</td>
                        <td>{row.review_stages}</td>
                        <td>{forecastLabel}</td>
                        <td>{zone.label}</td>
                        <td>
                          {row.action !== 'keep' ? (
                            <button type="button" className="button-ghost" onClick={() => openReassignModal(row)}>
                              {actionLabel(row.action)}
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="chart-header">
              <div>
                <h2>Как менялась средняя нагрузка за 6 месяцев?</h2>
                <p className="muted-text">Линия показывает среднее количество активных проектов на преподавателя.</p>
              </div>
            </div>
            <div className="chart-body">
              <div className="chart-visual">
                <svg className="chart-svg" viewBox="0 0 460 220" role="img" aria-label="Динамика нагрузки преподавателей">
                  {(() => {
                    const maxValue = Math.max(1, ...history.map((row) => row.avg_load || 0))
                    const left = 28
                    const right = 430
                    const top = 24
                    const bottom = 164
                    const width = right - left
                    const step = history.length > 1 ? width / (history.length - 1) : width
                    const points = history.map((row, index) => {
                      const x = left + index * step
                      const y = bottom - ((row.avg_load || 0) / maxValue) * (bottom - top)
                      return { ...row, x, y }
                    })
                    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
                    return (
                      <>
                        <polyline fill="none" stroke="#0f766e" strokeWidth="3" points={polyline} />
                        {points.map((point) => (
                          <g key={point.month}>
                            <circle cx={point.x} cy={point.y} r="4" fill="#0f766e" />
                            <text x={point.x} y={184} textAnchor="middle" fontSize="10" fill="#40585a">{point.month.slice(2)}</text>
                          </g>
                        ))}
                      </>
                    )
                  })()}
                </svg>
              </div>
              <ul className="chart-legend" aria-label="Легенда графика">
                <li className="chart-legend-item">
                  <span className="legend-swatch" style={{ background: '#0f766e' }} />
                  <span>Средняя нагрузка</span>
                  <strong>{data.summary.avg_load}</strong>
                </li>
              </ul>
            </div>
            <p className="chart-insight">{workloadInsight}</p>
          </section>
        </>
      ) : null}

      {modalOpen ? (
        <section className="modal-backdrop" onClick={() => {
          setModalOpen(false)
          setModalTeacherHint(null)
        }}>
          <article className="panel modal-panel" onClick={(event) => event.stopPropagation()}>
            <h2>Перераспределение нагрузки</h2>
            <p className="muted-text">
              Рекомендация по строке: <strong>{modalTeacherHint?.teacher_name || '-'}</strong>
            </p>
            <div className="project-form">
              <label>
                Откуда передать проект
                <select value={sourceTeacherId} onChange={(event) => onSourceTeacherChange(event.target.value)}>
                  <option value="">Выберите преподавателя</option>
                  {rows.map((row) => (
                    <option key={row.teacher_id} value={row.teacher_id} disabled={String(row.teacher_id) === sourceTeacherId}>
                      {row.teacher_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Проект
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">Выберите проект</option>
                  {sourceProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title} ({formatProjectStatus(project.status)})
                    </option>
                  ))}
                </select>
              </label>
              {sourceTeacherId && sourceProjects.length === 0 ? (
                <p className="muted-text">У выбранного преподавателя нет активных проектов для передачи.</p>
              ) : null}
              <label>
                Кому передать
                <select value={targetTeacherId} onChange={(event) => setTargetTeacherId(event.target.value)}>
                  <option value="">Выберите преподавателя</option>
                  {rows.map((row) => (
                    <option key={row.teacher_id} value={row.teacher_id}>{row.teacher_name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="toolbar-actions wrap-actions">
              <button type="button" className="button-ghost" onClick={() => {
                setModalOpen(false)
                setModalTeacherHint(null)
              }}>Отмена</button>
              <button type="button" onClick={submitReassign} disabled={saving || !projectId || !targetTeacherId || sourceTeacherId === targetTeacherId}>
                {saving ? 'Сохранение...' : 'Применить'}
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {modalBusy ? (
        <section className="modal-backdrop modal-status-backdrop">
          <article className="panel modal-status-panel" role="status" aria-live="polite">
            <div className="loading-spinner" />
            <p>{modalBusyText || 'Выполняется операция...'}</p>
          </article>
        </section>
      ) : null}
    </main>
  )
}
