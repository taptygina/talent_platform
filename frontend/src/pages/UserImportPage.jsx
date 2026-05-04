import { useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import { FileDropZone } from '../components/FileDropZone'
import { useAuth } from '../features/auth/AuthContext'

const roleOptions = [
  { value: 'student', label: 'Студент' },
  { value: 'teacher', label: 'Преподаватель' },
  { value: 'methodist', label: 'Методист' },
  { value: 'curator', label: 'Куратор' },
]

export function UserImportPage() {
  const { user } = useAuth()
  const [role, setRole] = useState('student')
  const [file, setFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPdfDownloading, setIsPdfDownloading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const downloadCredentialsPdf = async (generatedAccounts) => {
    const response = await apiClient.post(
      '/auth/import-users/credentials-pdf/',
      {
        role,
        accounts: generatedAccounts,
      },
      { responseType: 'blob' },
    )

    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `учетные-данные-${role}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const canImport = useMemo(() => ['curator', 'admin'].includes(user?.role), [user?.role])

  const onSubmit = async (event) => {
    event.preventDefault()
    if (!file) {
      setError('Выберите файл .xlsx')
      return
    }

    setError('')
    setResult(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('role', role)
      formData.append('file', file)
      const { data } = await apiClient.post('/auth/import-users/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Ошибка импорта пользователей.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDownloadCredentialsPdf = async () => {
    if (!(result?.generated_accounts || []).length) return
    setError('')
    setIsPdfDownloading(true)
    try {
      await downloadCredentialsPdf(result.generated_accounts)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось скачать PDF с учетными данными.')
    } finally {
      setIsPdfDownloading(false)
    }
  }

  const onDownloadTemplate = async () => {
    setError('')
    try {
      const response = await apiClient.get('/auth/import-users/template/', {
        responseType: 'blob',
      })
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'шаблон-импорта-пользователей.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Не удалось скачать шаблон.')
    }
  }

  if (!canImport) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>Импорт пользователей</h1>
          <p>Импорт доступен только куратору и администратору.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page form-centered-page">
      <section className="panel centered-panel">
        <h1>Импорт пользователей</h1>
        <p className="muted-text">Обязательные поля в Excel: `first_name`, `last_name`.</p>
        <button type="button" onClick={onDownloadTemplate}>
          Скачать шаблон Excel
        </button>

        <form className="auth-panel" onSubmit={onSubmit}>
          <label>
            Роль импортируемых пользователей
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <FileDropZone
            label="Файл Excel"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hint="Поддерживается формат .xlsx"
            file={file}
            onFileSelect={setFile}
          />

          {error ? <p className="error">{error}</p> : null}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Импорт...' : 'Импортировать'}
          </button>
        </form>
      </section>

      {result ? (
        <section className="panel">
          <h2>Результат импорта</h2>
          <p>
            Создано: {result.created} | Пропущено: {result.skipped}
          </p>

          {result.errors?.length ? (
            <>
              <h3>Ошибки</h3>
              <ul className="list">
                {result.errors.map((line) => (
                  <li key={line} className="list-item">
                    {line}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {result.generated_accounts?.length ? (
            <>
              <h3>Сгенерированные учетные записи</h3>
              <button type="button" onClick={onDownloadCredentialsPdf} disabled={isPdfDownloading}>
                {isPdfDownloading ? 'Подготовка PDF...' : 'Скачать PDF с учетными данными'}
              </button>
              <ul className="list">
                {result.generated_accounts.map((account) => (
                  <li key={account.id} className="list-item">
                    <div>
                      <strong>{account.full_name || account.username}</strong>
                      <p>{account.email || '-'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
