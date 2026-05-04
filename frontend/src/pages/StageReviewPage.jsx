import { useEffect, useMemo, useState } from 'react'

import { API_BASE_URL, apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { sanitizeRichHtml } from '../utils/html'

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

const submissionStatusLabel = {
  draft: 'Черновик',
  submitted: 'На проверке',
  needs_changes: 'Нужны доработки',
  approved: 'Принято',
}

export function StageReviewPage() {
  const { user } = useAuth()
  const canReview = ['curator', 'admin', 'teacher'].includes(user?.role)

  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)
  const [projectId, setProjectId] = useState('')
  const [stageId, setStageId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [decision, setDecision] = useState('needs_changes')
  const [score, setScore] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const stages = useMemo(() => project?.stages || [], [project?.stages])
  const students = useMemo(
    () => (project?.participants || []).filter((item) => item.role === 'student'),
    [project?.participants],
  )
  const currentStage = useMemo(() => stages.find((stage) => stage.id === Number(stageId)), [stages, stageId])
  const stageSubmissions = useMemo(() => currentStage?.submissions || [], [currentStage?.submissions])
  const currentSubmission = useMemo(
    () => stageSubmissions.find((submission) => submission.student === Number(studentId)),
    [stageSubmissions, studentId],
  )

  useEffect(() => {
    if (!canReview) return
    let ignore = false
    const loadProjects = async () => {
      try {
        const { data } = await apiClient.get('/projects/', { params: { ordering: '-created_at' } })
        if (ignore) return
        const rows = data.results || []
        setProjects(rows)
        if (!projectId && rows.length) setProjectId(String(rows[0].id))
      } catch {
        if (!ignore) setProjects([])
      }
    }
    loadProjects()
    return () => {
      ignore = true
    }
  }, [canReview, projectId])

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      return
    }
    let ignore = false
    const loadProject = async () => {
      try {
        const { data } = await apiClient.get(`/projects/${projectId}/`)
        if (ignore) return
        setProject(data)
        if (!stageId && data.stages?.length) {
          setStageId(String(data.stages[0].id))
        } else if (stageId && !data.stages?.some((stage) => String(stage.id) === stageId)) {
          setStageId(data.stages?.[0] ? String(data.stages[0].id) : '')
        }
        if (!studentId) {
          const firstStudent = (data.participants || []).find((row) => row.role === 'student')
          setStudentId(firstStudent ? String(firstStudent.id) : '')
        }
      } catch {
        if (!ignore) {
          setProject(null)
          setError('Не удалось загрузить проект для проверки.')
        }
      }
    }
    loadProject()
    return () => {
      ignore = true
    }
  }, [projectId, stageId, studentId])

  const onSelectStudent = (nextStudentId) => {
    setStudentId(String(nextStudentId))
    setError('')
  }

  const onSubmitReview = async (event) => {
    event.preventDefault()
    if (!currentSubmission) {
      setError('Для выбранного студента нет сдачи по выбранному этапу.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await apiClient.post('/projects/stage-reviews/', {
        submission: currentSubmission.id,
        decision,
        score: score === '' ? null : Number(score),
        comment: comment.trim(),
      })
      const { data } = await apiClient.get(`/projects/${projectId}/`)
      setProject(data)
      setComment('')
      setScore('')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось сохранить проверку этапа.')
    } finally {
      setSaving(false)
    }
  }

  if (!canReview) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Проверка этапов</h1>
          <p>Доступ только для куратора, преподавателя и администратора.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page detail-asym-layout">
      <section className="main-column">
        <article className="panel">
          <h1>Проверка сдачи этапа</h1>
          <div className="project-form">
            <label>
              Проект
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Этап
              <select value={stageId} onChange={(event) => setStageId(event.target.value)}>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.order}. {stage.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <article className="panel">
          <h2>Студенты по выбранному этапу</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Студент</th>
                <th>Статус сдачи</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const submission = stageSubmissions.find((row) => row.student === student.id)
                const isActive = String(student.id) === String(studentId)
                return (
                  <tr
                    key={student.id}
                    style={isActive ? { background: '#eef4ff' } : undefined}
                  >
                    <td>{student.full_name || student.username}</td>
                    <td>{submission ? (submissionStatusLabel[submission.status] || submission.status) : 'Нет сдачи'}</td>
                    <td>
                      <button type="button" onClick={() => onSelectStudent(student.id)}>
                        Проверить
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!students.length ? (
                <tr>
                  <td colSpan={3}>В проекте нет студентов.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </article>
      </section>

      <aside className="side-column">
        <article className="panel soft-panel">
          <h2>Карточка проверки</h2>
          {error ? <p className="error">{error}</p> : null}
          {!studentId ? <p>Выберите студента для проверки.</p> : null}
          {studentId && !currentSubmission ? <p>Сдача не найдена для выбранного студента.</p> : null}
          {currentSubmission ? (
            <>
              <p>
                <strong>Студент:</strong> {students.find((item) => item.id === Number(studentId))?.full_name || studentId}
              </p>
              <p>
                <strong>Статус:</strong> {submissionStatusLabel[currentSubmission.status] || currentSubmission.status}
              </p>
              <div className="rte-preview" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(currentSubmission.submission_text || '') }} />
              <ul className="list compact-list">
                {(currentSubmission.files || []).map((fileRow) => (
                  <li key={fileRow.id} className="list-item">
                    <a href={resolveAssetUrl(fileRow.file)} target="_blank" rel="noreferrer">
                      Файл №{fileRow.id}
                    </a>
                  </li>
                ))}
                {!currentSubmission.files?.length ? <li className="list-item">Файлы не прикреплены.</li> : null}
              </ul>

              <form className="project-form" onSubmit={onSubmitReview}>
                <label>
                  Решение
                  <select value={decision} onChange={(event) => setDecision(event.target.value)}>
                    <option value="needs_changes">Нужны доработки</option>
                    <option value="approved">Принято</option>
                  </select>
                </label>
                <label>
                  Баллы (0-100)
                  <input type="number" min="0" max="100" value={score} onChange={(event) => setScore(event.target.value)} />
                </label>
                <label>
                  Комментарий к проверке
                  <textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} />
                </label>
                <button type="submit" disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить проверку'}
                </button>
              </form>
            </>
          ) : null}
        </article>
      </aside>
    </main>
  )
}
