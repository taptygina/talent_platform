import { useRef, useState } from 'react'

export function FileDropZone({
  accept = '*',
  label,
  hint,
  file,
  onFileSelect,
}) {
  const inputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  const pickFile = () => inputRef.current?.click()

  const handleFiles = (files) => {
    const selected = files?.[0] || null
    onFileSelect(selected)
  }

  const clearFile = (event) => {
    event.stopPropagation()
    if (inputRef.current) inputRef.current.value = ''
    onFileSelect(null)
  }

  const replaceFile = (event) => {
    event.stopPropagation()
    pickFile()
  }

  const onDrop = (event) => {
    event.preventDefault()
    setDragActive(false)
    handleFiles(event.dataTransfer?.files)
  }

  return (
    <div className="dropzone-wrapper">
      {label ? <p className="dropzone-label">{label}</p> : null}
      <div
        className={[
          'dropzone',
          dragActive ? 'dropzone-active' : '',
          file ? 'dropzone-selected' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={pickFile}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            pickFile()
          }
        }}
      >
        <p>Перетащите файл сюда или нажмите для выбора</p>
        {hint ? <p className="muted-text">{hint}</p> : null}
        {file ? (
          <div className="dropzone-file-row">
            <span className="dropzone-file">Выбран файл: {file.name}</span>
            <span className="dropzone-file-actions">
              <button type="button" className="button-ghost" onClick={replaceFile}>
                Заменить
              </button>
              <button type="button" className="button-danger" onClick={clearFile}>
                Убрать
              </button>
            </span>
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        className="dropzone-input"
        type="file"
        accept={accept}
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  )
}
