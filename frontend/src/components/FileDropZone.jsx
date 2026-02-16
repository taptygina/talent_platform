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

  const onDrop = (event) => {
    event.preventDefault()
    setDragActive(false)
    handleFiles(event.dataTransfer?.files)
  }

  return (
    <div className="dropzone-wrapper">
      {label ? <p className="dropzone-label">{label}</p> : null}
      <div
        className={dragActive ? 'dropzone dropzone-active' : 'dropzone'}
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
        {file ? <p className="dropzone-file">Выбран файл: {file.name}</p> : null}
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
