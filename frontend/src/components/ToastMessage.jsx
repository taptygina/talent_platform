export function ToastMessage({ message, type = 'info', visible }) {
  if (!message) return null

  const className = [
    'toast-message',
    visible ? 'toast-visible' : 'toast-hidden',
    type === 'error' ? 'toast-error' : 'toast-info',
  ].join(' ')

  return (
    <div className={className} role="status" aria-live="polite">
      {message}
    </div>
  )
}
