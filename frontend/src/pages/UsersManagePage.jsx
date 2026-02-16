import { useEffect, useMemo, useState } from 'react'

import { API_BASE_URL, apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { useAuth } from '../features/auth/AuthContext'
import { formatRole } from '../utils/labels'

const roleOptions = [
  { value: '', label: 'Все роли' },
  { value: 'student', label: 'Студент' },
  { value: 'teacher', label: 'Преподаватель' },
  { value: 'methodist', label: 'Методист' },
  { value: 'curator', label: 'Куратор' },
  { value: 'admin', label: 'Администратор' },
]

const sortOptions = [
  { value: 'last_name', label: 'По фамилии A-Я' },
  { value: '-last_name', label: 'По фамилии Я-A' },
  { value: 'date_joined', label: 'Сначала старые' },
  { value: '-date_joined', label: 'Сначала новые' },
]

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

export function UsersManagePage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [isActive, setIsActive] = useState('')
  const [ordering, setOrdering] = useState('last_name')

  const [editUser, setEditUser] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const canManage = useMemo(() => ['curator', 'admin'].includes(currentUser?.role), [currentUser?.role])

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/auth/users/', {
        params: {
          search: search || undefined,
          role: role || undefined,
          is_active: isActive || undefined,
          ordering,
          page: 1,
        },
      })
      setUsers(data.results || [])
      setCount(data.count || 0)
    } catch {
      setUsers([])
      setError('Не удалось загрузить пользователей.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadUsers, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, role, isActive, ordering])

  const startEdit = (row) => {
    setEditUser({
      id: row.id,
      username: row.username || '',
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      middle_name: row.middle_name || '',
      email: row.email || '',
      phone: row.phone || '',
      group_name: row.group_name || '',
      role: row.role,
      is_active: Boolean(row.is_active),
      is_verified: Boolean(row.is_verified),
      new_password: '',
      avatar_url: row.avatar_url || '',
    })
    setAvatarFile(null)
  }

  const saveEdit = async (event) => {
    event.preventDefault()
    if (!editUser) return

    setSaving(true)
    setError('')
    try {
      const payload = {
        username: editUser.username,
        first_name: editUser.first_name,
        last_name: editUser.last_name,
        middle_name: editUser.middle_name,
        email: editUser.email,
        phone: editUser.phone,
        group_name: editUser.group_name,
        role: editUser.role,
        is_active: editUser.is_active,
        is_verified: editUser.is_verified,
        ...(editUser.new_password ? { new_password: editUser.new_password } : {}),
      }

      if (avatarFile) {
        const formData = new FormData()
        formData.append('file', avatarFile)
        const avatarResponse = await apiClient.post('/auth/upload-avatar/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        payload.avatar_url = avatarResponse.data?.avatar_url || ''
      }

      await apiClient.patch(`/auth/users/${editUser.id}/`, payload)
      await loadUsers()
      setEditUser(null)
      setAvatarFile(null)
    } catch (requestError) {
      const data = requestError.response?.data
      const detail = data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else if (data && typeof data === 'object') {
        const firstField = Object.keys(data)[0]
        const fieldError = data[firstField]
        if (Array.isArray(fieldError) && fieldError.length) {
          setError(`${firstField}: ${fieldError[0]}`)
        } else {
          setError('Проверьте корректность введенных данных.')
        }
      } else {
        setError('Не удалось сохранить профиль пользователя.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Управление пользователями</h1>
          <p>Доступно только куратору и администратору.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page detail-asym-layout">
      <section className="main-column">
        <article className="panel">
          <h1>Управление пользователями</h1>
          <p className="muted-text">Поиск, фильтрация, сортировка и редактирование профилей.</p>

          <div className="toolbar-actions wrap-actions" style={{ marginTop: '10px' }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск: ФИО, логин, email, группа"
            />

            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select value={isActive} onChange={(event) => setIsActive(event.target.value)}>
              <option value="">Все состояния</option>
              <option value="true">Активные</option>
              <option value="false">Неактивные</option>
            </select>

            <select value={ordering} onChange={(event) => setOrdering(event.target.value)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <p style={{ marginTop: '8px' }}>
            Найдено пользователей: <strong>{count}</strong>
          </p>
        </article>

        <article className="panel">
          <h2>Список пользователей</h2>
          {loading ? <p>Загрузка...</p> : null}
          {error ? <p className="error">{error}</p> : null}

          <ul className="list">
            {users.map((row) => (
              <li key={row.id} className="list-item">
                <div>
                  <strong>{row.full_name || row.username}</strong>
                  {row.avatar_url ? (
                    <div className="avatar-preview-wrap">
                      <img className="avatar-preview" src={resolveAssetUrl(row.avatar_url)} alt={`Аватар ${row.username}`} />
                    </div>
                  ) : null}
                  <p>Логин: {row.username}</p>
                  <p>Роль: {formatRole(row.role)}</p>
                  <p>Группа: {row.group_name || '-'}</p>
                  <p>Статус: {row.is_active ? 'активен' : 'неактивен'}</p>
                </div>
                <button type="button" onClick={() => startEdit(row)}>
                  Редактировать
                </button>
              </li>
            ))}
            {!loading && users.length === 0 ? <li className="list-item">Пользователи не найдены.</li> : null}
          </ul>
        </article>
      </section>

      <aside className="side-column">
        <article className="panel soft-panel">
          <h2>{editUser ? 'Редактирование профиля' : 'Выберите пользователя'}</h2>
          {!editUser ? <p>Нажмите «Редактировать» у нужного пользователя.</p> : null}

          {editUser ? (
            <form className="project-form" onSubmit={saveEdit}>
              <label>
                Логин
                <input
                  value={editUser.username}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, username: event.target.value }))}
                  required
                />
              </label>

              <FileDropZone
                label="Аватар (необязательно)"
                accept="image/*"
                hint="Перетащите изображение (JPG, PNG, WEBP, GIF)"
                file={avatarFile}
                onFileSelect={setAvatarFile}
              />

              {editUser.avatar_url ? (
                <div className="avatar-preview-wrap">
                  <img
                    className="avatar-preview"
                    src={resolveAssetUrl(editUser.avatar_url)}
                    alt={`Текущий аватар ${editUser.username}`}
                  />
                </div>
              ) : null}

              <label>
                Фамилия
                <input
                  value={editUser.last_name}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, last_name: event.target.value }))}
                />
              </label>
              <label>
                Имя
                <input
                  value={editUser.first_name}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, first_name: event.target.value }))}
                />
              </label>
              <label>
                Отчество
                <input
                  value={editUser.middle_name}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, middle_name: event.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={editUser.email}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, email: event.target.value }))}
                />
              </label>
              <label>
                Телефон
                <input
                  value={editUser.phone}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
              <label>
                Учебная группа
                <input
                  value={editUser.group_name}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, group_name: event.target.value }))}
                />
              </label>
              <label>
                Роль
                <select
                  value={editUser.role}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, role: event.target.value }))}
                >
                  {roleOptions
                    .filter((option) => option.value)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editUser.is_active}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                <span>Активный пользователь</span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={editUser.is_verified}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, is_verified: event.target.checked }))}
                />
                <span>Пользователь подтвержден</span>
              </label>

              <label>
                Новый пароль (необязательно)
                <input
                  type="password"
                  value={editUser.new_password}
                  onChange={(event) => setEditUser((prev) => ({ ...prev, new_password: event.target.value }))}
                  placeholder="Оставьте пустым, если не нужно менять"
                />
              </label>

              <button type="submit" disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить профиль'}
              </button>
            </form>
          ) : null}
        </article>
      </aside>
    </main>
  )
}
