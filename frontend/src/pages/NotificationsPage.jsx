import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import { formatNotificationType } from '../utils/labels'

export function NotificationsPage() {
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [onlyUnread, setOnlyUnread] = useState(false)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / 20)), [count])

  const load = async (targetPage = page, unread = onlyUnread) => {
    setLoading(true)
    try {
      const { data } = await apiClient.get('/notifications/', {
        params: {
          page: targetPage,
          ordering: '-created_at',
          ...(unread ? { is_read: false } : {}),
        },
      })
      setItems(data.results || [])
      setCount(data.count || 0)
      setPage(targetPage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1, onlyUnread)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyUnread])

  const markRead = async (id) => {
    await apiClient.post(`/notifications/${id}/mark_read/`)
    await load(page, onlyUnread)
  }

  const markAllRead = async () => {
    await apiClient.post('/notifications/mark_all_read/')
    await load(1, onlyUnread)
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="toolbar">
          <h1>Уведомления</h1>
          <div className="toolbar-actions">
            <label className="checkbox-row">
              <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
              <span>Только непрочитанные</span>
            </label>
            <button type="button" onClick={markAllRead}>
              Отметить все как прочитанные
            </button>
          </div>
        </div>

        {loading ? <p>Загрузка уведомлений...</p> : null}

        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className="list-item">
              <div>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <p>
                  {formatNotificationType(item.type)} | {new Date(item.created_at).toLocaleString('ru-RU')}
                </p>
                <p>Статус: {item.is_read ? 'прочитано' : 'непрочитано'}</p>
              </div>
              {!item.is_read ? (
                <button type="button" onClick={() => markRead(item.id)}>
                  Отметить прочитанным
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {!loading && items.length === 0 ? <p>Уведомлений не найдено.</p> : null}

        <div className="pager">
          <button disabled={page <= 1} onClick={() => load(page - 1, onlyUnread)}>
            Назад
          </button>
          <span>
            Страница {page} из {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => load(page + 1, onlyUnread)}>
            Вперед
          </button>
        </div>
      </section>
    </main>
  )
}
