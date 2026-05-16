import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { API_BASE_URL, apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { useAuth } from '../features/auth/AuthContext'
import { formatStageStatus } from '../utils/labels'

const stageStatusOptions = [
  { value: 'open', label: 'Открыт' },
  { value: 'submitted', label: 'На проверке' },
  { value: 'changes_requested', label: 'Нужны доработки' },
  { value: 'approved', label: 'Принят' },
]

const stageStatusClassByValue = {
  open: 'status-chip status-planned',
  submitted: 'status-chip status-review',
  changes_requested: 'status-chip status-cancelled',
  approved: 'status-chip status-done',
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

function formatDate(value) {
  if (!value) return 'Срок не задан'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Срок не задан'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function StageManagePage() {
  const { user } = useAuth()
  const { projectId } = useParams()
  const navigate = useNavigate()

  const canManage = ['curator', 'admin', 'teacher'].includes(user?.role)
  const [project, setProject] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [stageFile, setStageFile] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    task_text: '',
    order: 1,
    deadline: '',
  })
  const [editingId, setEditingId] = useState(null)
  const [editing, setEditing] = useState({})
  const [materialFiles, setMaterialFiles] = useState({})

  const stages = useMemo(
    () => [...(project?.stages || [])].sort((left, right) => (left.order || 0) - (right.order || 0)),
    [project?.stages],
  )

  const loadProject = async () => {
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/`)
      setProject(data)
    } catch {
      setProject(null)
      setError('Не удалось загрузить проект.')
    }
  }

  useEffect(() => {
    if (!canManage) return
    loadProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, canManage])

  const createStage = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data } = await apiClient.post('/projects/stages/', {
        project: Number(projectId),
        title: form.title.trim(),
        description: form.description,
        task_text: form.task_text,
        order: Number(form.order || 1),
        deadline: form.deadline || null,
        status: 'open',
      })

      if (stageFile && data?.id) {
        const materialForm = new FormData()
        materialForm.append('stage', String(data.id))
        materialForm.append('file', stageFile)
        await apiClient.post('/projects/stage-materials/', materialForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      setForm({ title: '', description: '', task_text: '', order: stages.length + 2, deadline: '' })
      setStageFile(null)
      await loadProject()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось создать этап.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (stage) => {
    setEditingId(stage.id)
    setEditing({
      title: stage.title,
      description: stage.description || '',
      task_text: stage.task_text || '',
      order: stage.order,
      deadline: stage.deadline || '',
      status: stage.status,
    })
  }

  const saveEdit = async (stageId) => {
    setSaving(true)
    setError('')
    try {
      await apiClient.patch(`/projects/stages/${stageId}/`, {
        title: editing.title,
        description: editing.description,
        task_text: editing.task_text,
        order: Number(editing.order || 1),
        deadline: editing.deadline || null,
        status: editing.status,
      })
      setEditingId(null)
      setEditing({})
      await loadProject()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось обновить этап.')
    } finally {
      setSaving(false)
    }
  }

  const removeStage = async (stageId) => {
    const ok = window.confirm('Удалить этап?')
    if (!ok) return
    setSaving(true)
    setError('')
    try {
      await apiClient.delete(`/projects/stages/${stageId}/`)
      await loadProject()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось удалить этап.')
    } finally {
      setSaving(false)
    }
  }

  const uploadMaterial = async (stageId) => {
    const file = materialFiles[stageId]
    if (!file) return
    setSaving(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('stage', String(stageId))
      formData.append('file', file)
      await apiClient.post('/projects/stage-materials/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMaterialFiles((prev) => ({ ...prev, [stageId]: null }))
      await loadProject()
    } catch {
      setError('Не удалось загрузить материал этапа.')
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Управление этапами</h1>
          <p>Доступ есть у куратора, преподавателя и администратора.</p>
        </section>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Управление этапами</h1>
          <p>{error || 'Загрузка...'}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page stage-manage-page">
      <section className="panel stage-manage-hero">
        <div>
          <span className="meta-label">Этапы проекта</span>
          <h1>{project.title}</h1>
          <p className="muted-text">Создание, редактирование и материалы этапов в одном рабочем пространстве.</p>
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={() => navigate(`/stages/review?project=${projectId}`)}>
            Проверка сдач
          </button>
          <button type="button" className="button-ghost" onClick={() => navigate(`/projects/${projectId}`)}>
            К проекту
          </button>
        </div>
      </section>

      {error ? <section className="panel error">{error}</section> : null}

      <section className="stage-manage-layout">
        <article className="panel stage-create-panel">
          <h2>Новый этап</h2>
          <form className="project-form" onSubmit={createStage}>
            <label>
              Название
              <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required />
            </label>
            <label>
              Описание
              <textarea rows={2} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </label>
            <label>
              Задание
              <textarea rows={3} value={form.task_text} onChange={(event) => setForm((prev) => ({ ...prev, task_text: event.target.value }))} />
            </label>
            <div className="stage-form-row">
              <label>
                Порядок
                <input type="number" min="1" value={form.order} onChange={(event) => setForm((prev) => ({ ...prev, order: Number(event.target.value || 1) }))} />
              </label>
              <label>
                Срок
                <input type="date" value={form.deadline} onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))} />
              </label>
            </div>
            <FileDropZone
              label="Материал этапа"
              hint="Можно добавить файл сразу при создании этапа."
              file={stageFile}
              onFileSelect={setStageFile}
            />
            <button type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : 'Создать этап'}
            </button>
          </form>
        </article>

        <article className="panel stage-list-panel">
          <div className="toolbar">
            <div>
              <h2>Этапы</h2>
              <p className="muted-text">Всего этапов: {stages.length}</p>
            </div>
          </div>

          <div className="manage-stage-list">
            {stages.map((stage) => (
              <article key={stage.id} className="manage-stage-card">
                {editingId === stage.id ? (
                  <div className="project-form manage-stage-edit">
                    <div className="stage-form-row">
                      <label>
                        Название
                        <input value={editing.title} onChange={(event) => setEditing((prev) => ({ ...prev, title: event.target.value }))} />
                      </label>
                      <label>
                        Статус
                        <select value={editing.status} onChange={(event) => setEditing((prev) => ({ ...prev, status: event.target.value }))}>
                          {stageStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Описание
                      <textarea rows={2} value={editing.description} onChange={(event) => setEditing((prev) => ({ ...prev, description: event.target.value }))} />
                    </label>
                    <label>
                      Задание
                      <textarea rows={3} value={editing.task_text} onChange={(event) => setEditing((prev) => ({ ...prev, task_text: event.target.value }))} />
                    </label>
                    <div className="stage-form-row">
                      <label>
                        Порядок
                        <input type="number" min="1" value={editing.order} onChange={(event) => setEditing((prev) => ({ ...prev, order: Number(event.target.value || 1) }))} />
                      </label>
                      <label>
                        Срок
                        <input type="date" value={editing.deadline || ''} onChange={(event) => setEditing((prev) => ({ ...prev, deadline: event.target.value }))} />
                      </label>
                    </div>
                    <div className="toolbar-actions">
                      <button type="button" disabled={saving} onClick={() => saveEdit(stage.id)}>
                        Сохранить
                      </button>
                      <button type="button" className="button-ghost" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="manage-stage-card-head">
                      <div className="manage-stage-title">
                        <span className="manage-stage-number">{stage.order}</span>
                        <div>
                          <h3>{stage.title}</h3>
                          <p className="muted-text">{stage.description || 'Описание не заполнено'}</p>
                        </div>
                      </div>
                      <div className="manage-stage-actions">
                        <button type="button" onClick={() => startEdit(stage)}>
                          Редактировать
                        </button>
                        <button type="button" className="button-danger" onClick={() => removeStage(stage.id)}>
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="manage-stage-meta">
                      <span className={stageStatusClassByValue[stage.status] || 'status-chip'}>
                        {formatStageStatus(stage.status)}
                      </span>
                      <span className="status-chip status-planned">Срок: {formatDate(stage.deadline)}</span>
                      <span className="status-chip status-planned">Материалы: {(stage.materials || []).length}</span>
                    </div>

                    <div className="manage-stage-materials">
                      <FileDropZone
                        label="Добавить материал"
                        file={materialFiles[stage.id] || null}
                        onFileSelect={(file) => setMaterialFiles((prev) => ({ ...prev, [stage.id]: file }))}
                      />
                      <button
                        type="button"
                        disabled={!materialFiles[stage.id] || saving}
                        onClick={() => uploadMaterial(stage.id)}
                      >
                        Загрузить
                      </button>
                    </div>

                    {(stage.materials || []).length ? (
                      <div className="manage-stage-files">
                        {(stage.materials || []).map((material) => (
                          <a key={material.id} href={resolveAssetUrl(material.file)} target="_blank" rel="noreferrer">
                            Файл №{material.id}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </article>
            ))}
            {!stages.length ? <p className="muted-text">Этапы пока не добавлены.</p> : null}
          </div>
        </article>
      </section>
    </main>
  )
}
