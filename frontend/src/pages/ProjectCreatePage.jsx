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
  { value: 'new_team', label: 'Создать новую команду' },
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
  const [groupStudents, setGroupStudents] = useState([])
  const [students, setStudents] = useState([])

  const [groupName, setGroupName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [groupStudentSearch, setGroupStudentSearch] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [groupStudentIds, setGroupStudentIds] = useState([])
  const [newTeamMemberIds, setNewTeamMemberIds] = useState([])

  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canCreate = useMemo(() => ['teacher', 'curator', 'admin'].includes(user?.role), [user?.role])

  useEffect(() => {
    let ignore = false
    const load = async () => {
      setIsLoading(true)
      try {
        const [groupsResponse, teamsResponse] = await Promise.all([
          apiClient.get('/projects/groups/'),
          apiClient.get('/projects/teams/'),
        ])
        if (!ignore) {
          const nextGroups = groupsResponse.data || []
          const nextTeams = teamsResponse.data || []
          setGroups(nextGroups)
          setTeams(nextTeams)
          if (nextGroups.length) setGroupName(nextGroups[0].group_name)
          if (nextTeams.length) setTeamId(String(nextTeams[0].id))
        }
      } catch {
        if (!ignore) setError('Не удалось загрузить группы и команды.')
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
    if (!groupName) {
      setGroupStudents([])
      setGroupStudentIds([])
      return
    }
    let ignore = false
    const loadGroupStudents = async () => {
      try {
        const { data } = await apiClient.get('/projects/students/', {
          params: { group_name: groupName, search: groupStudentSearch },
        })
        if (!ignore) {
          const rows = data || []
          setGroupStudents(rows)
          setGroupStudentIds((prev) => {
            const validIds = new Set(rows.map((row) => row.id))
            const kept = prev.filter((id) => validIds.has(id))
            if (groupStudentSearch) return kept
            return kept.length ? kept : rows.map((row) => row.id)
          })
        }
      } catch {
        if (!ignore) {
          setGroupStudents([])
          setGroupStudentIds([])
        }
      }
    }
    loadGroupStudents()
    return () => {
      ignore = true
    }
  }, [groupName, groupStudentSearch])

  useEffect(() => {
    if (mode !== 'new_team') return
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
  }, [mode, studentSearch])

  const toggleGroupStudent = (studentId) => {
    setGroupStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    )
  }

  const selectAllFilteredGroupStudents = () => {
    const filteredIds = groupStudents.map((student) => student.id)
    setGroupStudentIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
  }

  const clearAllFilteredGroupStudents = () => {
    const filteredIds = new Set(groupStudents.map((student) => student.id))
    setGroupStudentIds((prev) => prev.filter((id) => !filteredIds.has(id)))
  }

  const toggleNewTeamMember = (memberId) => {
    setNewTeamMemberIds((prev) => {
      if (prev.includes(memberId)) return prev.filter((id) => id !== memberId)
      if (prev.length >= 20) return prev
      return [...prev, memberId]
    })
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const payload = {
      title,
      description,
      type,
      status: 'planned',
      supervisor_id: user.id,
    }

    if (mode === 'group') {
      payload.group_name = groupName
      payload.group_student_ids = groupStudentIds
    }
    if (mode === 'team') payload.team_id = Number(teamId)
    if (mode === 'new_team') {
      payload.new_team_name = newTeamName
      payload.new_team_member_ids = newTeamMemberIds
    }

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
        {isLoading ? <p>Загрузка групп и команд...</p> : null}

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
                Академическая группа
                <select value={groupName} onChange={(event) => setGroupName(event.target.value)} required>
                  {groups.map((group) => (
                    <option key={group.group_name} value={group.group_name}>
                      {group.group_name} ({group.students_count})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Поиск студента внутри группы
                <input
                  value={groupStudentSearch}
                  onChange={(event) => setGroupStudentSearch(event.target.value)}
                  placeholder="ФИО или логин"
                />
              </label>

              <div className="toolbar-actions">
                <button type="button" onClick={selectAllFilteredGroupStudents}>
                  Выбрать всех
                </button>
                <button type="button" onClick={clearAllFilteredGroupStudents}>
                  Очистить выбор
                </button>
              </div>

              <p>
                Выбрано студентов: <strong>{groupStudentIds.length}</strong>
              </p>

              <ul className="list selection-list">
                {groupStudents.map((student) => (
                  <li key={student.id} className="list-item">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={groupStudentIds.includes(student.id)}
                        onChange={() => toggleGroupStudent(student.id)}
                      />
                      <span>
                        {student.last_name} {student.first_name} ({student.username})
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {mode === 'team' ? (
            <label>
              Команда
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.members_count})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {mode === 'new_team' ? (
            <>
              <label>
                Название новой команды
                <input value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} required />
              </label>

              <label>
                Поиск студентов по всему учреждению
                <input
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="ФИО, логин или группа"
                />
              </label>

              <p>
                Выбрано: <strong>{newTeamMemberIds.length}</strong> / 20
              </p>

              <ul className="list selection-list">
                {students.map((student) => {
                  const checked = newTeamMemberIds.includes(student.id)
                  return (
                    <li key={student.id} className="list-item">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNewTeamMember(student.id)}
                          disabled={!checked && newTeamMemberIds.length >= 20}
                        />
                        <span>
                          {student.last_name} {student.first_name} ({student.username}) [{student.group_name || '-'}]
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
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
