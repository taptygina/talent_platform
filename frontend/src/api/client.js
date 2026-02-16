import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

let accessToken = null
let refreshToken = null
let refreshPromise = null

export function setAuthTokens(tokens = {}) {
  accessToken = tokens.access || null
  refreshToken = tokens.refresh || null
}

export function clearAuthTokens() {
  accessToken = null
  refreshToken = null
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const status = error.response?.status
    const url = originalRequest?.url || ''

    if (!originalRequest || status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Не пытаемся рефрешить логин/логаут/сам рефреш
    if (url.includes('/auth/login/') || url.includes('/auth/logout/') || url.includes('/auth/refresh/')) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      if (!refreshPromise) {
        refreshPromise = apiClient
          .post('/auth/refresh/', refreshToken ? { refresh: refreshToken } : undefined)
          .then((response) => {
            setAuthTokens({
              access: response.data?.access,
              refresh: response.data?.refresh,
            })
            return response.data
          })
          .finally(() => {
            refreshPromise = null
          })
      }

      await refreshPromise
      return apiClient(originalRequest)
    } catch (refreshError) {
      clearAuthTokens()
      return Promise.reject(refreshError)
    }
  },
)
