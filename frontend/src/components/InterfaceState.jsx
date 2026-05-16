import { Icon } from './Icon'

export function EmptyState({
  title,
  description,
  action,
  icon = 'inbox',
}) {
  return (
    <section className="panel state-panel empty-state">
      <span className="state-icon" aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <div>
        <h2>{title}</h2>
        <p className="muted-text">{description}</p>
      </div>
      {action ? <div className="toolbar-actions">{action}</div> : null}
    </section>
  )
}

export function InlineError({
  title = 'Не удалось загрузить данные',
  description = 'Попробуйте повторить действие. Если ошибка сохранится, проверьте подключение или обновите страницу.',
  onRetry,
}) {
  return (
    <section className="panel state-panel error-state">
      <span className="state-icon state-icon-error" aria-hidden="true">
        <Icon name="x" size={24} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {onRetry ? (
        <div className="toolbar-actions">
          <button type="button" className="button-danger" onClick={onRetry}>
            Повторить
          </button>
        </div>
      ) : null}
    </section>
  )
}

export function CardGridSkeleton({ count = 4 }) {
  return (
    <section className="cards-grid skeleton-grid" aria-label="Загрузка карточек">
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="panel skeleton-card">
          <span className="skeleton-line skeleton-line-lg" />
          <span className="skeleton-line skeleton-line-sm" />
          <span className="skeleton-block" />
          <span className="skeleton-line" />
        </article>
      ))}
    </section>
  )
}

export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <div className="table-skeleton" aria-label="Загрузка таблицы">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="table-skeleton-row">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <span key={columnIndex} className="skeleton-line" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function OperationProgress({ label, progress }) {
  const normalized = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : null
  return (
    <div className="operation-progress" role="status" aria-live="polite">
      <div className="operation-progress-head">
        <span>{label}</span>
        {normalized !== null ? <strong>{normalized}%</strong> : null}
      </div>
      <div className={normalized === null ? 'operation-progress-track operation-progress-indeterminate' : 'operation-progress-track'}>
        <span style={normalized === null ? undefined : { width: `${normalized}%` }} />
      </div>
    </div>
  )
}
