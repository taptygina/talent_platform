import { useState } from 'react'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatRole } from '../utils/labels'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onChangePassword = async (event) => {
    event.preventDefault()
    setMessage('')
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Новый пароль и подтверждение не совпадают.')
      return
    }
    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
      })
      setMessage(data?.detail || 'Пароль успешно изменен.')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await logout()
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось сменить пароль.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page profile-page">
      <section className="profile-main">
        <article className="panel">
          <h1>Профиль пользователя</h1>
          <p className="muted-text">Личные данные, роль и безопасность аккаунта.</p>
        </article>

        <div className="info-grid profile-info-grid">
          <article className="panel soft-panel">
            <h2>Основная информация</h2>
            <p>
              ФИО: <strong>{user?.full_name || '-'}</strong>
            </p>
            <p>
              Логин: <strong>{user?.username || '-'}</strong>
            </p>
            <p>
              Email: <strong>{user?.email || '-'}</strong>
            </p>
          </article>

          <article className="panel soft-panel">
            <h2>Роль в системе</h2>
            <p>
              Текущая роль: <strong>{formatRole(user?.role)}</strong>
            </p>
            <p className="muted-text">
              Права доступа определяются ролью и правилами безопасности платформы.
            </p>
          </article>

          <article className="panel soft-panel profile-password-card">
            <h2>Смена пароля</h2>
            <form className="project-form" onSubmit={onChangePassword}>
              <label>
                Текущий пароль
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  required
                />
              </label>

              <label>
                Новый пароль
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>

              <label>
                Повторите новый пароль
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>

              {message ? <p>{message}</p> : null}
              {error ? <p className="error">{error}</p> : null}

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Сохранение...' : 'Сменить пароль'}
              </button>
            </form>
          </article>
        </div>
      </section>
    </main>
  )
}
