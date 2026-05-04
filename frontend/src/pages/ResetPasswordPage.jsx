import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiClient } from '../api/client'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const uid = useMemo(() => searchParams.get('uid') || '', [searchParams])
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!uid || !token) {
      setError('Ссылка восстановления некорректна.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post('/auth/password-reset/confirm/', {
        uid,
        token,
        new_password: newPassword,
      })
      setMessage(data?.detail || 'Пароль успешно восстановлен.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось восстановить пароль.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <form className="panel auth-panel" onSubmit={onSubmit}>
        <h1>Новый пароль</h1>
        <p>Введите новый пароль для вашего аккаунта.</p>

        <label>
          Новый пароль
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        </label>

        <label>
          Повторите пароль
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </label>

        {message ? <p>{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Сохранение...' : 'Сохранить пароль'}
        </button>

        <Link to="/login">Перейти ко входу</Link>
      </form>
    </main>
  )
}
