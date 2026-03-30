import { useEffect, useState } from 'react'

import { apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectType } from '../utils/labels'

const typeOptions = [
  { value: 'contest', label: 'Конкурс' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'coursework', label: 'Курсовой проект' },
  { value: 'diploma', label: 'Дипломный проект' },
  { value: 'other', label: 'Другое' },
]

export function ProjectTemplatesPage() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [templateFile, setTemplateFile] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const [templateForm, setTemplateForm] = useState({
    name: '',
    project_type: 'coursework',
    description: '',
  })
  const [sectionForm, setSectionForm] = useState({
    title: '',
    order: 1,
    default_task: '',
  })

  const canManage = ['teacher', 'curator', 'admin'].includes(user?.role)

  const loadTemplates = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/projects/templates/', {
        params: { ordering: 'name' },
      })
      const rows = data.results || data || []
      setTemplates(rows)
      if (rows.length && !selectedTemplateId) setSelectedTemplateId(String(rows[0].id))
    } catch {
      setTemplates([])
      setError('Не удалось загрузить шаблоны.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCreateTemplate = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const formData = new FormData()
      formData.append('name', templateForm.name)
      formData.append('project_type', templateForm.project_type)
      formData.append('description', templateForm.description)
      formData.append('is_active', 'true')
      if (templateFile) formData.append('template_file', templateFile)

      await apiClient.post('/projects/templates/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setTemplateForm({ name: '', project_type: 'coursework', description: '' })
      setTemplateFile(null)
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось создать шаблон.')
    }
  }

  const onCreateSection = async (event) => {
    event.preventDefault()
    if (!selectedTemplateId) return
    setError('')
    try {
      await apiClient.post('/projects/template-sections/', {
        template: Number(selectedTemplateId),
        title: sectionForm.title,
        order: Number(sectionForm.order),
        default_task: sectionForm.default_task,
      })
      setSectionForm({ title: '', order: 1, default_task: '' })
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось создать раздел шаблона.')
    }
  }

  if (!canManage) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>Шаблоны проектов</h1>
          <p>Доступно только преподавателю, куратору и администратору.</p>
        </section>
      </main>
    )
  }

  const selectedTemplate = templates.find((item) => String(item.id) === selectedTemplateId)

  return (
    <main className="page detail-asym-layout">
      <section className="main-column">
        <article className="panel">
          <h1>Шаблоны проектов</h1>
          <p className="muted-text">Создайте шаблон и разделы, чтобы этапы подставлялись автоматически при создании проекта.</p>
        </article>

        <article className="panel">
          <h2>Новый шаблон</h2>
          <form className="project-form" onSubmit={onCreateTemplate}>
            <label>
              Название
              <input
                value={templateForm.name}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Тип проекта
              <select
                value={templateForm.project_type}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, project_type: event.target.value }))}
              >
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Описание
              <textarea
                rows={3}
                value={templateForm.description}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <FileDropZone
              label="Файл шаблона .docx (необязательно)"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hint="Система подхватит структуру и форматирование"
              file={templateFile}
              onFileSelect={setTemplateFile}
            />

            <button type="submit">Создать шаблон</button>
          </form>
        </article>

        <article className="panel">
          <h2>Разделы шаблона</h2>
          <form className="project-form" onSubmit={onCreateSection}>
            <label>
              Шаблон
              <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} required>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Название раздела
              <input
                value={sectionForm.title}
                onChange={(event) => setSectionForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                min="1"
                value={sectionForm.order}
                onChange={(event) => setSectionForm((prev) => ({ ...prev, order: Number(event.target.value || 1) }))}
                required
              />
            </label>
            <label>
              Задание по умолчанию
              <textarea
                rows={3}
                value={sectionForm.default_task}
                onChange={(event) => setSectionForm((prev) => ({ ...prev, default_task: event.target.value }))}
              />
            </label>
            <button type="submit" disabled={!selectedTemplateId}>
              Добавить раздел
            </button>
          </form>
        </article>
      </section>

      <aside className="side-column">
        <article className="panel soft-panel">
          <h2>Список шаблонов</h2>
          {loading ? <p>Загрузка...</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <ul className="list compact-list">
            {templates.map((template) => (
              <li key={template.id} className="list-item">
                <div>
                  <strong>{template.name}</strong>
                  <p>Тип: {formatProjectType(template.project_type)}</p>
                  <p>Разделов: {template.sections?.length || 0}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>

        {selectedTemplate ? (
          <article className="panel soft-panel">
            <h2>Разделы: {selectedTemplate.name}</h2>
            <ul className="list compact-list">
              {(selectedTemplate.sections || []).map((section) => (
                <li key={section.id} className="list-item">
                  <div>
                    <strong>
                      {section.order}. {section.title}
                    </strong>
                    <p>{section.default_task || '-'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </aside>
    </main>
  )
}

