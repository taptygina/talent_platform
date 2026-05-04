import { useEffect, useMemo, useRef } from 'react'

import { sanitizeRichHtml } from '../utils/html'

function exec(command, value = null) {
  document.execCommand(command, false, value)
}

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/webp',
])

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Введите текст...',
  minHeight = 180,
  defaultStyle = null,
}) {
  const editorRef = useRef(null)
  const imageInputRef = useRef(null)

  const safeValue = useMemo(() => sanitizeRichHtml(value || ''), [value])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (editor.innerHTML !== safeValue) editor.innerHTML = safeValue
  }, [safeValue])

  const notifyChange = () => {
    const editor = editorRef.current
    if (!editor) return
    onChange?.(sanitizeRichHtml(editor.innerHTML))
  }

  const wrapAction = (callback) => {
    callback()
    notifyChange()
    editorRef.current?.focus()
  }

  const onInsertLink = () => {
    const url = window.prompt('Введите ссылку')
    if (!url) return
    wrapAction(() => exec('createLink', url))
  }

  const onInsertImage = () => {
    imageInputRef.current?.click()
  }

  const onImageFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!SUPPORTED_IMAGE_TYPES.has((file.type || '').toLowerCase())) {
      window.alert('Поддерживаются изображения PNG, JPG, GIF, BMP, TIFF и WEBP.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      wrapAction(() => exec('insertImage', dataUrl))
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="rte-wrap">
      <input
        ref={imageInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp"
        style={{ display: 'none' }}
        onChange={onImageFileChange}
      />
      <div className="rte-toolbar" role="toolbar" aria-label="Панель форматирования текста">
        <button type="button" onClick={() => wrapAction(() => exec('bold'))}>Ж</button>
        <button type="button" onClick={() => wrapAction(() => exec('italic'))}>К</button>
        <button type="button" onClick={() => wrapAction(() => exec('underline'))}>Ч</button>
        <button type="button" onClick={() => wrapAction(() => exec('insertUnorderedList'))}>Список</button>
        <button type="button" onClick={() => wrapAction(() => exec('justifyLeft'))}>Влево</button>
        <button type="button" onClick={() => wrapAction(() => exec('justifyCenter'))}>Центр</button>
        <button type="button" onClick={() => wrapAction(() => exec('justifyRight'))}>Вправо</button>
        <button type="button" onClick={onInsertLink}>Ссылка</button>
        <button type="button" onClick={onInsertImage}>Изображение</button>
        <button type="button" onClick={() => wrapAction(() => exec('removeFormat'))}>Очистить</button>
      </div>

      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable
        role="textbox"
        aria-label="Редактор текста"
        data-placeholder={placeholder}
        onInput={notifyChange}
        onBlur={notifyChange}
        style={{
          minHeight,
          fontFamily: defaultStyle?.font_family || undefined,
          fontSize: defaultStyle?.font_size_pt ? `${defaultStyle.font_size_pt}pt` : undefined,
          textAlign: defaultStyle?.text_align || undefined,
          lineHeight: defaultStyle?.line_spacing || undefined,
        }}
      />
    </div>
  )
}
