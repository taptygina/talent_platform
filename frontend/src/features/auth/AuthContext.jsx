import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { apiClient, clearAuthTokens, setAuthTokens } from '../../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    const load = async () => {
      try {
        try {
          const refreshResponse = await apiClient.post('/auth/refresh/')
          setAuthTokens({
            access: refreshResponse.data?.access,
            refresh: refreshResponse.data?.refresh,
          })
        } catch {
          // Если рефреш не удался, просто попробуем me (могут сработать cookies текущей сессии)
        }

        const { data } = await apiClient.get('/auth/me/')
        if (!ignore) setUser(data)
      } catch {
        clearAuthTokens()
        if (!ignore) setUser(null)
      } finally {
        if (!ignore) setIsLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [])

  const login = async (username, password) => {
    const { data } = await apiClient.post('/auth/login/', { username, password })
    setAuthTokens({
      access: data?.access,
      refresh: data?.refresh,
    })
    setUser(data.user)
    return data.user
  }

  const logout = async () => {
    await apiClient.post('/auth/logout/')
    clearAuthTokens()
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [isLoading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
