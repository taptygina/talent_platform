import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/'

  if (isAuthenticated) return <Navigate to={redirectTo} replace />

  const onSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      await login(username, password)
      navigate(redirectTo, { replace: true })
    } catch {
      setError('Неверный логин или пароль.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <form className="panel auth-panel" onSubmit={onSubmit}>
        <h1>Инженерия проектов</h1>
        <p>Вход в систему управления талантами и проектной деятельностью.</p>

        <label>
          Логин
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>

        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error ? <p className="error">{error}</p> : null}

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </main>
  )
}
