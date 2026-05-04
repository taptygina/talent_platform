import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src')
const exts = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html'])
const findings = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (exts.has(path.extname(entry.name))) {
      const text = fs.readFileSync(full, 'utf8')
      const lines = text.split(/\r?\n/)
      lines.forEach((line, idx) => {
        if (line.includes('????')) {
          findings.push(`${path.relative(process.cwd(), full)}:${idx + 1}: ${line.trim()}`)
        }
      })
    }
  }
}

walk(root)

if (findings.length) {
  console.error('Найдены битые строки (????) в файлах:')
  for (const item of findings) console.error(item)
  process.exit(1)
}

console.log('Проверка текста пройдена: битых строк не найдено.')
