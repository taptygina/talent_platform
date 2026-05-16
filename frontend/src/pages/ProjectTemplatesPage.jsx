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
const blockCatalog = [
  { type: 'heading', label: 'Заголовок' },
  { type: 'paragraph', label: 'Абзац' },
  { type: 'variable', label: 'Переменная' },
  { type: 'condition', label: 'Условие' },
  { type: 'repeat', label: 'Повтор' },
  { type: 'page_break', label: 'Разрыв страницы' },
]

const conditionLabels = {
  has_goal: 'Если у проекта заполнена цель',
  has_description: 'Если у проекта заполнено описание',
  has_participants: 'Если в проекте есть участники',
  has_stages: 'Если в проекте есть этапы',
}

const repeatSourceLabels = {
  participants: 'Участники проекта',
  stages: 'Этапы проекта',
}

const legacyVariableLabels = {
  PROJECT_TITLE: 'Название проекта',
  PROJECT_GOAL: 'Цель проекта',
  PROJECT_DESCRIPTION: 'Описание проекта',
  SUPERVISOR_FULL_NAME: 'ФИО руководителя',
  STUDENT_FULL_NAME: 'ФИО студента',
  STUDENT_GROUP: 'Группа студента',
  STAGE_TITLE: 'Название этапа',
  STAGE_TASK: 'Задание этапа',
  STAGE_REPORT: 'Отчет студента',
}

function createBlock(type) {
  const id = `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`
  if (type === 'heading') return { id, type, level: 1, text: 'Новый заголовок' }
  if (type === 'paragraph') return { id, type, text: 'Новый абзац' }
  if (type === 'variable') return { id, type, key: 'НАЗВАНИЕ_ПРОЕКТА' }
  if (type === 'condition') return { id, type, key: 'has_goal', children: [] }
  if (type === 'repeat') return { id, type, source: 'stages', children: [] }
  return { id, type: 'page_break' }
}

function updateBlockTree(blocks, blockId, updater) {
  return blocks.map((block) => {
    if (block.id === blockId) return updater(block)
    if (block.children) return { ...block, children: updateBlockTree(block.children, blockId, updater) }
    return block
  })
}

function removeBlockTree(blocks, blockId) {
  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) => block.children ? { ...block, children: removeBlockTree(block.children, blockId) } : block)
}

function moveBlock(blocks, draggedId, targetId) {
  const sourceIndex = blocks.findIndex((block) => block.id === draggedId)
  const targetIndex = blocks.findIndex((block) => block.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return blocks
  const next = [...blocks]
  const [item] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, item)
  return next
}

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

function getVisibleVariableOptions(variables, currentKey) {
  const entries = Object.entries(variables || {}).filter(([key]) => !/^[A-Z_]+$/.test(key))
  if (currentKey && legacyVariableLabels[currentKey] && !entries.some(([key]) => key === currentKey)) {
    entries.push([currentKey, legacyVariableLabels[currentKey]])
  }
  return entries
}

