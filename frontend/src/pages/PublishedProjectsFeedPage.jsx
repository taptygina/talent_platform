import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { API_BASE_URL, apiClient } from '../api/client'
import { formatProjectType } from '../utils/labels'

const typeOptions = [
  { value: '', label: 'Все типы' },
  { value: 'contest', label: 'Конкурс' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'coursework', label: 'Курсовой проект' },
  { value: 'diploma', label: 'Дипломный проект' },
  { value: 'other', label: 'Другое' },
]

function resolveAssetUrl(url) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  try {
    const origin = new URL(API_BASE_URL).origin
    if (url.startsWith('/')) return `${origin}${url}`
    return `${origin}/${url}`
  } catch {
    return url
  }
}

export function PublishedProjectsFeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page') || 1)
  const search = searchParams.get('search') || ''
  const type = searchParams.get('type') || ''

  const [projects, setProjects] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [commentsMap, setCommentsMap] = useState({})
  const [commentInputs, setCommentInputs] = useState({})
  const [commentSubmittingByProject, setCommentSubmittingByProject] = useState({})

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / 20)), [count])

  const loadProjects = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/projects/', {
        params: {
          page,
          search,
          type: type || undefined,
          is_published: true,
          ordering: '-created_at',
        },
      })
      setProjects(data.results || [])
      setCount(data.count || 0)
    } catch {
      setProjects([])
      setError('Не удалось загрузить ленту опубликованных проектов.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, type])

  const updateProjectInList = (projectId, patch) => {
    setProjects((prev) => prev.map((project) => (project.id === projectId ? { ...project, ...patch } : project)))
  }

  const onToggleLike = async (project) => {
    const liked = Boolean(project.liked_by_me)
    try {
      if (liked) await apiClient.post(`/projects/${project.id}/unlike/`)
      else await apiClient.post(`/projects/${project.id}/like/`)

      updateProjectInList(project.id, {
        liked_by_me: !liked,
        likes_count: Math.max(0, (project.likes_count || 0) + (liked ? -1 : 1)),
      })
    } catch {
      setError('Не удалось обновить лайк.')
    }
  }

  const loadComments = async (projectId) => {
    setCommentsMap((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || {}),
        loading: true,
        error: '',
      },
    }))

    try {
      const { data } = await apiClient.get('/projects/comments/', {
        params: {
          project: projectId,
          ordering: '-created_at',
        },
      })
      setCommentsMap((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          loading: false,
          error: '',
          items: data.results || [],
          open: true,
        },
      }))
    } catch {
      setCommentsMap((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          loading: false,
          error: 'Не удалось загрузить комментарии.',
          items: [],
          open: true,
        },
      }))
    }
  }

  const toggleComments = async (projectId) => {
    const current = commentsMap[projectId]
    if (!current?.open) {
      if (!current?.items) {
        await loadComments(projectId)
      } else {
        setCommentsMap((prev) => ({
          ...prev,
          [projectId]: {
            ...prev[projectId],
            open: true,
          },
        }))
      }
    } else {
      setCommentsMap((prev) => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          open: false,
        },
      }))
    }
  }

  const onSubmitComment = async (event, projectId) => {
    event.preventDefault()
    const text = (commentInputs[projectId] || '').trim()
    if (!text) return

    setCommentSubmittingByProject((prev) => ({ ...prev, [projectId]: true }))
    try {
      await apiClient.post('/projects/comments/', {
        project: projectId,
        text,
      })
      setCommentInputs((prev) => ({ ...prev, [projectId]: '' }))
      await loadComments(projectId)
      updateProjectInList(projectId, {
        comments_count: (projects.find((item) => item.id === projectId)?.comments_count || 0) + 1,
      })
    } catch {
      setCommentsMap((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          error: 'Не удалось отправить комментарий.',
          open: true,
        },
      }))
    } finally {
      setCommentSubmittingByProject((prev) => ({ ...prev, [projectId]: false }))
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="toolbar">
          <h1>Лента опубликованных проектов</h1>
          <p className="muted-text">Только проекты со статусом «Завершен», которые опубликованы куратором.</p>
        </div>

        <div className="toolbar-actions wrap-actions" style={{ marginTop: '12px' }}>
          <input
            placeholder="Поиск по названию или описанию"
            value={search}
            onChange={(event) =>
              setSearchParams({
                search: event.target.value,
                type,
                page: '1',
              })
            }
          />

          <select
            value={type}
            onChange={(event) =>
              setSearchParams({
                search,
                type: event.target.value,
                page: '1',
              })
            }
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <section className="panel"><p className="error">{error}</p></section> : null}
      {loading ? <section className="panel"><p>Загрузка проектов...</p></section> : null}

      {!loading ? (
        <section className="cards-grid">
          {projects.map((project) => {
            const commentsState = commentsMap[project.id] || {}
            const comments = commentsState.items || []

            return (
              <article key={project.id} className="panel soft-panel published-card">
                <div className="published-cover-wrap">
                  {project.cover_image_url ? (
                    <img
                      className="published-cover"
                      src={resolveAssetUrl(project.cover_image_url)}
                      alt={`Обложка проекта ${project.title}`}
                    />
                  ) : (
                    <div className="published-cover published-cover-placeholder">Нет обложки</div>
                  )}
                </div>

                <h2>{project.title}</h2>
                <p className="muted-text">Тип: {formatProjectType(project.type)}</p>
                <p>Участников: {project.participants_count || 0}</p>

                <div className="toolbar-actions">
                  <button
                    type="button"
                    onClick={() => onToggleLike(project)}
                    className={project.liked_by_me ? 'like-button like-button-active' : 'like-button'}
                    aria-label={project.liked_by_me ? 'Убрать лайк' : 'Поставить лайк'}
                  >
                    <span className="heart-icon" aria-hidden="true">
                      {project.liked_by_me ? '♥' : '♡'}
                    </span>
                    <span>{project.likes_count || 0}</span>
                  </button>

                  <button type="button" onClick={() => toggleComments(project.id)}>
                    Комментарии ({project.comments_count || 0})
                  </button>

                  <Link className="button-link" to={`/projects/${project.id}`}>
                    Открыть проект
                  </Link>
                </div>

                {commentsState.open ? (
                  <div className="feed-comments-block">
                    <form className="project-form" onSubmit={(event) => onSubmitComment(event, project.id)}>
                      <label>
                        Добавить комментарий
                        <textarea
                          rows={2}
                          value={commentInputs[project.id] || ''}
                          onChange={(event) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [project.id]: event.target.value,
                            }))
                          }
                          placeholder="Ваш комментарий"
                        />
                      </label>
                      <button type="submit" disabled={Boolean(commentSubmittingByProject[project.id])}>
                        {commentSubmittingByProject[project.id] ? 'Отправка...' : 'Отправить'}
                      </button>
                    </form>

                    {commentsState.loading ? <p>Загрузка комментариев...</p> : null}
                    {commentsState.error ? <p className="error">{commentsState.error}</p> : null}

                    <ul className="list compact-list">
                      {comments.map((comment) => (
                        <li key={comment.id} className="list-item">
                          <div>
                            <strong>{comment.author_name || 'Пользователь'}</strong>
                            <p>{comment.text}</p>
                            <p>{new Date(comment.created_at).toLocaleString('ru-RU')}</p>
                          </div>
                        </li>
                      ))}

                      {!commentsState.loading && comments.length === 0 ? (
                        <li className="list-item">Комментариев пока нет.</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </article>
            )
          })}

          {projects.length === 0 ? <article className="panel">Опубликованные проекты не найдены.</article> : null}
        </section>
      ) : null}

      <section className="panel">
        <div className="pager">
          <button
            disabled={page <= 1}
            onClick={() =>
              setSearchParams({
                search,
                type,
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
                search,
                type,
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
