import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { useAuth } from '../features/auth/AuthContext'

const typeOptions = [
  { value: 'contest', label: 'Конкурс' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'coursework', label: 'Курсовой проект' },
  { value: 'diploma', label: 'Дипломный проект' },
  { value: 'other', label: 'Другое' },
]

const modeOptions = [
  { value: 'group', label: 'По академической группе' },
  { value: 'team', label: 'По существующей команде' },
]

export function ProjectCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [type, setType] = useState('coursework')
  const [mode, setMode] = useState('group')

  const [groups, setGroups] = useState([])
  const [teams, setTeams] = useState([])
  const [templates, setTemplates] = useState([])

  const [groupName, setGroupName] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [groupStudentSearch, setGroupStudentSearch] = useState('')
  const [groupStudents, setGroupStudents] = useState([])
  const [selectedGroupStudentIds, setSelectedGroupStudentIds] = useState([])
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [isGroupStudentsLoading, setIsGroupStudentsLoading] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [autoGenerateStages, setAutoGenerateStages] = useState(true)

  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canCreate = useMemo(() => ['teacher', 'curator', 'admin'].includes(user?.role), [user?.role])
  const filteredGroups = useMemo(() => groups, [groups])
  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase()
    if (!q) return teams
    return teams.filter((team) => team.name.toLowerCase().includes(q))
  }, [teamSearch, teams])

  useEffect(() => {
    let ignore = false
    const load = async () => {
      setIsLoading(true)
      try {
        const teamsResponse = await apiClient.get('/projects/teams/')
        if (!ignore) {
          const nextTeams = teamsResponse.data || []
          setTeams(nextTeams)
          if (nextTeams.length) setTeamId(String(nextTeams[0].id))
        }
      } catch {
        if (!ignore) setError('Не удалось загрузить команды.')
      } finally {
        if (!ignore) setIsLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    const loadTemplates = async () => {
      try {
        const { data } = await apiClient.get('/projects/templates/', {
          params: { is_active: true, project_type: type },
        })
        if (!ignore) {
          const rows = data?.results || data || []
          setTemplates(rows)
          setTemplateId((prev) => (rows.some((t) => String(t.id) === prev) ? prev : ''))
        }
      } catch {
        if (!ignore) {
          setTemplates([])
          setTemplateId('')
        }
      }
    }
    loadTemplates()
    return () => {
      ignore = true
    }
  }, [type])

  useEffect(() => {
    if (mode !== 'group') return
    const q = groupSearch.trim()
    if (q.length < 2) {
      setGroups([])
      setGroupName('')
      setIsGroupsLoading(false)
      return
    }
    let ignore = false
    const timerId = setTimeout(async () => {
      setIsGroupsLoading(true)
      try {
        const { data } = await apiClient.get('/projects/groups/', { params: { search: q } })
        if (!ignore) {
          const rows = data || []
          setGroups(rows)
          if (!rows.some((row) => row.group_name === groupName)) {
            setGroupName('')
            setSelectedGroupStudentIds([])
            setGroupStudents([])
            setGroupStudentSearch('')
          }
        }
      } catch {
        if (!ignore) {
          setGroups([])
          setGroupName('')
        }
      } finally {
        if (!ignore) setIsGroupsLoading(false)
      }
    }, 300)
    return () => {
      ignore = true
      clearTimeout(timerId)
    }
  }, [mode, groupSearch, groupName])

  useEffect(() => {
    if (mode !== 'group' || !groupName) {
      setGroupStudents([])
      setIsGroupStudentsLoading(false)
      return
    }
    const q = groupStudentSearch.trim()
    if (q.length < 2) {
      setGroupStudents([])
      setIsGroupStudentsLoading(false)
      return
    }
    let ignore = false
    const timerId = setTimeout(async () => {
      setIsGroupStudentsLoading(true)
      try {
        const { data } = await apiClient.get('/projects/students/', {
          params: { group_name: groupName, search: q },
        })
        if (!ignore) setGroupStudents(data || [])
      } catch {
        if (!ignore) setGroupStudents([])
      } finally {
        if (!ignore) setIsGroupStudentsLoading(false)
      }
    }, 300)
    return () => {
      ignore = true
      clearTimeout(timerId)
    }
  }, [mode, groupName, groupStudentSearch])

  const toggleGroupStudent = (studentId) => {
    setSelectedGroupStudentIds((prev) => {
      if (prev.includes(studentId)) return prev.filter((id) => id !== studentId)
      return [...prev, studentId]
    })
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    if (mode === 'group' && !groupName) {
      setError('Выберите академическую группу.')
      setIsSubmitting(false)
      return
    }
    if (mode === 'group' && selectedGroupStudentIds.length === 0) {
      setError('Выберите минимум одного участника из группы.')
      setIsSubmitting(false)
      return
    }
    if (mode === 'team' && !teamId) {
      setError('Выберите команду.')
      setIsSubmitting(false)
      return
    }

    const payload = {
      title,
      description,
      type,
      status: 'planned',
      supervisor_id: user.id,
      template_id: templateId ? Number(templateId) : null,
      auto_generate_stages: Boolean(templateId) && autoGenerateStages,
    }

    if (mode === 'group') {
      payload.group_name = groupName
      payload.group_student_ids = selectedGroupStudentIds
    }
    if (mode === 'team') payload.team_id = Number(teamId)

    try {
      if (coverImageFile) {
        const formData = new FormData()
        formData.append('file', coverImageFile)
        const coverResponse = await apiClient.post('/projects/upload_cover/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        payload.cover_image_url = coverResponse.data?.cover_image_url || ''
      }
      const { data } = await apiClient.post('/projects/', payload)
      navigate(`/projects/${data.id}`)
    } catch (requestError) {
      const detail = requestError.response?.data?.detail
      if (typeof detail === 'string') setError(detail)
      else setError('Не удалось создать проект.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canCreate) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>Создание проекта</h1>
          <p>Создавать проекты могут только преподаватель, куратор или администратор.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page form-centered-page">
      <section className="panel centered-panel">
        <h1>Создание проекта</h1>
        <p className="muted-text">Последовательно заполните поля и выберите способ назначения участников.</p>
        {isLoading ? <p>Загрузка команд...</p> : null}

        <form className="project-form" onSubmit={onSubmit}>
          <label>
            Название проекта
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>

          <label>
            Описание
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          </label>

          <FileDropZone
            label="Обложка проекта"
            accept="image/*"
            hint="Перетащите изображение (JPG, PNG, WEBP или GIF)"
            file={coverImageFile}
            onFileSelect={setCoverImageFile}
          />

          <label>
            Тип проекта
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Шаблон проекта (для автозаполнения этапов)
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">Без шаблона</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          {templateId ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={autoGenerateStages}
                onChange={(event) => setAutoGenerateStages(event.target.checked)}
              />
              <span>Автоматически создать этапы из шаблона</span>
            </label>
          ) : null}

          <label>
            Режим назначения участников
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              {modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {mode === 'group' ? (
            <>
              <label>
                Поиск академической группы
                <input
                  value={groupSearch}
                  onChange={(event) => {
                    setGroupSearch(event.target.value)
                    setError('')
                  }}
                  placeholder="Например: ИС-22"
                />
              </label>
              {groupSearch.trim().length > 0 && groupSearch.trim().length < 2 ? (
                <p className="muted-text">Введите минимум 2 символа для поиска группы.</p>
              ) : null}
              {isGroupsLoading ? <p className="muted-text">Поиск групп...</p> : null}

              <label>
                Академическая группа
                {groupSearch.trim().length >= 2 && !isGroupsLoading ? (
                  filteredGroups.length ? (
                    <ul className="list selection-list">
                      {filteredGroups.map((group) => {
                        const checked = groupName === group.group_name
                        return (
                          <li key={group.group_name} className="list-item">
                            <label className="checkbox-row">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setGroupName(group.group_name)
                                    setGroupStudentSearch('')
                                    setGroupStudents([])
                                    setSelectedGroupStudentIds([])
                                  } else {
                                    setGroupName('')
                                    setGroupStudentSearch('')
                                    setGroupStudents([])
                                    setSelectedGroupStudentIds([])
                                  }
                                }}
                              />
                              <span>
                                {group.group_name} ({group.students_count})
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="muted-text">Группы по запросу не найдены.</p>
                  )
                ) : (
                  <p className="muted-text">Введите запрос для поиска академической группы.</p>
                )}
              </label>
              <label>
                Поиск участника в выбранной группе
                <input
                  value={groupStudentSearch}
                  onChange={(event) => setGroupStudentSearch(event.target.value)}
                  placeholder="Введите ФИО или логин (минимум 2 символа)"
                  disabled={!groupName}
                />
              </label>
              {!groupName ? <p className="muted-text">Сначала выберите академическую группу.</p> : null}
              {groupName && groupStudentSearch.trim().length > 0 && groupStudentSearch.trim().length < 2 ? (
                <p className="muted-text">Введите минимум 2 символа для поиска.</p>
              ) : null}
              {groupName && isGroupStudentsLoading ? <p className="muted-text">Поиск участников...</p> : null}
              {groupName && groupStudentSearch.trim().length >= 2 && !isGroupStudentsLoading ? (
                groupStudents.length ? (
                  <ul className="list selection-list">
                    {groupStudents.map((student) => {
                      const checked = selectedGroupStudentIds.includes(student.id)
                      return (
                        <li key={student.id} className="list-item">
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGroupStudent(student.id)}
                            />
                            <span>
                              {student.last_name} {student.first_name} ({student.username})
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="muted-text">Участники по запросу не найдены.</p>
                )
              ) : null}
              {groupName ? (
                <p className="muted-text">
                  Выбрано участников: <strong>{selectedGroupStudentIds.length}</strong>
                </p>
              ) : null}
            </>
          ) : null}

          {mode === 'team' ? (
            <>
              <label>
                Поиск команды
                <input
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="Введите название команды"
                />
              </label>
              {filteredTeams.length ? (
                <ul className="list selection-list">
                  {filteredTeams.map((team) => (
                    <li key={team.id} className="list-item">
                      <label className="checkbox-row">
                        <input
                          type="radio"
                          name="team_id"
                          checked={String(team.id) === String(teamId)}
                          onChange={() => setTeamId(String(team.id))}
                        />
                        <span>
                          {team.name} ({team.members_count})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-text">Команды по фильтру не найдены.</p>
              )}
              <button type="button" onClick={() => navigate('/teams')}>
                Создать новую команду на отдельной странице
              </button>
            </>
          ) : null}

          {error ? <p className="error">{error}</p> : null}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Создание...' : 'Создать проект'}
          </button>
        </form>
      </section>
    </main>
  )
}