function extractApiErrorMessage(error, fallback) {
  const data = error?.response?.data
  if (!data) return fallback
  if (typeof data.detail === 'string') return data.detail
  if (typeof data.message === 'string') {
    const detailParts = []
    if (data.details && typeof data.details === 'object') {
      Object.entries(data.details).forEach(([field, messages]) => {
        const value = Array.isArray(messages) ? messages.join(', ') : String(messages)
        const fieldLabel = { code: 'Код', title: 'Название', order: 'Порядок' }[field] || field
        detailParts.push(`${fieldLabel}: ${value}`)
      })
    }
    return detailParts.length ? `${data.message} ${detailParts.join('; ')}` : data.message
  }
  return fallback
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
  const [builderMeta, setBuilderMeta] = useState(null)
  const [builderSchema, setBuilderSchema] = useState({ version: 1, blocks: [] })
  const [builderPreview, setBuilderPreview] = useState([])
  const [builderSaving, setBuilderSaving] = useState(false)
  const [builderPreviewing, setBuilderPreviewing] = useState(false)
  const [draggedBlockId, setDraggedBlockId] = useState('')
  const [templatePreview, setTemplatePreview] = useState(null)
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false)

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

  useEffect(() => {
    if (!selectedTemplateId) return
    const loadBuilder = async () => {
      try {
        const { data } = await apiClient.get(`/projects/templates/${selectedTemplateId}/builder-meta/`)
        setBuilderMeta(data)
        setBuilderSchema(data.schema || { version: 1, blocks: [] })
        setBuilderPreview([])
        setTemplatePreview(null)
      } catch {
        setBuilderMeta(null)
        setBuilderSchema({ version: 1, blocks: [] })
        setTemplatePreview(null)
      }
    }
    loadBuilder()
  }, [selectedTemplateId])

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
    try {
      const formData = new FormData()
      formData.append('name', templateForm.name)
      formData.append('project_type', templateForm.project_type)
      formData.append('description', templateForm.description)
      formData.append('is_active', 'true')
      if (templateFile) formData.append('template_file', templateFile)
      if (!templateFile) {
        formData.append('builder_schema', JSON.stringify({
          version: 1,
          blocks: [
            { id: 'heading-main', type: 'heading', level: 1, text: '{{НАЗВАНИЕ_ПРОЕКТА}}' },
            { id: 'paragraph-goal', type: 'paragraph', text: 'Цель проекта: {{ЦЕЛЬ_ПРОЕКТА}}' },
            { id: 'repeat-stages', type: 'repeat', source: 'stages', children: [
              { id: 'stage-heading', type: 'heading', level: 2, text: '{{НАЗВАНИЕ_ЭТАПА}}' },
              { id: 'stage-task', type: 'paragraph', text: '{{ЗАДАНИЕ_ЭТАПА}}' },
            ] },
          ],
        }))
      }

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
      setError('Сначала выберите файл шаблона.')
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
      setError(extractApiErrorMessage(requestError, '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0440\u0430\u0437\u0434\u0435\u043b \u0448\u0430\u0431\u043b\u043e\u043d\u0430.'))
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
      setError(requestError.response?.data?.detail || 'Не удалось считать разделы из файла шаблона.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const addBuilderBlock = (type, parentId = null) => {
    const block = createBlock(type)
    if (!parentId) {
      setBuilderSchema((prev) => ({ ...prev, blocks: [...(prev.blocks || []), block] }))
      return
    }
    setBuilderSchema((prev) => ({
      ...prev,
      blocks: updateBlockTree(prev.blocks || [], parentId, (item) => ({ ...item, children: [...(item.children || []), block] })),
    }))
  }

  const updateBuilderBlock = (blockId, patch) => {
    setBuilderSchema((prev) => ({
      ...prev,
      blocks: updateBlockTree(prev.blocks || [], blockId, (item) => ({ ...item, ...patch })),
    }))
  }

  const deleteBuilderBlock = (blockId) => {
    setBuilderSchema((prev) => ({ ...prev, blocks: removeBlockTree(prev.blocks || [], blockId) }))
  }

  const onBuilderDrop = (targetId, parentId = null) => {
    if (!draggedBlockId || parentId) return
    setBuilderSchema((prev) => ({ ...prev, blocks: moveBlock(prev.blocks || [], draggedBlockId, targetId) }))
    setDraggedBlockId('')
  }

  const saveBuilderSchema = async () => {
    if (!selectedTemplateId) return
    setBuilderSaving(true)
    try {
      await apiClient.patch(`/projects/templates/${selectedTemplateId}/`, { builder_schema: builderSchema })
      setError('Схема конструктора сохранена.')
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось сохранить схему конструктора.')
    } finally {
      setBuilderSaving(false)
    }
  }

  const previewBuilderSchema = async () => {
    if (!selectedTemplateId) return
    setBuilderPreviewing(true)
    try {
      const { data } = await apiClient.post(`/projects/templates/${selectedTemplateId}/builder-preview/`, { schema: builderSchema })
      setBuilderPreview(data.blocks || [])
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось построить предпросмотр документа.')
    } finally {
      setBuilderPreviewing(false)
    }
  }

  const loadTemplatePreview = async () => {
    if (!selectedTemplateId) return
    setTemplatePreviewLoading(true)
    try {
      const { data } = await apiClient.get(`/projects/templates/${selectedTemplateId}/template-preview/`)
      setTemplatePreview(data)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось открыть предпросмотр шаблона.')
      setTemplatePreview(null)
    } finally {
      setTemplatePreviewLoading(false)
    }
  }

  const renderBuilderBlock = (block, depth = 0, parentId = null) => (
    <div
      key={block.id}
      className={`builder-block builder-block-${block.type}`}
      draggable={!parentId}
      onDragStart={() => !parentId && setDraggedBlockId(block.id)}
      onDragOver={(event) => {
        if (!parentId) event.preventDefault()
      }}
      onDrop={() => onBuilderDrop(block.id, parentId)}
      style={{ marginLeft: `${depth * 18}px` }}
    >
      <div className="builder-block-head">
        <strong>{blockCatalog.find((item) => item.type === block.type)?.label || block.type}</strong>
        <button type="button" className="button-ghost" onClick={() => deleteBuilderBlock(block.id)}>Удалить</button>
      </div>
      {block.type === 'heading' ? (
        <div className="builder-grid">
          <label>Уровень
            <select value={block.level || 1} onChange={(event) => updateBuilderBlock(block.id, { level: Number(event.target.value) })}>
              <option value="1">Заголовок 1</option>
              <option value="2">Заголовок 2</option>
              <option value="3">Заголовок 3</option>
            </select>
          </label>
          <label>Текст
            <input value={block.text || ''} onChange={(event) => updateBuilderBlock(block.id, { text: event.target.value })} />
          </label>
        </div>
      ) : null}
      {block.type === 'paragraph' ? (
        <label>Текст
          <textarea rows={3} value={block.text || ''} onChange={(event) => updateBuilderBlock(block.id, { text: event.target.value })} />
        </label>
      ) : null}
      {block.type === 'variable' ? (
        <label>Переменная
          <select value={block.key || 'НАЗВАНИЕ_ПРОЕКТА'} onChange={(event) => updateBuilderBlock(block.id, { key: event.target.value })}>
            {getVisibleVariableOptions(builderMeta?.variables, block.key).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      ) : null}
      {block.type === 'condition' ? (
        <>
          <label>Условие
            <select value={block.key || 'has_goal'} onChange={(event) => updateBuilderBlock(block.id, { key: event.target.value })}>
              {(builderMeta?.conditions || []).map((key) => <option key={key} value={key}>{conditionLabels[key] || key}</option>)}
            </select>
          </label>
          <div className="builder-nested-actions">
            {blockCatalog.filter((item) => item.type !== 'page_break').map((item) => (
              <button key={item.type} type="button" className="button-ghost" onClick={() => addBuilderBlock(item.type, block.id)}>
                + {item.label}
              </button>
            ))}
          </div>
          {(block.children || []).map((child) => renderBuilderBlock(child, depth + 1, block.id))}
        </>
      ) : null}
      {block.type === 'repeat' ? (
        <>
          <label>Повторять по
            <select value={block.source || 'stages'} onChange={(event) => updateBuilderBlock(block.id, { source: event.target.value })}>
              {(builderMeta?.repeat_sources || []).map((key) => <option key={key} value={key}>{repeatSourceLabels[key] || key}</option>)}
            </select>
          </label>
          <div className="builder-nested-actions">
            {blockCatalog.filter((item) => item.type !== 'page_break').map((item) => (
              <button key={item.type} type="button" className="button-ghost" onClick={() => addBuilderBlock(item.type, block.id)}>
                + {item.label}
              </button>
            ))}
          </div>
          {(block.children || []).map((child) => renderBuilderBlock(child, depth + 1, block.id))}
        </>
      ) : null}
    </div>
  )

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
            {'Загрузите файл с примером НИРС: система считает заголовки как этапы, включая исходную нумерацию. Затем дополните задания и используйте шаблон при создании проекта.'}
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
              label={'Файл шаблона (необязательно)'}
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hint={'\u0421\u0438\u0441\u0442\u0435\u043c\u0430 \u043f\u043e\u0434\u0445\u0432\u0430\u0442\u0438\u0442 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0443 \u0438 \u0444\u043e\u0440\u043c\u0430\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435'}
              file={templateFile}
              onFileSelect={onTemplateFileChange}
            />

            <div className="project-form-actions">
              <button type="submit">{templateFile ? 'Создать из файла' : '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0442\u043e\u0440'}</button>
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
                label={'Заменить файл шаблона (необязательно)'}
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hint={'\u041c\u043e\u0436\u043d\u043e \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0438 \u043f\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0442\u044c \u044d\u0442\u0430\u043f\u044b'}
                file={editTemplateFile}
                onFileSelect={setEditTemplateFile}
              />

              <div className="project-form-actions">
                <button type="submit" disabled={actionLoadingId === selectedTemplateId}>{'\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d'}</button>
                <button type="button" onClick={onExtractSections} disabled={actionLoadingId === selectedTemplateId}>Считать разделы из файла шаблона</button>
              </div>
            </form>
          </article>
        ) : null}

        {selectedTemplate ? (
          <article className="panel">
            <div className="toolbar">
              <div>
                <h2>Просмотр шаблона</h2>
                <p className="muted-text">Откройте актуальную структуру выбранного шаблона перед использованием в проекте.</p>
              </div>
              <button type="button" onClick={loadTemplatePreview} disabled={templatePreviewLoading}>
                {templatePreviewLoading ? 'Открываем...' : 'Посмотреть шаблон'}
              </button>
            </div>
            {templatePreview ? (
              <div className="template-viewer-layout">
                <div className="template-viewer-meta">
                  <h3>{templatePreview.template.name}</h3>
                  <p>{templatePreview.template.description || 'Описание не заполнено.'}</p>
                  <ul className="list compact-list">
                    <li className="list-item"><span>Тип</span><strong>{formatProjectType(templatePreview.template.project_type)}</strong></li>
                    <li className="list-item"><span>Разделов</span><strong>{templatePreview.template.sections_count}</strong></li>
                    <li className="list-item"><span>Статус</span><strong>{templatePreview.template.is_active ? 'активный' : 'в архиве'}</strong></li>
                    <li className="list-item"><span>Источник просмотра</span><strong>{templatePreview.source === 'builder' ? 'конструктор документов' : 'разделы файла шаблона'}</strong></li>
                  </ul>
                </div>
                <div className="word-preview">
                  {(templatePreview.blocks || []).map((block, index) => {
                    if (block.type === 'page_break') return <hr key={`template-break-${index}`} />
                    if (block.type === 'heading') {
                      const Tag = `h${Math.min(3, block.level || 1)}`
                      return <Tag key={`template-heading-${index}`}>{block.text}</Tag>
                    }
                    return <p key={`template-paragraph-${index}`}>{block.text}</p>
                  })}
                  {!templatePreview.blocks?.length ? <p className="muted-text">В шаблоне пока нет блоков или разделов для просмотра.</p> : null}
                </div>
              </div>
            ) : null}
          </article>
        ) : null}

        {selectedTemplate ? (
          <article className="panel">
            <div className="toolbar">
              <div>
                <h2>Конструктор документов</h2>
                <p className="muted-text">Соберите структуру документа из блоков, переменных, условий и повторов.</p>
              </div>
              <div className="toolbar-actions wrap-actions">
                {blockCatalog.map((item) => (
                  <button key={item.type} type="button" className="button-ghost" onClick={() => addBuilderBlock(item.type)}>
                    + {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="builder-layout">
              <div className="builder-canvas">
                {(builderSchema.blocks || []).map((block) => renderBuilderBlock(block))}
                {!builderSchema.blocks?.length ? <p className="muted-text">Добавьте первый блок, чтобы начать сборку документа.</p> : null}
              </div>
              <div className="builder-side">
                <div className="toolbar-actions wrap-actions">
                  <button type="button" onClick={saveBuilderSchema} disabled={builderSaving}>
                    {builderSaving ? 'Сохраняем...' : 'Сохранить шаблон документа'}
                  </button>
                  <button type="button" className="button-ghost" onClick={previewBuilderSchema} disabled={builderPreviewing}>
                    {builderPreviewing ? 'Строим...' : 'Предпросмотр'}
                  </button>
                </div>
                <div className="word-preview">
                  {builderPreview.map((block, index) => {
                    if (block.type === 'page_break') return <hr key={`break-${index}`} />
                    if (block.type === 'heading') {
                      const Tag = `h${Math.min(3, block.level || 1)}`
                      return <Tag key={`heading-${index}`}>{block.text}</Tag>
                    }
                    return <p key={`paragraph-${index}`}>{block.text}</p>
                  })}
                  {!builderPreview.length ? <p className="muted-text">Здесь появится документный предпросмотр.</p> : null}
                </div>
              </div>
            </div>
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



