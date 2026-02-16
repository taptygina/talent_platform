import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'

export function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <div className="screen-center">Загрузка...</div>
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />

  return children
}
