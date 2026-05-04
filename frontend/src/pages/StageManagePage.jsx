import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { API_BASE_URL, apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { useAuth } from '../features/auth/AuthContext'
import { formatStageStatus } from '../utils/labels'

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

      setForm({ title: '', description: '', task_text: '', order: 1, deadline: '' })
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
          <p>Доступ только для куратора, преподавателя и администратора.</p>
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
    <main className="page detail-asym-layout">
      <section className="main-column">
        <article className="panel">
          <div className="toolbar">
            <h1>Этапы проекта: {project.title}</h1>
            <div className="toolbar-actions">
              <button type="button" onClick={() => navigate(`/stages/review?project=${projectId}`)}>
                Перейти к проверке сдач
              </button>
              <button type="button" onClick={() => navigate(`/projects/${projectId}`)}>
                Вернуться в проект
              </button>
            </div>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </article>

        <article className="panel">
          <h2>Создание этапа</h2>
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
            <label>
              Порядок
              <input type="number" min="1" value={form.order} onChange={(event) => setForm((prev) => ({ ...prev, order: Number(event.target.value || 1) }))} />
            </label>
            <label>
              Срок выполнения
              <input type="date" value={form.deadline} onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))} />
            </label>
            <FileDropZone
              label="Материал этапа от куратора"
              file={stageFile}
              onFileSelect={setStageFile}
            />
            <button type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Создать этап'}</button>
          </form>
        </article>
      </section>

      <aside className="side-column">
        <article className="panel soft-panel">
          <h2>CRUD этапов</h2>
          <ul className="list compact-list">
            {(project.stages || []).map((stage) => (
              <li key={stage.id} className="list-item">
                {editingId === stage.id ? (
                  <div className="project-form">
                    <label>
                      Название
                      <input value={editing.title} onChange={(event) => setEditing((prev) => ({ ...prev, title: event.target.value }))} />
                    </label>
                    <label>
                      Описание
                      <textarea rows={2} value={editing.description} onChange={(event) => setEditing((prev) => ({ ...prev, description: event.target.value }))} />
                    </label>
                    <label>
                      Статус
                      <select value={editing.status} onChange={(event) => setEditing((prev) => ({ ...prev, status: event.target.value }))}>
                        <option value="open">Открыт</option>
                        <option value="submitted">На проверке</option>
                        <option value="changes_requested">Нужны доработки</option>
                        <option value="approved">Принят</option>
                      </select>
                    </label>
                    <label>
                      Порядок
                      <input type="number" min="1" value={editing.order} onChange={(event) => setEditing((prev) => ({ ...prev, order: Number(event.target.value || 1) }))} />
                    </label>
                    <label>
                      Срок
                      <input type="date" value={editing.deadline || ''} onChange={(event) => setEditing((prev) => ({ ...prev, deadline: event.target.value }))} />
                    </label>
                    <div className="toolbar-actions">
                      <button type="button" disabled={saving} onClick={() => saveEdit(stage.id)}>Сохранить</button>
                      <button type="button" onClick={() => setEditingId(null)}>Отмена</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p><strong>{stage.order}. {stage.title}</strong></p>
                    <p>Статус: {formatStageStatus(stage.status)}</p>
                    <p>Срок: {stage.deadline || '-'}</p>
                    <div className="toolbar-actions">
                      <button type="button" onClick={() => startEdit(stage)}>Редактировать</button>
                      <button type="button" onClick={() => removeStage(stage.id)}>Удалить</button>
                    </div>
                    <FileDropZone
                      label="Добавить материал этапа"
                      file={materialFiles[stage.id] || null}
                      onFileSelect={(file) => setMaterialFiles((prev) => ({ ...prev, [stage.id]: file }))}
                    />
                    <button
                      type="button"
                      disabled={!materialFiles[stage.id] || saving}
                      onClick={() => uploadMaterial(stage.id)}
                    >
                      Загрузить материал
                    </button>
                    <ul className="list compact-list">
                      {(stage.materials || []).map((material) => (
                        <li key={material.id} className="list-item">
                          <a href={resolveAssetUrl(material.file)} target="_blank" rel="noreferrer">
                            Файл №{material.id}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            ))}
            {!project.stages?.length ? <li className="list-item">Этапы пока не добавлены.</li> : null}
          </ul>
        </article>
      </aside>
    </main>
  )
}
