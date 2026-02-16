import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { API_BASE_URL, apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'

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

const sizeOptions = [
  { value: 'all', label: 'Любой размер' },
  { value: '1_5', label: '1-5 участников' },
  { value: '6_20', label: '6-20 участников' },
  { value: '21_plus', label: '21+ участников' },
]

const photoOptions = [
  { value: 'all', label: 'Все команды' },
  { value: 'with', label: 'Только с фото' },
  { value: 'without', label: 'Только без фото' },
]

const sortOptions = [
  { value: '-created_at', label: 'Сначала новые' },
  { value: 'created_at', label: 'Сначала старые' },
  { value: 'name', label: 'По названию A-Я' },
  { value: '-name', label: 'По названию Я-A' },
  { value: '-members_total', label: 'Больше участников' },
  { value: 'members_total', label: 'Меньше участников' },
]

function sizeToRange(value) {
  if (value === '1_5') return { min: '1', max: '5' }
  if (value === '6_20') return { min: '6', max: '20' }
  if (value === '21_plus') return { min: '21', max: '' }
  return { min: '', max: '' }
}

export function TeamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const teamSearch = searchParams.get('search') || ''
  const hasPhoto = searchParams.get('has_photo') || 'all'
  const size = searchParams.get('size') || 'all'
  const ordering = searchParams.get('ordering') || '-created_at'

  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [students, setStudents] = useState([])
  const [studentSearch, setStudentSearch] = useState('')

  const [editingTeamId, setEditingTeamId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [form, setForm] = useState({
    name: '',
    member_ids: [],
  })
  const [photoFile, setPhotoFile] = useState(null)

  const selectedCount = useMemo(() => form.member_ids.length, [form.member_ids])

  useEffect(() => {
    let ignore = false
    const loadTeams = async () => {
      setLoading(true)
      setError('')
      try {
        const sizeRange = sizeToRange(size)
        const params = {
          ordering,
          ...(teamSearch ? { search: teamSearch } : {}),
          ...(hasPhoto === 'with' ? { has_photo: 'true' } : {}),
          ...(hasPhoto === 'without' ? { has_photo: 'false' } : {}),
          ...(sizeRange.min ? { members_min: sizeRange.min } : {}),
          ...(sizeRange.max ? { members_max: sizeRange.max } : {}),
        }
        const { data } = await apiClient.get('/projects/teams-manage/', { params })
        if (!ignore) setTeams(data.results || data || [])
      } catch {
        if (!ignore) {
          setError('Не удалось загрузить команды.')
          setTeams([])
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    const timer = setTimeout(loadTeams, 280)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [teamSearch, hasPhoto, size, ordering])

  useEffect(() => {
    let ignore = false
    const loadStudents = async () => {
      try {
        const { data } = await apiClient.get('/projects/students/', {
          params: { search: studentSearch },
        })
        if (!ignore) setStudents(data || [])
      } catch {
        if (!ignore) setStudents([])
      }
    }
    loadStudents()
    return () => {
      ignore = true
    }
  }, [studentSearch])

  const updateFilters = (patch) => {
    const next = {
      search: teamSearch,
      has_photo: hasPhoto,
      size,
      ordering,
      ...patch,
    }

    Object.keys(next).forEach((key) => {
      if (!next[key] || next[key] === 'all') delete next[key]
    })

    setSearchParams(next)
  }

  const resetForm = () => {
    setEditingTeamId(null)
    setPhotoFile(null)
    setForm({
      name: '',
      member_ids: [],
    })
  }

  const toggleMember = (id) => {
    setForm((prev) => ({
      ...prev,
      member_ids: prev.member_ids.includes(id)
        ? prev.member_ids.filter((memberId) => memberId !== id)
        : [...prev.member_ids, id],
    }))
  }

  const selectAllFiltered = () => {
    const ids = students.map((row) => row.id)
    setForm((prev) => ({
      ...prev,
      member_ids: Array.from(new Set([...prev.member_ids, ...ids])),
    }))
  }

  const clearAllFiltered = () => {
    const filteredIds = new Set(students.map((row) => row.id))
    setForm((prev) => ({
      ...prev,
      member_ids: prev.member_ids.filter((id) => !filteredIds.has(id)),
    }))
  }

  const beginEdit = (team) => {
    setEditingTeamId(team.id)
    setPhotoFile(null)
    setForm({
      name: team.name || '',
      member_ids: (team.members || []).map((member) => member.id),
    })
  }

  const reloadTeams = async () => {
    const sizeRange = sizeToRange(size)
    const params = {
      ordering,
      ...(teamSearch ? { search: teamSearch } : {}),
      ...(hasPhoto === 'with' ? { has_photo: 'true' } : {}),
      ...(hasPhoto === 'without' ? { has_photo: 'false' } : {}),
      ...(sizeRange.min ? { members_min: sizeRange.min } : {}),
      ...(sizeRange.max ? { members_max: sizeRange.max } : {}),
    }
    const { data } = await apiClient.get('/projects/teams-manage/', { params })
    setTeams(data.results || data || [])
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Название команды не может быть пустым.')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        member_ids: form.member_ids,
      }

      if (photoFile) {
        const photoForm = new FormData()
        photoForm.append('file', photoFile)
        const photoResp = await apiClient.post('/projects/teams-manage/upload_photo/', photoForm, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        payload.photo_url = photoResp.data?.photo_url || ''
      }

      if (editingTeamId) {
        await apiClient.patch(`/projects/teams-manage/${editingTeamId}/`, payload)
      } else {
        await apiClient.post('/projects/teams-manage/', payload)
      }

      await reloadTeams()
      resetForm()
    } catch (requestError) {
      const responseData = requestError.response?.data
      if (typeof responseData?.detail === 'string') {
        setError(responseData.detail)
      } else if (responseData && typeof responseData === 'object') {
        const firstField = Object.keys(responseData)[0]
        const fieldValue = responseData[firstField]
        if (Array.isArray(fieldValue) && fieldValue.length) {
          setError(`${firstField}: ${fieldValue[0]}`)
        } else {
          setError('Проверьте корректность данных команды.')
        }
      } else {
        setError('Не удалось сохранить команду.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const removeTeam = async (teamId) => {
    const isConfirmed = window.confirm('Удалить команду?')
    if (!isConfirmed) return

    try {
      await apiClient.delete(`/projects/teams-manage/${teamId}/`)
      await reloadTeams()
      if (editingTeamId === teamId) resetForm()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось удалить команду.')
    }
  }

  return (
    <main className="page detail-asym-layout">
      <section className="main-column">
        <article className="panel">
          <div className="toolbar">
            <h1>Команды</h1>
            {editingTeamId ? (
              <button type="button" onClick={resetForm}>
                Новая команда
              </button>
            ) : null}
          </div>
          <p className="muted-text">Страница команд для быстрого выбора команды при создании проекта.</p>
        </article>

        <article className="panel">
          <h2>{editingTeamId ? 'Редактирование команды' : 'Создание команды'}</h2>
          <form className="project-form" onSubmit={submit}>
            <label>
              Название команды
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>

            <FileDropZone
              label="Фото команды"
              accept="image/*"
              hint="Перетащите фото команды (JPG, PNG, WEBP, GIF)"
              file={photoFile}
              onFileSelect={setPhotoFile}
            />

            <label>
              Поиск студентов
              <input
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="ФИО, логин или группа"
              />
            </label>

            <div className="toolbar-actions">
              <button type="button" onClick={selectAllFiltered}>
                Выбрать всех
              </button>
              <button type="button" onClick={clearAllFiltered}>
                Очистить выбор
              </button>
            </div>

            <p>
              Выбрано студентов: <strong>{selectedCount}</strong>
            </p>

            <ul className="list selection-list">
              {students.map((student) => (
                <li key={student.id} className="list-item">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.member_ids.includes(student.id)}
                      onChange={() => toggleMember(student.id)}
                    />
                    <span>
                      {student.last_name} {student.first_name} ({student.username}) [{student.group_name || '-'}]
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {error ? <p className="error">{error}</p> : null}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Сохранение...' : editingTeamId ? 'Сохранить команду' : 'Создать команду'}
            </button>
          </form>
        </article>
      </section>

      <aside className="side-column">
        <article className="panel soft-panel">
          <h2>Список команд</h2>

          <label>
            Активный поиск
            <input
              value={teamSearch}
              onChange={(event) => updateFilters({ search: event.target.value })}
              placeholder="Название команды"
            />
          </label>

          <label>
            Фильтр по фото
            <select value={hasPhoto} onChange={(event) => updateFilters({ has_photo: event.target.value })}>
              {photoOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Фильтр по размеру
            <select value={size} onChange={(event) => updateFilters({ size: event.target.value })}>
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Сортировка
            <select value={ordering} onChange={(event) => updateFilters({ ordering: event.target.value })}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {loading ? <p>Загрузка...</p> : null}
          <ul className="list compact-list">
            {teams.map((team) => (
              <li key={team.id} className="list-item">
                <div>
                  <strong>{team.name}</strong>
                  <p>Участников: {team.members_count || 0}</p>
                  {team.photo_url ? (
                    <div className="published-cover-wrap" style={{ marginTop: '8px' }}>
                      <img className="published-cover" src={resolveAssetUrl(team.photo_url)} alt={`Фото команды ${team.name}`} />
                    </div>
                  ) : null}
                </div>
                <div className="project-form">
                  <button type="button" onClick={() => beginEdit(team)}>
                    Редактировать
                  </button>
                  <button type="button" onClick={() => removeTeam(team.id)}>
                    Удалить
                  </button>
                </div>
              </li>
            ))}
            {!loading && teams.length === 0 ? <li className="list-item">Команды не найдены.</li> : null}
          </ul>
        </article>
      </aside>
    </main>
  )
}
