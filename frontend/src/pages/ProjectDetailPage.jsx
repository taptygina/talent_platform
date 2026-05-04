import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { API_BASE_URL, apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { RichTextEditor } from '../components/RichTextEditor'
import { ToastMessage } from '../components/ToastMessage'
import { useAuth } from '../features/auth/AuthContext'
import { sanitizeRichHtml } from '../utils/html'
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

const submissionStatusLabels = {
  draft: 'Черновик',
  submitted: 'На проверке',
  needs_changes: 'Нужны доработки',
  approved: 'Принято',
}

const submissionStatusColors = {
  draft: '#b08900',
  submitted: '#2059b8',
  needs_changes: '#c0392b',
  approved: '#2b8f5f',
  none: '#7d8797',
}

function extractApiErrorMessage(error, fallbackMessage) {
  const data = error?.response?.data
  if (!data) return fallbackMessage
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail

  const collect = (value) => {
    if (!value) return []
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap((item) => collect(item))
    if (typeof value === 'object') return Object.values(value).flatMap((item) => collect(item))
    return []
  }

  const messages = collect(data).map((item) => String(item).trim()).filter(Boolean)
  return messages[0] || fallbackMessage
}

async function extractBlobErrorMessage(error, fallbackMessage) {
  const data = error?.response?.data
  if (!data) return extractApiErrorMessage(error, fallbackMessage)

  if (data instanceof Blob) {
    try {
      const text = await data.text()
      if (!text) return fallbackMessage
      const parsed = JSON.parse(text)
      if (typeof parsed?.detail === 'string' && parsed.detail.trim()) return parsed.detail
      if (typeof parsed === 'string' && parsed.trim()) return parsed
      return fallbackMessage
    } catch {
      return fallbackMessage
    }
  }

  return extractApiErrorMessage(error, fallbackMessage)
}


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
  const [projectArchiving, setProjectArchiving] = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [commentStageId, setCommentStageId] = useState('')
  const [teachers, setTeachers] = useState([])
  const [teacherSearch, setTeacherSearch] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [isEditingProject, setIsEditingProject] = useState(false)
  const [projectCoverFile, setProjectCoverFile] = useState(null)
  const [templates, setTemplates] = useState([])
  const [projectForm, setProjectForm] = useState({
    title: '',
    description: '',
    type: 'other',
    status: 'planned',
    template_id: '',
  })
  const [editState, setEditState] = useState({})
  const [submissionDrafts, setSubmissionDrafts] = useState({})
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [stageMaterialFiles, setStageMaterialFiles] = useState({})
  const [submissionFiles, setSubmissionFiles] = useState({})
  const [submissionLoading, setSubmissionLoading] = useState(false)
  const [onlyWithDebts, setOnlyWithDebts] = useState(false)
  const [editorProfile, setEditorProfile] = useState(null)
  const [toastState, setToastState] = useState({
    message: '',
    type: 'info',
    visible: false,
  })

  const canManageStages = useMemo(
    () => ['teacher', 'curator', 'admin'].includes(user?.role),
    [user?.role],
  )
  const canUploadStageMaterialsInline = user?.role === 'admin'
  const canInlineReviewSubmissions = user?.role === 'admin'
  const canEditProject = canManageStages
  const canModerateComments = useMemo(() => ['curator', 'admin'].includes(user?.role), [user?.role])
  const canPublish = canModerateComments
  const canRequestPublish = useMemo(
    () => user?.role === 'teacher' && project?.supervisor?.id === user?.id && !project?.is_published,
    [project?.is_published, project?.supervisor?.id, user?.id, user?.role],
  )
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
  const canExportDocx = useMemo(
    () =>
      ['teacher', 'curator', 'admin'].includes(user?.role) &&
      project?.status === 'done' &&
      (user?.role !== 'teacher' || project?.supervisor?.id === user?.id),
    [project?.status, project?.supervisor?.id, user?.id, user?.role],
  )
  const canExportMatrix = useMemo(
    () =>
      ['teacher', 'curator', 'admin', 'methodist'].includes(user?.role) &&
      (user?.role !== 'teacher' || project?.supervisor?.id === user?.id),
    [project?.supervisor?.id, user?.id, user?.role],
  )
  const matrixStudents = useMemo(
    () => (project?.participants || []).filter((participant) => participant.role === 'student'),
    [project?.participants],
  )

  const getMySubmission = (stage) =>
    stage?.submissions?.find((submission) => submission.student === user?.id)

  const formatSubmissionStatus = (value) => submissionStatusLabels[value] || value || '-'

  const getSubmissionForStudent = (stage, studentId) =>
    (stage?.submissions || []).find((submission) => submission.student === studentId)

  const hasDebtByStudent = (studentId) =>
    (project?.stages || []).some((stage) => {
      const submission = getSubmissionForStudent(stage, studentId)
      return !submission || submission.status !== 'approved'
    })

  const matrixStudentsFiltered = useMemo(() => {
    if (!onlyWithDebts) return matrixStudents
    return matrixStudents.filter((student) => hasDebtByStudent(student.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyWithDebts, matrixStudents, project?.stages])

  const projectLevelComments = useMemo(
    () => comments.filter((comment) => !comment.stage),
    [comments],
  )

  const stageCommentsMap = useMemo(() => {
    // Группируем комментарии по идентификатору этапа для быстрого рендера в карточках этапов.
    const map = new Map()
    comments.forEach((comment) => {
      if (!comment.stage) return
      const key = Number(comment.stage)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(comment)
    })
    return map
  }, [comments])

  const loadProject = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/`)
      setProject(data)
      setProjectForm({
        title: data.title || '',
        description: data.description || '',
        type: data.type || 'other',
        status: data.status || 'planned',
        template_id: data.template?.id ? String(data.template.id) : '',
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
    if (!canEditProject) return
    let ignore = false
    const loadTemplates = async () => {
      try {
        const { data } = await apiClient.get('/projects/templates/', {
          params: { is_active: true },
        })
        if (!ignore) {
          const rows = data?.results || data || []
          setTemplates(rows)
        }
      } catch {
        if (!ignore) setTemplates([])
      }
    }
    loadTemplates()
    return () => {
      ignore = true
    }
  }, [canEditProject])

  useEffect(() => {
    let ignore = false
    const templateId = project?.template?.id
    if (!templateId) {
      setEditorProfile(null)
      return () => {
        ignore = true
      }
    }

    const loadEditorProfile = async () => {
      try {
        const { data } = await apiClient.get(`/projects/templates/${templateId}/editor-profile/`)
        if (!ignore) setEditorProfile(data || null)
      } catch {
        if (!ignore) setEditorProfile(null)
      }
    }
    loadEditorProfile()

    return () => {
      ignore = true
    }
  }, [project?.template?.id])

  const renderRichPreview = (source) => {
    const cleanHtml = sanitizeRichHtml(source || '')
    if (!cleanHtml) return <span className="muted-text">-</span>
    return <div className="rte-preview" dangerouslySetInnerHTML={{ __html: cleanHtml }} />
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
      const { data } = await apiClient.post('/projects/comments/', {
        project: Number(projectId),
        stage: commentStageId ? Number(commentStageId) : null,
        text: commentText.trim(),
      })
      setCommentText('')
      setCommentStageId('')
      setComments((prev) => [data, ...prev])
      // Локально синхронизируем счетчик без дополнительной полной перезагрузки.
      setProject((prev) =>
        prev
          ? {
              ...prev,
              comments_count: (prev.comments_count || 0) + 1,
            }
          : prev,
      )
    } catch {
      setCommentsError('Не удалось отправить комментарий.')
    } finally {
      setCommentSubmitting(false)
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

  const onRequestPublish = async () => {
    try {
      await apiClient.post(`/projects/${projectId}/request_publish/`)
      showToast('Запрос на публикацию отправлен куратору.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось отправить запрос на публикацию.')
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
        template_id: projectForm.template_id ? Number(projectForm.template_id) : null,
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

  const onArchiveProject = async () => {
    const isConfirmed = window.confirm('Перенести проект в архив?')
    if (!isConfirmed) return

    setProjectArchiving(true)
    setError('')
    try {
      await apiClient.post(`/projects/${projectId}/archive/`)
      await loadProject()
      showToast('Проект добавлен в архив.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось архивировать проект.')
    } finally {
      setProjectArchiving(false)
    }
  }

  const openStageManagePage = () => navigate(`/projects/${projectId}/stages/manage`)
  const openStageReviewPage = () => navigate(`/stages/review?project=${projectId}`)

  const openEdit = (stage) => {
    setEditState((prev) => ({
      ...prev,
      [stage.id]: {
        title: stage.title,
        description: stage.description || '',
        task_text: stage.task_text || '',
        order: stage.order,
        deadline: stage.deadline || '',
        status: stage.status,
        student_report: stage.student_report || '',
        teacher_feedback: stage.teacher_feedback || '',
      },
    }))
  }

  const ensureStageSubmission = async (stageId) => {
    setSubmissionLoading(true)
    try {
      const { data } = await apiClient.post('/projects/stage-submissions/', {
        stage: stageId,
        submission_text: '',
      })
      setSubmissionDrafts((prev) => ({ ...prev, [data.id]: '' }))
      await loadProject()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось создать сдачу этапа.')
    } finally {
      setSubmissionLoading(false)
    }
  }

  const sendSubmissionForReview = async (submission) => {
    if (!submission) return
    const text = submissionDrafts[submission.id] ?? submission.submission_text ?? ''
    setSubmissionLoading(true)
    try {
      await apiClient.patch(`/projects/stage-submissions/${submission.id}/`, {
        submission_text: text,
      })
      await apiClient.post(`/projects/stage-submissions/${submission.id}/submit/`)
      await loadProject()
      showToast('Этап отправлен на проверку.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось отправить этап на проверку.')
    } finally {
      setSubmissionLoading(false)
    }
  }

  const reviewSubmission = async (submissionId) => {
    const draft = reviewDrafts[submissionId] || { decision: 'needs_changes', comment: '' }
    setSubmissionLoading(true)
    try {
      await apiClient.post('/projects/stage-reviews/', {
        submission: submissionId,
        decision: draft.decision,
        comment: draft.comment,
      })
      await loadProject()
      setReviewDrafts((prev) => {
        const next = { ...prev }
        delete next[submissionId]
        return next
      })
      showToast('Проверка сохранена.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось сохранить результат проверки.')
    } finally {
      setSubmissionLoading(false)
    }
  }

  const uploadStageMaterial = async (stageId) => {
    const file = stageMaterialFiles[stageId]
    if (!file) return
    setSubmissionLoading(true)
    try {
      const formData = new FormData()
      formData.append('stage', String(stageId))
      formData.append('file', file)
      await apiClient.post('/projects/stage-materials/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setStageMaterialFiles((prev) => {
        const next = { ...prev }
        delete next[stageId]
        return next
      })
      await loadProject()
      showToast('Материал этапа загружен.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось загрузить материал этапа.')
    } finally {
      setSubmissionLoading(false)
    }
  }

  const uploadSubmissionFile = async (submissionId) => {
    const file = submissionFiles[submissionId]
    if (!file) return
    setSubmissionLoading(true)
    try {
      const formData = new FormData()
      formData.append('submission', String(submissionId))
      formData.append('file', file)
      await apiClient.post('/projects/stage-submission-files/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSubmissionFiles((prev) => {
        const next = { ...prev }
        delete next[submissionId]
        return next
      })
      await loadProject()
      showToast('Файл сдачи загружен.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось загрузить файл сдачи.')
    } finally {
      setSubmissionLoading(false)
    }
  }

  const downloadNirsDocx = async () => {
    try {
      const response = await apiClient.get(`/projects/${projectId}/export-nirs-docx/`, { responseType: 'blob' })
      const blob = new Blob(
        [response.data],
        { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      )
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `nirs_project_${projectId}.docx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (requestError) {
      const message = await extractBlobErrorMessage(requestError, 'Не удалось сформировать итоговый .docx файл.')
      setError(message)
    }
  }

  const downloadMatrixXlsx = async () => {
    try {
      const response = await apiClient.get(`/projects/${projectId}/export-matrix-xlsx/`, { responseType: 'blob' })
      const blob = new Blob(
        [response.data],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      )
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `project_matrix_${projectId}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (requestError) {
      const message = await extractBlobErrorMessage(requestError, 'Не удалось сформировать .xlsx матрицу этапов.')
      setError(message)
    }
  }

  const onSaveStage = async (stageId) => {
    const draft = editState[stageId]
    if (!draft) return
    const stage = (project?.stages || []).find((item) => item.id === stageId)
    if (!stage) {
      setError('Этап не найден для обновления.')
      return
    }

    let payload = null
    if (canManageStages) {
      payload = {
        title: draft.title,
        description: draft.description || '',
        task_text: draft.task_text || '',
        order: Number(draft.order || 1),
        deadline: draft.deadline || null,
        status: draft.status,
        student_report: draft.student_report || '',
        teacher_feedback: draft.teacher_feedback || '',
      }
      const prevDeadline = stage.deadline || null
      const nextDeadline = draft.deadline || null
      if (prevDeadline !== nextDeadline) {
        payload.deadline_change_reason = 'Изменение срока этапа'
      }
    } else {
      payload = {
        student_report: draft.student_report || '',
        status: draft.status,
      }
    }

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
      setError(extractApiErrorMessage(requestError, 'Не удалось обновить этап.'))
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
              {canRequestPublish ? (
                <button type="button" onClick={onRequestPublish}>
                  Запросить публикацию
                </button>
              ) : null}
              {canExportDocx ? (
                <button type="button" onClick={downloadNirsDocx}>
                  Скачать итоговый .docx
                </button>
              ) : null}
              {canExportMatrix ? (
                <button type="button" onClick={downloadMatrixXlsx}>
                  Скачать матрицу этапов .xlsx
                </button>
              ) : null}
              {canManageStages ? (
                <button type="button" onClick={openStageManagePage}>
                  Управление этапами
                </button>
              ) : null}
              {canManageStages ? (
                <button type="button" onClick={openStageReviewPage}>
                  Проверка сдач этапов
                </button>
              ) : null}
              {canEditProject ? (
                <button type="button" onClick={() => setIsEditingProject((prev) => !prev)}>
                  {isEditingProject ? 'Отменить редактирование' : 'Редактировать проект'}
                </button>
              ) : null}
              {canEditProject ? (
                <button type="button" disabled={projectArchiving || project.is_archived} onClick={onArchiveProject}>
                  {project.is_archived ? 'В архиве' : projectArchiving ? 'Архивирование...' : 'Добавить в архив'}
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
          {project.template ? (
            <p>
              Шаблон: <strong>{project.template.name}</strong>
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
                Шаблон документа
                <select
                  value={projectForm.template_id}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, template_id: event.target.value }))}
                >
                  <option value="">Без шаблона</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
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

          <div className="quick-anchor-bar">
            <a className="button-link" href="#project-stages">
              Этапы
            </a>
            <a className="button-link" href="#project-participants">
              Участники
            </a>
          </div>
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
                  placeholder="Имя или логин"
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

        <article className="panel anchor-target" id="project-stages">
          <h2>Этапы проекта</h2>
          {error ? <p className="error">{error}</p> : null}

          {canManageStages && matrixStudents.length ? (
            <div style={{ overflowX: 'auto', marginBottom: '14px' }}>
              <h3>Матрица этапов по студентам</h3>
              <label className="checkbox-row" style={{ marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={onlyWithDebts}
                  onChange={(event) => setOnlyWithDebts(event.target.checked)}
                />
                <span>Показать только студентов с долгами по этапам</span>
              </label>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #d5dbe8' }}>Этап</th>
                    {matrixStudentsFiltered.map((student) => (
                      <th key={student.id} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #d5dbe8' }}>
                        {student.last_name || student.full_name || student.username} {student.first_name || ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(project.stages || []).map((stage) => (
                    <tr key={`matrix-${stage.id}`}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eef2f8' }}>
                        {stage.order}. {stage.title}
                      </td>
                      {matrixStudentsFiltered.map((student) => {
                        const submission = getSubmissionForStudent(stage, student.id)
                        const statusKey = submission?.status || 'none'
                        const statusText = submission ? formatSubmissionStatus(submission.status) : 'Нет сдачи'
                        return (
                          <td key={`${stage.id}-${student.id}`} style={{ padding: '8px', borderBottom: '1px solid #eef2f8' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: '999px',
                                color: '#fff',
                                backgroundColor: submissionStatusColors[statusKey] || submissionStatusColors.none,
                                fontSize: '12px',
                                fontWeight: 600,
                              }}
                            >
                              {statusText}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {onlyWithDebts && matrixStudentsFiltered.length === 0 ? (
                <p style={{ marginTop: '8px' }}>У всех студентов этапы приняты.</p>
              ) : null}
            </div>
          ) : null}

          <ul className="list">
            {project.stages?.map((stage) => {
              const stageEdit = editState[stage.id]
              const editable = false

              if (!stageEdit) {
                return (
                  <li key={stage.id} id={`stage-${stage.id}`} className="list-item">
                    <details className="stage-collapse">
                      <summary>{stage.order}. {stage.title} — {formatStageStatus(stage.status)}</summary>
                      <div style={{ marginTop: '10px' }}>
                        <p>Срок: {stage.deadline || '-'}</p>
                      {canManageStages ? (
                        <div className="toolbar-actions" style={{ marginBottom: '8px' }}>
                          <button
                            type="button"
                            onClick={() => navigate(`/stages/review?project=${projectId}&stage=${stage.id}`)}
                          >
                            Перейти к проверке этого этапа
                          </button>
                        </div>
                      ) : null}
                      {stage.task_text ? (
                        <>
                          <p>Задание:</p>
                          {renderRichPreview(stage.task_text)}
                        </>
                      ) : null}
                      {stage.student_report ? (
                        <>
                          <p>Отчет студента:</p>
                          {renderRichPreview(stage.student_report)}
                        </>
                      ) : null}
                      {stage.teacher_feedback ? (
                        <>
                          <p>Комментарий преподавателя:</p>
                          {renderRichPreview(stage.teacher_feedback)}
                        </>
                      ) : null}
                      <div className="project-form" style={{ marginTop: '10px' }}>
                        <h4>Комментарии по этапу</h4>
                        <ul className="list compact-list">
                          {(stageCommentsMap.get(stage.id) || []).map((comment) => (
                            <li key={comment.id} className="list-item">
                              <p>
                                <strong>{comment.author_name || 'Пользователь'}</strong>
                              </p>
                              <p>{comment.text}</p>
                              <p>{new Date(comment.created_at).toLocaleString('ru-RU')}</p>
                            </li>
                          ))}
                          {!(stageCommentsMap.get(stage.id) || []).length ? (
                            <li className="list-item">Комментариев по этапу пока нет.</li>
                          ) : null}
                        </ul>
                      </div>
                      <div className="project-form" style={{ marginTop: '10px' }}>
                        <h4>Материалы этапа</h4>
                        <ul className="list compact-list">
                          {(stage.materials || []).map((material) => (
                            <li key={material.id} className="list-item">
                              <a href={resolveAssetUrl(material.file)} target="_blank" rel="noreferrer">
                                Открыть файл №{material.id}
                              </a>
                            </li>
                          ))}
                          {!stage.materials?.length ? <li className="list-item">Материалов пока нет.</li> : null}
                        </ul>
                        {canUploadStageMaterialsInline ? (
                          <>
                            <FileDropZone
                              label="Добавить материал этапа"
                              file={stageMaterialFiles[stage.id] || null}
                              onFileSelect={(file) =>
                                setStageMaterialFiles((prev) => ({
                                  ...prev,
                                  [stage.id]: file,
                                }))
                              }
                            />
                            <button
                              type="button"
                              disabled={submissionLoading || !stageMaterialFiles[stage.id]}
                              onClick={() => uploadStageMaterial(stage.id)}
                            >
                              Загрузить материал
                            </button>
                          </>
                        ) : null}
                      </div>

                      {user?.role === 'student' && isParticipant ? (
                        <div className="project-form" style={{ marginTop: '10px' }}>
                          <h4>Моя сдача этапа</h4>
                          <p className="muted-text">Заполните текст и нажмите одну кнопку: «Отправить на проверку».</p>
                          {getMySubmission(stage) ? (
                            <>
                              <p>
                                Статус сдачи:{' '}
                                <strong>{formatSubmissionStatus(getMySubmission(stage).status)}</strong>
                              </p>
                              <RichTextEditor
                                value={
                                  submissionDrafts[getMySubmission(stage).id] ??
                                  getMySubmission(stage).submission_text ??
                                  ''
                                }
                                onChange={(html) =>
                                  setSubmissionDrafts((prev) => ({
                                    ...prev,
                                    [getMySubmission(stage).id]: html,
                                  }))
                                }
                                placeholder="Заполните отчет/текст по этапу"
                                defaultStyle={editorProfile?.defaults || null}
                                minHeight={220}
                              />
                              <div className="toolbar-actions">
                                <button
                                  type="button"
                                  disabled={submissionLoading}
                                  onClick={() => sendSubmissionForReview(getMySubmission(stage))}
                                >
                                  Отправить на проверку
                                </button>
                              </div>
                              <h5>Файлы сдачи</h5>
                              <ul className="list compact-list">
                                {(getMySubmission(stage).files || []).map((fileRow) => (
                                  <li key={fileRow.id} className="list-item">
                                    <a href={resolveAssetUrl(fileRow.file)} target="_blank" rel="noreferrer">
                                      Файл №{fileRow.id}
                                    </a>
                                  </li>
                                ))}
                                {!getMySubmission(stage).files?.length ? <li className="list-item">Файлы не загружены.</li> : null}
                              </ul>
                              <FileDropZone
                                label="Добавить файл к сдаче"
                                file={submissionFiles[getMySubmission(stage).id] || null}
                                onFileSelect={(file) =>
                                  setSubmissionFiles((prev) => ({
                                    ...prev,
                                    [getMySubmission(stage).id]: file,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                disabled={submissionLoading || !submissionFiles[getMySubmission(stage).id]}
                                onClick={() => uploadSubmissionFile(getMySubmission(stage).id)}
                              >
                                Загрузить файл сдачи
                              </button>
                            </>
                          ) : (
                            <button type="button" disabled={submissionLoading} onClick={() => ensureStageSubmission(stage.id)}>
                              Начать работу над этапом
                            </button>
                          )}
                        </div>
                      ) : null}

                      {canInlineReviewSubmissions ? (
                        <div className="project-form" style={{ marginTop: '10px' }}>
                          <h4>Сдачи студентов</h4>
                          {stage.submissions.map((submission) => (
                            <div key={submission.id} className="panel soft-panel">
                              <p>
                                <strong>{submission.student_name || submission.student}</strong>
                              </p>
                              <p>Статус: {formatSubmissionStatus(submission.status)}</p>
                              {renderRichPreview(submission.submission_text)}
                              <ul className="list compact-list">
                                {(submission.files || []).map((fileRow) => (
                                  <li key={fileRow.id} className="list-item">
                                    <a href={resolveAssetUrl(fileRow.file)} target="_blank" rel="noreferrer">
                                      Файл сдачи №{fileRow.id}
                                    </a>
                                  </li>
                                ))}
                                {!submission.files?.length ? <li className="list-item">Файлы не загружены.</li> : null}
                              </ul>
                              <label>
                                Решение
                                <select
                                  value={reviewDrafts[submission.id]?.decision || 'needs_changes'}
                                  onChange={(event) =>
                                    setReviewDrafts((prev) => ({
                                      ...prev,
                                      [submission.id]: {
                                        ...(prev[submission.id] || { comment: '' }),
                                        decision: event.target.value,
                                      },
                                    }))
                                  }
                                >
                                  <option value="needs_changes">Нужны доработки</option>
                                  <option value="approved">Принято</option>
                                </select>
                              </label>
                              <label>
                                Комментарий преподавателя
                                <RichTextEditor
                                  value={reviewDrafts[submission.id]?.comment || ''}
                                  onChange={(html) =>
                                    setReviewDrafts((prev) => ({
                                      ...prev,
                                      [submission.id]: {
                                        ...(prev[submission.id] || { decision: 'needs_changes' }),
                                        comment: html,
                                      },
                                    }))
                                  }
                                  placeholder="Комментарий преподавателя"
                                  defaultStyle={editorProfile?.defaults || null}
                                  minHeight={150}
                                />
                              </label>
                              <button type="button" disabled={submissionLoading} onClick={() => reviewSubmission(submission.id)}>
                                Сохранить проверку
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    </details>
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
                          Задание
                          <textarea
                            rows={2}
                            value={stageEdit.task_text}
                            onChange={(event) =>
                              setEditState((prev) => ({
                                ...prev,
                                [stage.id]: { ...prev[stage.id], task_text: event.target.value },
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

        <article className="panel">
          <h2>Комментарии</h2>
          <form className="project-form" onSubmit={onCreateComment}>
            <label>
              Комментарий к этапу (необязательно)
              <select value={commentStageId} onChange={(event) => setCommentStageId(event.target.value)}>
                <option value="">Весь проект</option>
                {(project.stages || []).map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.order}. {stage.title}
                  </option>
                ))}
              </select>
            </label>
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
              {commentSubmitting ? 'Отправка...' : 'Опубликовать комментарий'}
            </button>
          </form>

          {commentsError ? <p className="error">{commentsError}</p> : null}
          {commentsLoading ? <p>Загрузка комментариев...</p> : null}

          <h3>Комментарии руководителя по проекту</h3>
          <ul className="list">
            {projectLevelComments.map((comment) => (
              <li key={comment.id} className="list-item">
                <div>
                  <strong>{comment.author_name || 'Пользователь'}</strong>
                  <p>{comment.text}</p>
                  <p>{new Date(comment.created_at).toLocaleString('ru-RU')}</p>
                </div>
              </li>
            ))}
            {!commentsLoading && projectLevelComments.length === 0 ? (
              <li className="list-item">Комментариев по проекту пока нет.</li>
            ) : null}
          </ul>
        </article>

      </section>

      <aside className="side-column">
        <article className="panel soft-panel anchor-target" id="project-participants">
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


