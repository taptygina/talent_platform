export function sanitizeRichHtml(source) {
  if (!source) return ''
  const parser = new DOMParser()
  const doc = parser.parseFromString(String(source), 'text/html')

  doc.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove())

  doc.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = String(attr.value || '').trim().toLowerCase()
      if (name.startsWith('on')) node.removeAttribute(attr.name)
      if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        node.removeAttribute(attr.name)
      }
    })
  })

  return doc.body.innerHTML
}
