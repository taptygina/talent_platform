import { useEffect, useState } from 'react'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'

function formatStatus(status) {
  if (status === 'pending') return 'Ожидает ответа'
  if (status === 'accepted') return 'Принято'
  if (status === 'declined') return 'Отклонено'
  return status
}

export function SupervisorInvitesPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/projects/supervisor-invites/', {
        params: { ordering: '-created_at' },
      })
      setItems(data.results || data || [])
    } catch {
      setError('Не удалось загрузить приглашения.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const acceptInvite = async (id) => {
    try {
      await apiClient.post(`/projects/supervisor-invites/${id}/accept/`)
      await load()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось принять приглашение.')
    }
  }

  const declineInvite = async (id) => {
    try {
      await apiClient.post(`/projects/supervisor-invites/${id}/decline/`)
      await load()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось отклонить приглашение.')
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>Приглашения руководителя проекта</h1>
        <p className="muted-text">
          {user?.role === 'teacher'
            ? 'Здесь вы можете принять или отклонить приглашение стать руководителем проекта.'
            : 'История отправленных приглашений руководителю.'}
        </p>

        {error ? <p className="error">{error}</p> : null}
        {loading ? <p>Загрузка...</p> : null}

        <ul className="list">
          {items.map((invite) => (
            <li key={invite.id} className="list-item">
              <div>
                <strong>{invite.project_title}</strong>
                <p>Студент: {invite.student_name || invite.student}</p>
                <p>Преподаватель: {invite.teacher_name || invite.teacher}</p>
                {invite.message ? <p>Комментарий: {invite.message}</p> : null}
                <p>Статус: {formatStatus(invite.status)}</p>
                <p>Отправлено: {new Date(invite.created_at).toLocaleString('ru-RU')}</p>
              </div>

              {user?.role === 'teacher' && invite.status === 'pending' ? (
                <div className="project-form">
                  <button type="button" onClick={() => acceptInvite(invite.id)}>
                    Принять
                  </button>
                  <button type="button" onClick={() => declineInvite(invite.id)}>
                    Отклонить
                  </button>
                </div>
              ) : null}
            </li>
          ))}

          {!loading && items.length === 0 ? <li className="list-item">Приглашений пока нет.</li> : null}
        </ul>
      </section>
    </main>
  )
}
