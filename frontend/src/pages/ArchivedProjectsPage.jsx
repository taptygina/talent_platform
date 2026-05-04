import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectStatus } from '../utils/labels'

export function ArchivedProjectsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canManage = ['curator', 'admin', 'teacher'].includes(user?.role)

  const loadRows = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/projects/', {
        params: {
          include_archived: true,
          is_archived: true,
          ordering: '-created_at',
        },
      })
      setRows(data.results || [])
    } catch {
      setRows([])
      setError('Не удалось загрузить архив проектов.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [])

  const restoreProject = async (projectId) => {
    try {
      await apiClient.post(`/projects/${projectId}/unarchive/`)
      await loadRows()
    } catch {
      setError('Не удалось восстановить проект из архива.')
    }
  }

  if (!canManage) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Архив проектов</h1>
          <p>Доступ только для куратора, преподавателя и администратора.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>Архив проектов</h1>
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p>Загрузка...</p> : null}

        {!loading ? (
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((project) => (
                <tr key={project.id}>
                  <td>{project.title}</td>
                  <td>{formatProjectStatus(project.status)}</td>
                  <td>{new Date(project.created_at).toLocaleString('ru-RU')}</td>
                  <td>
                    <div className="toolbar-actions">
                      <Link className="button-link" to={`/projects/${project.id}`}>
                        Редактировать
                      </Link>
                      <button type="button" onClick={() => restoreProject(project.id)}>
                        Вернуть из архива
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={4}>Архив пуст.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  )
}

