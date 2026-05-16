import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'

import { sanitizeRichHtml } from '../utils/html'

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
  const imageInputRef = useRef(null)
  const safeValue = useMemo(() => sanitizeRichHtml(value || ''), [value])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Image,
      TextAlign.configure({
        types: ['paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: safeValue,
    editorProps: {
      attributes: {
        class: 'rte-editor',
        style: [
          `min-height:${minHeight}px`,
          defaultStyle?.font_family ? `font-family:${defaultStyle.font_family}` : '',
          defaultStyle?.font_size_pt ? `font-size:${defaultStyle.font_size_pt}pt` : '',
          defaultStyle?.text_align ? `text-align:${defaultStyle.text_align}` : '',
          defaultStyle?.line_spacing ? `line-height:${defaultStyle.line_spacing}` : '',
        ].filter(Boolean).join(';'),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange?.(sanitizeRichHtml(currentEditor.getHTML()))
    },
    onBlur: ({ editor: currentEditor }) => {
      onChange?.(sanitizeRichHtml(currentEditor.getHTML()))
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = sanitizeRichHtml(editor.getHTML())
    if (current === safeValue) return
    editor.commands.setContent(safeValue, { emitUpdate: false })
  }, [editor, safeValue])

  const onInsertLink = () => {
    if (!editor) return
    const url = window.prompt('Введите ссылку')
    if (!url) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const onInsertImage = () => {
    imageInputRef.current?.click()
  }

  const onImageFileChange = (event) => {
    if (!editor) return
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
      editor.chain().focus().setImage({ src: dataUrl }).run()
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
        <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>Ж</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}>К</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()}>Ч</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>Список</button>
        <button type="button" onClick={() => editor?.chain().focus().setTextAlign('left').run()}>Влево</button>
        <button type="button" onClick={() => editor?.chain().focus().setTextAlign('center').run()}>Центр</button>
        <button type="button" onClick={() => editor?.chain().focus().setTextAlign('right').run()}>Вправо</button>
        <button type="button" onClick={onInsertLink}>Ссылка</button>
        <button type="button" onClick={onInsertImage}>Изображение</button>
        <button type="button" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>Очистить</button>
      </div>
      <EditorContent editor={editor} role="textbox" aria-label="Редактор текста" />
    </div>
  )
}
