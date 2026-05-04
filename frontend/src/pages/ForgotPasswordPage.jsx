import { useState } from 'react'
import { Link } from 'react-router-dom'

import { apiClient } from '../api/client'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post('/auth/password-reset/', { email })
      setMessage(data?.detail || 'Если пользователь с такой почтой существует, письмо отправлено.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось отправить запрос на восстановление.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <form className="panel auth-panel" onSubmit={onSubmit}>
        <h1>Восстановление пароля</h1>
        <p>Введите email, и мы отправим ссылку для сброса пароля.</p>

        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>

        {message ? <p>{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Отправка...' : 'Отправить ссылку'}
        </button>

        <Link to="/login">Назад ко входу</Link>
      </form>
    </main>
  )
}
