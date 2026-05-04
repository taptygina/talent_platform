import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectType } from '../utils/labels'

const typeOptions = [
  { value: 'contest', label: '\u041a\u043e\u043d\u043a\u0443\u0440\u0441' },
  { value: 'olympiad', label: '\u041e\u043b\u0438\u043c\u043f\u0438\u0430\u0434\u0430' },
  { value: 'coursework', label: '\u041a\u0443\u0440\u0441\u043e\u0432\u043e\u0439 \u043f\u0440\u043e\u0435\u043a\u0442' },
  { value: 'diploma', label: '\u0414\u0438\u043f\u043b\u043e\u043c\u043d\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442' },
  { value: 'other', label: '\u0414\u0440\u0443\u0433\u043e\u0435' },
]


const SECTION_NUMBER_RE = /^\d+(?:\.\d+)*$/

function parseSectionNumber(value) {
  const raw = String(value || '').trim().replace(',', '.')
  if (!SECTION_NUMBER_RE.test(raw)) return null
  const parts = raw.split('.').map((part) => Number(part))
  if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 999)) return null
  let sortKey = 0
  for (const p of parts) {
    sortKey = sortKey * 1000 + p
  }
  return { raw, sortKey }
}

function extractSectionNumberFromTitle(title, fallback = '1') {
  const text = String(title || '').trim()
  const match = text.match(/^(\d+(?:\.\d+)*)\s+/)
  return match ? match[1] : String(fallback || '1')
}

