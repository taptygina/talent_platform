import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { API_BASE_URL, apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { ToastMessage } from '../components/ToastMessage'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectStatus, formatRole, formatStageStatus } from '../utils/labels'

const stageStatusOptions = [
  { value: 'open', label: 'Открыт' },
  { value: 'submitted', label: 'Сдан на проверку' },
  { value: 'changes_requested', label: 'Нужны доработки' },
  { value: 'approved', label: 'Принят' },
]

const projectTypeOptions = [
  { value: 'contest', label: 'Конкурс' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'coursework', label: 'Курсовой проект' },
  { value: 'diploma', label: 'Дипломный проект' },
  { value: 'other', label: 'Другое' },
]

const projectStatusOptions = [
  { value: 'planned', label: 'Запланирован' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'review', label: 'На проверке' },
  { value: 'done', label: 'Завершен' },
  { value: 'cancelled', label: 'Отменен' },
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

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [comments, setComments] = useState([])
  const [liked, setLiked] = useState(false)

  const [loading, setLoading] = useState(true)
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [error, setError] = useState('')
  const [commentsError, setCommentsError] = useState('')
  const [saving, setSaving] = useState(false)
  const [projectSaving, setProjectSaving] = useState(false)
  const [projectDeleting, setProjectDeleting] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [teachers, setTeachers] = useState([])
  const [teacherSearch, setTeacherSearch] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [isEditingProject, setIsEditingProject] = useState(false)
  const [projectCoverFile, setProjectCoverFile] = useState(null)
  const [projectForm, setProjectForm] = useState({
    title: '',
    description: '',
    type: 'other',
    status: 'planned',
  })
  const [newStage, setNewStage] = useState({
    title: '',
    description: '',
    order: 1,
    deadline: '',
  })
  const [editState, setEditState] = useState({})
  const [toastState, setToastState] = useState({
    message: '',
    type: 'info',
    visible: false,
  })

  const canManageStages = useMemo(
    () => ['teacher', 'curator', 'admin'].includes(user?.role),
    [user?.role],
  )
  const canEditProject = canManageStages
  const canModerateComments = useMemo(() => ['curator', 'admin'].includes(user?.role), [user?.role])
  const canPublish = canModerateComments
  const isPublishReady = useMemo(
    () => project?.status === 'done' && Boolean(project?.cover_image_url),
    [project?.cover_image_url, project?.status],
  )

  const showToast = (message, type = 'info') => {
    setToastState({ message, type, visible: true })
    setTimeout(() => setToastState((prev) => ({ ...prev, visible: false })), 2800)
    setTimeout(() => setToastState({ message: '', type: 'info', visible: false }), 3200)
  }

  const isParticipant = useMemo(
    () => Boolean(project?.participants?.some((participant) => participant.id === user?.id)),
    [project?.participants, user?.id],
  )
  const canInviteSupervisor = useMemo(() => user?.role === 'student' && isParticipant, [user?.role, isParticipant])

  const loadProject = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/`)
      setProject(data)
      setProjectForm({
        title: data.title || '',
        description: data.description || '',
        type: data.type || 'other',
        status: data.status || 'planned',
      })
    } catch {
      setError('Не удалось загрузить проект.')
    }
  }

  const loadComments = async () => {
    setCommentsLoading(true)
    setCommentsError('')
    try {
      const { data } = await apiClient.get('/projects/comments/', {
        params: {
          project: Number(projectId),
          ordering: '-created_at',
        },
      })
      setComments(data.results || [])
    } catch {
      setComments([])
      setCommentsError('Не удалось загрузить комментарии.')
    } finally {
      setCommentsLoading(false)
    }
  }

  const loadLikeState = async () => {
    try {
      const { data } = await apiClient.get('/projects/likes/', {
        params: {
          project: Number(projectId),
          user: user?.id,
        },
      })
      setLiked((data.results || []).length > 0)
    } catch {
      setLiked(false)
    }
  }

  useEffect(() => {
    let ignore = false
    const loadAll = async () => {
      setLoading(true)
      setError('')
      try {
        await Promise.all([loadProject(), loadComments(), loadLikeState()])
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadAll()
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user?.id])

  useEffect(() => {
    if (!canInviteSupervisor) return
    let ignore = false
    const loadTeachers = async () => {
      try {
        const { data } = await apiClient.get('/projects/teachers/', {
          params: { search: teacherSearch || undefined },
        })
        if (!ignore) {
          const rows = data || []
          setTeachers(rows)
          if (rows.length && !selectedTeacherId) setSelectedTeacherId(String(rows[0].id))
        }
      } catch {
        if (!ignore) setTeachers([])
      }
    }
    const timer = setTimeout(loadTeachers, 250)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [canInviteSupervisor, teacherSearch, selectedTeacherId])

  const onToggleLike = async () => {
    setLikeLoading(true)
    try {
      if (liked) await apiClient.post(`/projects/${projectId}/unlike/`)
      else await apiClient.post(`/projects/${projectId}/like/`)
      setLiked((prev) => !prev)
      await loadProject()
    } catch {
      setError('Не удалось обновить лайк.')
    } finally {
      setLikeLoading(false)
    }
  }

  const onCreateComment = async (event) => {
    event.preventDefault()
    if (!commentText.trim()) return

    setCommentSubmitting(true)
    setCommentsError('')
    try {
      await apiClient.post('/projects/comments/', {
        project: Number(projectId),
        text: commentText.trim(),
      })
      setCommentText('')
      await Promise.all([loadComments(), loadProject()])
    } catch {
      setCommentsError('Не удалось отправить комментарий.')
    } finally {
      setCommentSubmitting(false)
    }
  }

  const onApproveComment = async (commentId) => {
    try {
      await apiClient.post(`/projects/comments/${commentId}/approve/`)
      await Promise.all([loadComments(), loadProject()])
    } catch {
      setCommentsError('Не удалось подтвердить комментарий.')
    }
  }

  const onPublishProject = async () => {
    if (!isPublishReady) {
      showToast('Для публикации нужен статус «Завершен» и загруженная обложка проекта.', 'error')
      return
    }
    try {
      await apiClient.post(`/projects/${projectId}/publish/`)
      await loadProject()
      showToast('Проект успешно опубликован.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось опубликовать проект.')
    }
  }

  const onUnpublishProject = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/unpublish/`)
      await loadProject()
      showToast('Публикация проекта снята.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось снять проект с публикации.')
    }
  }

  const onSaveProject = async (event) => {
    event.preventDefault()
    setProjectSaving(true)
    setError('')
    try {
      const payload = {
        title: projectForm.title.trim(),
        description: projectForm.description,
        type: projectForm.type,
        status: projectForm.status,
      }
      if (projectCoverFile) {
        const formData = new FormData()
        formData.append('file', projectCoverFile)
        const coverResponse = await apiClient.post('/projects/upload_cover/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        payload.cover_image_url = coverResponse.data?.cover_image_url || ''
      }
      await apiClient.patch(`/projects/${projectId}/`, payload)
      await loadProject()
      setProjectCoverFile(null)
      setIsEditingProject(false)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось обновить проект.')
    } finally {
      setProjectSaving(false)
    }
  }

  const onSendSupervisorInvite = async (event) => {
    event.preventDefault()
    if (!selectedTeacherId) {
      showToast('Выберите преподавателя для приглашения.', 'error')
      return
    }
    setInviteSubmitting(true)
    try {
      await apiClient.post('/projects/supervisor-invites/', {
        project: Number(projectId),
        teacher: Number(selectedTeacherId),
        message: inviteMessage.trim(),
      })
      setInviteMessage('')
      showToast('Приглашение преподавателю отправлено.')
    } catch (requestError) {
      const detail = requestError.response?.data?.detail
      if (typeof detail === 'string') showToast(detail, 'error')
      else showToast('Не удалось отправить приглашение.', 'error')
    } finally {
      setInviteSubmitting(false)
    }
  }

  const onDeleteProject = async () => {
    const isConfirmed = window.confirm('Удалить проект? Это действие нельзя отменить.')
    if (!isConfirmed) return

    setProjectDeleting(true)
    setError('')
    try {
      await apiClient.delete(`/projects/${projectId}/`)
      navigate('/projects')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось удалить проект.')
    } finally {
      setProjectDeleting(false)
    }
  }

  const onCreateStage = async (event) => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await apiClient.post('/projects/stages/', {
        project: Number(projectId),
        title: newStage.title,
        description: newStage.description,
        order: Number(newStage.order),
        deadline: newStage.deadline || null,
        status: 'open',
      })
      setNewStage({ title: '', description: '', order: 1, deadline: '' })
      await loadProject()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось создать этап.')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (stage) => {
    setEditState((prev) => ({
      ...prev,
      [stage.id]: {
        title: stage.title,
        description: stage.description || '',
        order: stage.order,
        deadline: stage.deadline || '',
        status: stage.status,
        student_report: stage.student_report || '',
        teacher_feedback: stage.teacher_feedback || '',
      },
    }))
  }

  const onSaveStage = async (stageId) => {
    const payload = editState[stageId]
    if (!payload) return

    setError('')
    setSaving(true)
    try {
      await apiClient.patch(`/projects/stages/${stageId}/`, payload)
      await loadProject()
      setEditState((prev) => {
        const next = { ...prev }
        delete next[stageId]
        return next
      })
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось обновить этап.')
    } finally {
      setSaving(false)
    }
  }

  const onDeleteStage = async (stageId) => {
    setError('')
    setSaving(true)
    try {
      await apiClient.delete(`/projects/stages/${stageId}/`)
      await loadProject()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось удалить этап.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="page">Загрузка...</main>
  if (!project) return <main className="page">Проект не найден.</main>

  return (
    <main className="page detail-asym-layout">
      <ToastMessage message={toastState.message} type={toastState.type} visible={toastState.visible} />
      <section className="main-column">
        <article className="panel">
          <div className="toolbar">
            <h1>{project.title}</h1>
            <div className="toolbar-actions">
              <button
                type="button"
                disabled={likeLoading}
                onClick={onToggleLike}
                className={liked ? 'like-button like-button-active' : 'like-button'}
                aria-label={liked ? 'Убрать лайк' : 'Поставить лайк'}
                title={liked ? 'Убрать лайк' : 'Поставить лайк'}
              >
                <span className="heart-icon" aria-hidden="true">
                  {liked ? '♥' : '♡'}
                </span>
                <span>{project.likes_count || 0}</span>
              </button>
              {canPublish && !project.is_published ? (
                <button type="button" onClick={onPublishProject}>
                  Опубликовать проект
                </button>
              ) : null}
              {canPublish && project.is_published ? (
                <button type="button" onClick={onUnpublishProject}>
                  Снять с публикации
                </button>
              ) : null}
              {canEditProject ? (
                <button type="button" onClick={() => setIsEditingProject((prev) => !prev)}>
                  {isEditingProject ? 'Отменить редактирование' : 'Редактировать проект'}
                </button>
              ) : null}
              {canEditProject ? (
                <button type="button" disabled={projectDeleting} onClick={onDeleteProject}>
                  {projectDeleting ? 'Удаление...' : 'Удалить проект'}
                </button>
              ) : null}
            </div>
          </div>

          {project.cover_image_url ? (
            <div className="published-cover-wrap" style={{ marginBottom: '12px' }}>
              <img
                className="published-cover"
                src={resolveAssetUrl(project.cover_image_url)}
                alt={`Обложка проекта ${project.title}`}
              />
            </div>
          ) : null}

          <p>{project.description}</p>
          <p>
            Статус проекта: <strong>{formatProjectStatus(project.status)}</strong>
          </p>
          <p>
            Публикация: <strong>{project.is_published ? 'Опубликован' : 'Не опубликован'}</strong>
          </p>
          {!project.is_published && canPublish && !isPublishReady ? (
            <p className="muted-text">
              Для публикации нужен статус «Завершен» и загруженная обложка проекта.
            </p>
          ) : null}
          <p>
            Комментарии: <strong>{project.comments_count || 0}</strong>
          </p>
          <p>
            Руководитель: <strong>{project.supervisor?.full_name || project.supervisor?.username}</strong>
          </p>
          {project.academic_group_name ? (
            <p>
              Академическая группа: <strong>{project.academic_group_name}</strong>
            </p>
          ) : null}
          {project.team ? (
            <p>
              Команда: <strong>{project.team.name}</strong>
            </p>
          ) : null}

          {isEditingProject ? (
            <form className="project-form" onSubmit={onSaveProject}>
              <h2>Редактирование проекта</h2>
              <label>
                Название проекта
                <input
                  value={projectForm.title}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </label>
              <label>
                Описание
                <textarea
                  rows={3}
                  value={projectForm.description}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
              <label>
                Тип проекта
                <select
                  value={projectForm.type}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, type: event.target.value }))}
                >
                  {projectTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Статус проекта
                <select
                  value={projectForm.status}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {projectStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <FileDropZone
                label="Заменить обложку проекта"
                accept="image/*"
                hint="Перетащите новую обложку (JPG, PNG, WEBP, GIF)"
                file={projectCoverFile}
                onFileSelect={setProjectCoverFile}
              />

              <button type="submit" disabled={projectSaving}>
                {projectSaving ? 'Сохранение...' : 'Сохранить изменения проекта'}
              </button>
            </form>
          ) : null}
        </article>

        {canInviteSupervisor ? (
          <article className="panel">
            <h2>Пригласить преподавателя руководителем</h2>
            <form className="project-form" onSubmit={onSendSupervisorInvite}>
              <label>
                Поиск преподавателя
                <input
                  value={teacherSearch}
                  onChange={(event) => setTeacherSearch(event.target.value)}
                  placeholder="ФИО или логин"
                />
              </label>

              <label>
                Преподаватель
                <select
                  value={selectedTeacherId}
                  onChange={(event) => setSelectedTeacherId(event.target.value)}
                  required
                >
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.last_name} {teacher.first_name} ({teacher.username})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Комментарий к приглашению
                <textarea
                  rows={3}
                  value={inviteMessage}
                  onChange={(event) => setInviteMessage(event.target.value)}
                  placeholder="Кратко опишите проект и ожидания"
                />
              </label>

              <button type="submit" disabled={inviteSubmitting}>
                {inviteSubmitting ? 'Отправка...' : 'Отправить приглашение'}
              </button>
            </form>
          </article>
        ) : null}

        <article className="panel">
          <h2>Комментарии</h2>
          <form className="project-form" onSubmit={onCreateComment}>
            <label>
              Новый комментарий
              <textarea
                rows={3}
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Напишите комментарий по проекту"
              />
            </label>
            <button type="submit" disabled={commentSubmitting}>
              {commentSubmitting ? 'Отправка...' : 'Отправить комментарий'}
            </button>
          </form>

          {commentsError ? <p className="error">{commentsError}</p> : null}
          {commentsLoading ? <p>Загрузка комментариев...</p> : null}

          <ul className="list">
            {comments.map((comment) => (
              <li key={comment.id} className="list-item">
                <div>
                  <strong>{comment.author_name || 'Пользователь'}</strong>
                  <p>{comment.text}</p>
                  <p>{new Date(comment.created_at).toLocaleString('ru-RU')}</p>
                  <p>Статус: {comment.is_approved ? 'одобрен' : 'ожидает модерации'}</p>
                </div>
                {canModerateComments && !comment.is_approved ? (
                  <button type="button" onClick={() => onApproveComment(comment.id)}>
                    Одобрить
                  </button>
                ) : null}
              </li>
            ))}
            {!commentsLoading && comments.length === 0 ? <li className="list-item">Комментариев пока нет.</li> : null}
          </ul>
        </article>

        {canManageStages ? (
          <article className="panel">
            <h2>Создание этапа</h2>
            <form className="project-form" onSubmit={onCreateStage}>
              <label>
                Название этапа
                <input
                  value={newStage.title}
                  onChange={(event) => setNewStage((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </label>
              <label>
                Описание
                <textarea
                  rows={3}
                  value={newStage.description}
                  onChange={(event) => setNewStage((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
              <label>
                Порядковый номер
                <input
                  type="number"
                  min="1"
                  value={newStage.order}
                  onChange={(event) => setNewStage((prev) => ({ ...prev, order: Number(event.target.value || 1) }))}
                  required
                />
              </label>
              <label>
                Срок выполнения
                <input
                  type="date"
                  value={newStage.deadline}
                  onChange={(event) => setNewStage((prev) => ({ ...prev, deadline: event.target.value }))}
                />
              </label>
              <button disabled={saving} type="submit">
                {saving ? 'Сохранение...' : 'Добавить этап'}
              </button>
            </form>
          </article>
        ) : null}

        <article className="panel">
          <h2>Этапы проекта</h2>
          {error ? <p className="error">{error}</p> : null}

          <ul className="list">
            {project.stages?.map((stage) => {
              const stageEdit = editState[stage.id]
              const canStudentEdit = user?.role === 'student' && isParticipant
              const editable = canManageStages || canStudentEdit

              if (!stageEdit) {
                return (
                  <li key={stage.id} id={`stage-${stage.id}`} className="list-item">
                    <div>
                      <h3>
                        {stage.order}. {stage.title}
                      </h3>
                      <p>Статус: {formatStageStatus(stage.status)}</p>
                      <p>Срок: {stage.deadline || '-'}</p>
                      {stage.student_report ? <p>Отчет студента: {stage.student_report}</p> : null}
                      {stage.teacher_feedback ? <p>Комментарий преподавателя: {stage.teacher_feedback}</p> : null}
                    </div>
                    {editable ? (
                      <button type="button" onClick={() => openEdit(stage)}>
                        Редактировать
                      </button>
                    ) : null}
                  </li>
                )
              }

              return (
                <li key={stage.id} id={`stage-${stage.id}`} className="list-item stage-edit-item">
                  <div className="project-form">
                    {canManageStages ? (
                      <>
                        <label>
                          Название
                          <input
                            value={stageEdit.title}
                            onChange={(event) =>
                              setEditState((prev) => ({
                                ...prev,
                                [stage.id]: { ...prev[stage.id], title: event.target.value },
                              }))
                            }
                          />
                        </label>

                        <label>
                          Описание
                          <textarea
                            rows={2}
                            value={stageEdit.description}
                            onChange={(event) =>
                              setEditState((prev) => ({
                                ...prev,
                                [stage.id]: { ...prev[stage.id], description: event.target.value },
                              }))
                            }
                          />
                        </label>

                        <label>
                          Порядок
                          <input
                            type="number"
                            min="1"
                            value={stageEdit.order}
                            onChange={(event) =>
                              setEditState((prev) => ({
                                ...prev,
                                [stage.id]: { ...prev[stage.id], order: Number(event.target.value || 1) },
                              }))
                            }
                          />
                        </label>

                        <label>
                          Срок
                          <input
                            type="date"
                            value={stageEdit.deadline || ''}
                            onChange={(event) =>
                              setEditState((prev) => ({
                                ...prev,
                                [stage.id]: { ...prev[stage.id], deadline: event.target.value },
                              }))
                            }
                          />
                        </label>
                      </>
                    ) : null}

                    <label>
                      Статус
                      <select
                        value={stageEdit.status}
                        onChange={(event) =>
                          setEditState((prev) => ({
                            ...prev,
                            [stage.id]: { ...prev[stage.id], status: event.target.value },
                          }))
                        }
                      >
                        {(canManageStages
                          ? stageStatusOptions
                          : stageStatusOptions.filter((item) => ['open', 'submitted'].includes(item.value))
                        ).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Отчет студента
                      <textarea
                        rows={3}
                        value={stageEdit.student_report}
                        onChange={(event) =>
                          setEditState((prev) => ({
                            ...prev,
                            [stage.id]: { ...prev[stage.id], student_report: event.target.value },
                          }))
                        }
                      />
                    </label>

                    {canManageStages ? (
                      <label>
                        Комментарий преподавателя
                        <textarea
                          rows={3}
                          value={stageEdit.teacher_feedback}
                          onChange={(event) =>
                            setEditState((prev) => ({
                              ...prev,
                              [stage.id]: { ...prev[stage.id], teacher_feedback: event.target.value },
                            }))
                          }
                        />
                      </label>
                    ) : null}
                  </div>

                  <div className="project-form">
                    <button type="button" disabled={saving} onClick={() => onSaveStage(stage.id)}>
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditState((prev) => {
                          const next = { ...prev }
                          delete next[stage.id]
                          return next
                        })
                      }
                    >
                      Отмена
                    </button>
                    {canManageStages ? (
                      <button type="button" disabled={saving} onClick={() => onDeleteStage(stage.id)}>
                        Удалить
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </article>
      </section>

      <aside className="side-column">
        <article className="panel soft-panel">
          <h2>Участники</h2>
          <ul className="list compact-list">
            {project.participants?.map((participant) => (
              <li key={participant.id} className="list-item">
                <div>
                  <strong>{participant.full_name || participant.username}</strong>
                  <p>
                    {formatRole(participant.role)} | {participant.group_name || '-'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </aside>
    </main>
  )
}
