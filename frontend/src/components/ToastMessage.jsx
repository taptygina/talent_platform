export function ToastMessage({ message, type = 'info', visible }) {
  if (!message) return null

  const toneClass = {
    error: 'toast-error',
    success: 'toast-success',
    warning: 'toast-warning',
    info: 'toast-info',
  }[type] || 'toast-info'

  const className = [
    'toast-message',
    visible ? 'toast-visible' : 'toast-hidden',
    toneClass,
  ].join(' ')

  return (
    <div className={className} role="status" aria-live="polite">
      {message}
    </div>
  )
}