function ensureTitleHasSectionNumber(title, sectionNumber) {
  const base = String(title || '').trim().replace(/^(\d+(?:\.\d+)*)\s+/, '')
  return base ? (sectionNumber + ' ' + base) : sectionNumber
}
export function ProjectTemplatesPage() {
  const { user } = useAuth()
  const canManage = ['teacher', 'curator', 'admin'].includes(user?.role)

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState(null)

  const [templateFile, setTemplateFile] = useState(null)
  const [editTemplateFile, setEditTemplateFile] = useState(null)

  const [previewTitles, setPreviewTitles] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const [templateForm, setTemplateForm] = useState({
    name: '',
    project_type: 'coursework',
    description: '',
  })

  const [editTemplateForm, setEditTemplateForm] = useState({
    name: '',
    project_type: 'coursework',
    description: '',
    is_active: true,
  })

  const [sectionForm, setSectionForm] = useState({
    title: '',
    order: '1',
    default_task: '',
  })

  const [editingSectionId, setEditingSectionId] = useState(null)
  const [sectionEditForm, setSectionEditForm] = useState({
    title: '',
    order: '1',
    default_task: '',
  })

  const selectedTemplate = useMemo(
    () => templates.find((item) => String(item.id) === selectedTemplateId),
    [templates, selectedTemplateId],
  )

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
      if (!rows.length) setSelectedTemplateId('')
    } catch {
      setTemplates([])
      setError('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d\u044b.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedTemplate) return
    setEditTemplateForm({
      name: selectedTemplate.name || '',
      project_type: selectedTemplate.project_type || 'coursework',
      description: selectedTemplate.description || '',
      is_active: Boolean(selectedTemplate.is_active),
    })
    setEditTemplateFile(null)
    setEditingSectionId(null)
    setSectionEditForm({ title: '', order: '1', default_task: '' })
  }, [selectedTemplate])

  const onTemplateFileChange = (file) => {
    setTemplateFile(file)
    setPreviewTitles([])
    setError('')
  }

  const onCancelPreview = () => {
    setPreviewTitles([])
    setPreviewLoading(false)
    setError('')
  }

  const onClearTemplateFile = () => {
    setTemplateFile(null)
    setPreviewTitles([])
    setError('')
  }
  const onCreateTemplate = async (event) => {
    event.preventDefault()
    setError('')
    if (!templateFile) {      setError('\u041d\u0435\u043b\u044c\u0437\u044f \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0443\u0441\u0442\u043e\u0439 \u0448\u0430\u0431\u043b\u043e\u043d. \u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 .docx \u0444\u0430\u0439\u043b.')
      return
    }
    try {
      const formData = new FormData()
      formData.append('name', templateForm.name)
      formData.append('project_type', templateForm.project_type)
      formData.append('description', templateForm.description)
      formData.append('is_active', 'true')
      formData.append('template_file', templateFile)

      await apiClient.post('/projects/templates/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setTemplateForm({ name: '', project_type: 'coursework', description: '' })
      setTemplateFile(null)
      setPreviewTitles([])
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d.')
    }
  }

  const onUpdateTemplate = async (event) => {
    event.preventDefault()
    if (!selectedTemplateId) return

    setError('')
    setActionLoadingId(selectedTemplateId)
    try {
      const formData = new FormData()
      formData.append('name', editTemplateForm.name)
      formData.append('project_type', editTemplateForm.project_type)
      formData.append('description', editTemplateForm.description)
      formData.append('is_active', String(editTemplateForm.is_active))
      if (editTemplateFile) formData.append('template_file', editTemplateFile)

      await apiClient.patch(`/projects/templates/${selectedTemplateId}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await loadTemplates()
      setError('\u0428\u0430\u0431\u043b\u043e\u043d \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const onPreviewTemplateSections = async () => {
    if (!templateFile) {
      setError('\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 .docx \u0444\u0430\u0439\u043b \u0448\u0430\u0431\u043b\u043e\u043d\u0430.')
      return
    }
    setError('')
    setPreviewLoading(true)
    try {
      const formData = new FormData()
      formData.append('template_file', templateFile)
      const { data } = await apiClient.post('/projects/templates/preview-sections/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreviewTitles(data?.titles || [])
      if (!data?.count) {
        setError('\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0438 \u0432 \u0444\u0430\u0439\u043b\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0441\u0442\u0438\u043b\u0438 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u043e\u0432 \u0432 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0435.')
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u043f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u043e\u0432.')
      setPreviewTitles([])
    } finally {
      setPreviewLoading(false)
    }
  }

  const onCreateSection = async (event) => {
    event.preventDefault()
    if (!selectedTemplateId) return

    setError('')
    const parsed = parseSectionNumber(sectionForm.order)
    if (!parsed) {
      setError('Введите номер раздела в формате 1, 1.1 или 1.2.3.')
      return
    }
    try {
      await apiClient.post('/projects/template-sections/', {
        template: Number(selectedTemplateId),
        title: ensureTitleHasSectionNumber(sectionForm.title, parsed.raw),
        order: parsed.sortKey,
        default_task: sectionForm.default_task,
      })
      setSectionForm({ title: '', order: '1', default_task: '' })
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0440\u0430\u0437\u0434\u0435\u043b \u0448\u0430\u0431\u043b\u043e\u043d\u0430.')
    }
  }


  const onStartEditSection = (section) => {
    setEditingSectionId(section.id)
    setSectionEditForm({
      title: section.title || '',
      order: extractSectionNumberFromTitle(section.title, section.order || '1'),
      default_task: section.default_task || '',
    })
    setError('')
  }

  const onCancelEditSection = () => {
    setEditingSectionId(null)
    setSectionEditForm({ title: '', order: '1', default_task: '' })
  }

  const onUpdateSection = async (sectionId) => {
    setError('')
    const parsed = parseSectionNumber(sectionEditForm.order)
    if (!parsed) {
      setError('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0440\u0430\u0437\u0434\u0435\u043b\u0430 \u0432 \u0444\u043e\u0440\u043c\u0430\u0442\u0435 1, 1.1 \u0438\u043b\u0438 1.2.3.')
      return
    }
    setActionLoadingId(`section-${sectionId}`)
    try {
      await apiClient.patch(`/projects/template-sections/${sectionId}/`, {
        title: ensureTitleHasSectionNumber(sectionEditForm.title, parsed.raw),
        order: parsed.sortKey,
        default_task: sectionEditForm.default_task,
      })
      await loadTemplates()
      setEditingSectionId(null)
      setSectionEditForm({ title: '', order: '1', default_task: '' })
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u044d\u0442\u0430\u043f \u0448\u0430\u0431\u043b\u043e\u043d\u0430.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const onDeleteSection = async (sectionId) => {
    const confirmed = window.confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u0430\u043f \u0448\u0430\u0431\u043b\u043e\u043d\u0430?')
    if (!confirmed) return

    setError('')
    setActionLoadingId(`section-${sectionId}`)
    try {
      await apiClient.delete(`/projects/template-sections/${sectionId}/`)
      await loadTemplates()
      if (editingSectionId === sectionId) {
        setEditingSectionId(null)
        setSectionEditForm({ title: '', order: '1', default_task: '' })
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u0430\u043f \u0448\u0430\u0431\u043b\u043e\u043d\u0430.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const onExtractSections = async () => {
    if (!selectedTemplateId) return

    setError('')
    setActionLoadingId(selectedTemplateId)
    try {
      const { data } = await apiClient.post(`/projects/templates/${selectedTemplateId}/extract-sections/`, {
        overwrite: true,
      })
      setError(data?.detail || '\u0420\u0430\u0437\u0434\u0435\u043b\u044b \u0448\u0430\u0431\u043b\u043e\u043d\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b.')
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u0447\u0438\u0442\u0430\u0442\u044c \u0440\u0430\u0437\u0434\u0435\u043b\u044b \u0438\u0437 .docx \u0444\u0430\u0439\u043b\u0430.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const onSoftDeleteTemplate = async (id) => {
    setError('')
    setActionLoadingId(String(id))
    try {
      const { data } = await apiClient.post(`/projects/templates/${id}/soft-delete/`)
      setError(data?.detail || '\u0428\u0430\u0431\u043b\u043e\u043d \u043f\u0435\u0440\u0435\u043c\u0435\u0449\u0435\u043d \u0432 \u0430\u0440\u0445\u0438\u0432.')
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0435\u0440\u0435\u043c\u0435\u0441\u0442\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d \u0432 \u0430\u0440\u0445\u0438\u0432.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const onRestoreTemplate = async (id) => {
    setError('')
    setActionLoadingId(String(id))
    try {
      const { data } = await apiClient.post(`/projects/templates/${id}/restore/`)
      setError(data?.detail || '\u0428\u0430\u0431\u043b\u043e\u043d \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d.')
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const onHardDeleteTemplate = async (id) => {
    const confirmed = window.confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430? \u042d\u0442\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043d\u0435\u043b\u044c\u0437\u044f \u043e\u0442\u043c\u0435\u043d\u0438\u0442\u044c.')
    if (!confirmed) return

    setError('')
    setActionLoadingId(String(id))
    try {
      await apiClient.delete(`/projects/templates/${id}/hard-delete/`)
      if (String(id) === selectedTemplateId) setSelectedTemplateId('')
      await loadTemplates()
      setError('\u0428\u0430\u0431\u043b\u043e\u043d \u0443\u0434\u0430\u043b\u0435\u043d \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430.')
    } finally {
      setActionLoadingId(null)
    }
  }

  if (!canManage) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>{'\u0428\u0430\u0431\u043b\u043e\u043d\u044b \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432'}</h1>
          <p>{'\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0440\u0435\u043f\u043e\u0434\u0430\u0432\u0430\u0442\u0435\u043b\u044e, \u043a\u0443\u0440\u0430\u0442\u043e\u0440\u0443 \u0438 \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0443.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page detail-asym-layout">
      <section className="main-column">
        <article className="panel">
          <h1>{'\u0428\u0430\u0431\u043b\u043e\u043d\u044b \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432'}</h1>
          <p className="muted-text">
            {'\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 .docx \u0441 \u043f\u0440\u0438\u043c\u0435\u0440\u043e\u043c \u041d\u0418\u0420\u0421: \u0441\u0438\u0441\u0442\u0435\u043c\u0430 \u0441\u0447\u0438\u0442\u0430\u0435\u0442 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0438 \u043a\u0430\u043a \u044d\u0442\u0430\u043f\u044b, \u0432\u043a\u043b\u044e\u0447\u0430\u044f \u0438\u0441\u0445\u043e\u0434\u043d\u0443\u044e \u043d\u0443\u043c\u0435\u0440\u0430\u0446\u0438\u044e. \u0417\u0430\u0442\u0435\u043c \u0434\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u044f \u0438 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0448\u0430\u0431\u043b\u043e\u043d \u043f\u0440\u0438 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0438 \u043f\u0440\u043e\u0435\u043a\u0442\u0430.'}
          </p>
        </article>

        <article className="panel">
          <h2>{'\u041d\u043e\u0432\u044b\u0439 \u0448\u0430\u0431\u043b\u043e\u043d'}</h2>
          <form className="project-form" onSubmit={onCreateTemplate}>
            <label>
              {'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435'}
              <input value={templateForm.name} onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))} required />
            </label>
            <label>
              {'\u0422\u0438\u043f \u043f\u0440\u043e\u0435\u043a\u0442\u0430'}
              <select value={templateForm.project_type} onChange={(e) => setTemplateForm((p) => ({ ...p, project_type: e.target.value }))}>
                {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              {'\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435'}
              <textarea rows={3} value={templateForm.description} onChange={(e) => setTemplateForm((p) => ({ ...p, description: e.target.value }))} />
            </label>

            <FileDropZone
              label={'\u0424\u0430\u0439\u043b \u0448\u0430\u0431\u043b\u043e\u043d\u0430 .docx (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)'}
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hint={'\u0421\u0438\u0441\u0442\u0435\u043c\u0430 \u043f\u043e\u0434\u0445\u0432\u0430\u0442\u0438\u0442 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0443 \u0438 \u0444\u043e\u0440\u043c\u0430\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435'}
              file={templateFile}
              onFileSelect={onTemplateFileChange}
            />

            <div className="project-form-actions">
              <button type="submit" disabled={!templateFile}>{'\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d'}</button>
              <button type="button" onClick={onPreviewTemplateSections} disabled={!templateFile || previewLoading}>
                {previewLoading ? '\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0438...' : '\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u043e\u0432'}
              </button>
              <button type="button" onClick={onCancelPreview} disabled={!previewTitles.length && !previewLoading}>
                {'\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440'}
              </button>
              <button type="button" onClick={onClearTemplateFile} disabled={!templateFile}>
                {'\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0434\u0440\u0443\u0433\u043e\u0439 \u0444\u0430\u0439\u043b'}
              </button>
            </div>
          </form>

          {previewTitles.length ? (
            <div className="template-preview-block">
              <h3>{'\u041d\u0430\u0439\u0434\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0438'} ({previewTitles.length})</h3>
              <ol className="list compact-list template-preview-list">
                {previewTitles.map((title, idx) => <li key={`${title}-${idx}`} className="list-item">{title}</li>)}
              </ol>
            </div>
          ) : null}
        </article>

        {selectedTemplate ? (
          <article className="panel">
            <h2>{'\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u0430'}</h2>
            <form className="project-form" onSubmit={onUpdateTemplate}>
              <label>
                {'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435'}
                <input value={editTemplateForm.name} onChange={(e) => setEditTemplateForm((p) => ({ ...p, name: e.target.value }))} required />
              </label>
              <label>
                {'\u0422\u0438\u043f \u043f\u0440\u043e\u0435\u043a\u0442\u0430'}
                <select value={editTemplateForm.project_type} onChange={(e) => setEditTemplateForm((p) => ({ ...p, project_type: e.target.value }))}>
                  {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                {'\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435'}
                <textarea rows={3} value={editTemplateForm.description} onChange={(e) => setEditTemplateForm((p) => ({ ...p, description: e.target.value }))} />
              </label>

              <label className="checkbox-row">
                <input type="checkbox" checked={editTemplateForm.is_active} onChange={(e) => setEditTemplateForm((p) => ({ ...p, is_active: e.target.checked }))} />
                {'\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439 \u0448\u0430\u0431\u043b\u043e\u043d'}
              </label>

              <FileDropZone
                label={'\u0417\u0430\u043c\u0435\u043d\u0438\u0442\u044c .docx \u0444\u0430\u0439\u043b \u0448\u0430\u0431\u043b\u043e\u043d\u0430 (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)'}
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hint={'\u041c\u043e\u0436\u043d\u043e \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0438 \u043f\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0442\u044c \u044d\u0442\u0430\u043f\u044b'}
                file={editTemplateFile}
                onFileSelect={setEditTemplateFile}
              />

              <div className="project-form-actions">
                <button type="submit" disabled={actionLoadingId === selectedTemplateId}>{'\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d'}</button>
                <button type="button" onClick={onExtractSections} disabled={actionLoadingId === selectedTemplateId}>{'\u0421\u0447\u0438\u0442\u0430\u0442\u044c \u0440\u0430\u0437\u0434\u0435\u043b\u044b \u0438\u0437 .docx'}</button>
              </div>
            </form>
          </article>
        ) : null}

        <article className="panel">
          <h2>{'\u0420\u0430\u0437\u0434\u0435\u043b\u044b \u0448\u0430\u0431\u043b\u043e\u043d\u0430'}</h2>
          <form className="project-form" onSubmit={onCreateSection}>
            <label>
              {'\u0428\u0430\u0431\u043b\u043e\u043d'}
              <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} required>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>
              {'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0440\u0430\u0437\u0434\u0435\u043b\u0430'}
              <input value={sectionForm.title} onChange={(e) => setSectionForm((p) => ({ ...p, title: e.target.value }))} required />
            </label>
            <label>
              {'\u041f\u043e\u0440\u044f\u0434\u043e\u043a'}
              <input type="text" value={sectionForm.order} onChange={(e) => setSectionForm((p) => ({ ...p, order: e.target.value }))} required placeholder="1.2" />
            </label>
            <label>
              {'\u0417\u0430\u0434\u0430\u043d\u0438\u0435 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e'}
              <textarea rows={3} value={sectionForm.default_task} onChange={(e) => setSectionForm((p) => ({ ...p, default_task: e.target.value }))} />
            </label>
            <button type="submit" disabled={!selectedTemplateId}>{'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0440\u0430\u0437\u0434\u0435\u043b'}</button>
          </form>

          {selectedTemplate ? (
            <div className="template-preview-block">
              <h3>{'\u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435 \u044d\u0442\u0430\u043f\u044b'}: {selectedTemplate.name}</h3>
              <ul className="list compact-list">
                {(selectedTemplate.sections || []).map((section) => {
                  const isEditing = editingSectionId === section.id
                  const isSectionLoading = actionLoadingId === ('section-' + section.id)
                  return (
                    <li key={section.id} className="list-item">
                      {isEditing ? (
                        <div className="project-form">
                          <label>
                            {'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435'}
                            <input value={sectionEditForm.title} onChange={(e) => setSectionEditForm((p) => ({ ...p, title: e.target.value }))} />
                          </label>
                          <label>
                            {'\u041f\u043e\u0440\u044f\u0434\u043e\u043a'}
                            <input type="text" value={sectionEditForm.order} onChange={(e) => setSectionEditForm((p) => ({ ...p, order: e.target.value }))} placeholder="1.2" />
                          </label>
                          <label>
                            {'\u0417\u0430\u0434\u0430\u043d\u0438\u0435'}
                            <textarea rows={3} value={sectionEditForm.default_task} onChange={(e) => setSectionEditForm((p) => ({ ...p, default_task: e.target.value }))} />
                          </label>
                          <div className="toolbar-actions wrap-actions">
                            <button type="button" onClick={() => onUpdateSection(section.id)} disabled={isSectionLoading}>{'\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'}</button>
                            <button type="button" onClick={onCancelEditSection} disabled={isSectionLoading}>{'\u041e\u0442\u043c\u0435\u043d\u0430'}</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <strong>{section.title}</strong>
                          <p>{section.default_task || '-'}</p>
                          <div className="toolbar-actions wrap-actions">
                            <button type="button" onClick={() => onStartEditSection(section)}>{'\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c'}</button>
                            <button type="button" onClick={() => onDeleteSection(section.id)} disabled={isSectionLoading}>{'\u0423\u0434\u0430\u043b\u0438\u0442\u044c'}</button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </article>
      </section>

      <aside className="side-column">
        <article className="panel soft-panel">
          <h2>{'\u0421\u043f\u0438\u0441\u043e\u043a \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432'}</h2>
          {loading ? <p>{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <ul className="list compact-list">
            {templates.map((template) => {
              const id = String(template.id)
              const isSelected = id === selectedTemplateId
              const isLoadingAction = actionLoadingId === id
              return (
                <li key={template.id} className="list-item">
                  <div>
                    <strong>{template.name}</strong>
                    <p>{'\u0422\u0438\u043f'}: {formatProjectType(template.project_type)}</p>
                    <p>{'\u0420\u0430\u0437\u0434\u0435\u043b\u043e\u0432'}: {template.sections?.length || 0}</p>
                    <p>{'\u0421\u0442\u0430\u0442\u0443\u0441'}: {template.is_active ? '\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0439' : '\u0432 \u0430\u0440\u0445\u0438\u0432\u0435'}</p>
                  </div>
                  <div className="toolbar-actions wrap-actions">
                    <button type="button" onClick={() => setSelectedTemplateId(id)} disabled={isSelected}>{'\u0412\u044b\u0431\u0440\u0430\u0442\u044c'}</button>
                    {template.is_active ? (
                      <button type="button" onClick={() => onSoftDeleteTemplate(template.id)} disabled={isLoadingAction}>{'\u0412 \u0430\u0440\u0445\u0438\u0432'}</button>
                    ) : (
                      <button type="button" onClick={() => onRestoreTemplate(template.id)} disabled={isLoadingAction}>{'\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c'}</button>
                    )}
                    <button type="button" onClick={() => onHardDeleteTemplate(template.id)} disabled={isLoadingAction}>{'\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430'}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </article>

        
      </aside>
    </main>
  )
}



