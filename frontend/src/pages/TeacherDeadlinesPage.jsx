import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectStatus, formatStageStatus } from '../utils/labels'

export function TeacherDeadlinesPage() {
  const { user } = useAuth()
  const [days, setDays] = useState(14)
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canView = ['teacher', 'curator', 'admin'].includes(user?.role)

  useEffect(() => {
    if (!canView) return
    let ignore = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await apiClient.get('/projects/teacher_deadlines/', {
          params: { days },
        })
        if (!ignore) {
          setItems(data.items || [])
          setCount(data.count || 0)
        }
      } catch {
        if (!ignore) setError('Не удалось загрузить календарь дедлайнов.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [days, canView])

  if (!canView) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>Календарь дедлайнов</h1>
          <p>Раздел доступен преподавателю, куратору и администратору.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>Календарь дедлайнов</h1>
        <p className="muted-text">Ближайшие сроки этапов по проектам для контроля и проверки.</p>
        <div className="toolbar-actions">
          <label>
            Период, дней
            <input type="number" min="1" max="90" value={days} onChange={(event) => setDays(Number(event.target.value || 14))} />
          </label>
        </div>
        <p>
          Найдено этапов: <strong>{count}</strong>
        </p>
        {loading ? <p>Загрузка...</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel">
        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className="list-item">
              <div>
                <strong>
                  {item.order}. {item.title}
                </strong>
                <p>Проект: {item.project__title}</p>
                <p>Статус этапа: {formatStageStatus(item.status)}</p>
                <p>Статус проекта: {formatProjectStatus(item.project__status)}</p>
                <p>Срок: {item.deadline ? new Date(item.deadline).toLocaleDateString('ru-RU') : '-'}</p>
              </div>
              <Link className="button-link" to={`/projects/${item.project_id}#stage-${item.id}`}>
                Открыть этап
              </Link>
            </li>
          ))}
          {!loading && items.length === 0 ? <li className="list-item">Ближайших дедлайнов нет.</li> : null}
        </ul>
      </section>
    </main>
  )
}
