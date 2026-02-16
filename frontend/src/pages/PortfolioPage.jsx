import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'

function BarChart({ title, data }) {
  const width = 620
  const height = 260
  const maxValue = Math.max(1, ...data.map((item) => item.value))
  const barWidth = data.length ? Math.max(20, Math.floor((width - 80) / data.length) - 8) : 20

  return (
    <section className="panel soft-panel">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
        <line x1="50" y1="20" x2="50" y2="220" stroke="#88a0ce" />
        <line x1="50" y1="220" x2={width - 20} y2="220" stroke="#88a0ce" />
        {data.map((item, index) => {
          const x = 60 + index * (barWidth + 8)
          const barHeight = Math.round((item.value / maxValue) * 170)
          const y = 220 - barHeight
          return (
            <g key={`${item.label}-${index}`}>
              <rect x={x} y={y} width={barWidth} height={barHeight} fill="#2059b8" rx="4" />
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="10" fill="#17376d">
                {item.value}
              </text>
              <text x={x + barWidth / 2} y="236" textAnchor="middle" fontSize="9" fill="#31496f">
                {item.shortLabel}
              </text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}

function LineChart({ title, data }) {
  const width = 620
  const height = 260
  const maxValue = Math.max(1, ...data.map((item) => item.value))
  const stepX = data.length > 1 ? (width - 100) / (data.length - 1) : 1
  const points = data
    .map((item, index) => {
      const x = 60 + index * stepX
      const y = 220 - (item.value / maxValue) * 170
      return `${x},${y}`
    })
    .join(' ')

  return (
    <section className="panel soft-panel">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
        <line x1="50" y1="20" x2="50" y2="220" stroke="#88a0ce" />
        <line x1="50" y1="220" x2={width - 20} y2="220" stroke="#88a0ce" />
        <polyline fill="none" stroke="#e16a2b" strokeWidth="3" points={points} />
        {data.map((item, index) => {
          const x = 60 + index * stepX
          const y = 220 - (item.value / maxValue) * 170
          return (
            <g key={`${item.label}-${index}`}>
              <circle cx={x} cy={y} r="4" fill="#e16a2b" />
              <text x={x} y={y - 8} textAnchor="middle" fontSize="10" fill="#17376d">
                {item.value}
              </text>
              <text x={x} y="236" textAnchor="middle" fontSize="9" fill="#31496f">
                {item.shortLabel}
              </text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}

function PieChart({ title, data }) {
  const radius = 85
  const cx = 150
  const cy = 130
  const total = Math.max(1, data.reduce((sum, item) => sum + item.value, 0))
  const colors = ['#2059b8', '#e16a2b', '#2b8f5f', '#d29b1f', '#6850b8', '#4293aa']

  let startAngle = -Math.PI / 2
  const slices = data.map((item, index) => {
    const angle = (item.value / total) * Math.PI * 2
    const endAngle = startAngle + angle
    const x1 = cx + radius * Math.cos(startAngle)
    const y1 = cy + radius * Math.sin(startAngle)
    const x2 = cx + radius * Math.cos(endAngle)
    const y2 = cy + radius * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
    const slice = { d, color: colors[index % colors.length], label: item.label, value: item.value }
    startAngle = endAngle
    return slice
  })

  return (
    <section className="panel soft-panel">
      <h3>{title}</h3>
      <div className="pie-layout">
        <svg viewBox="0 0 300 260" className="chart-svg">
          {slices.map((slice, index) => (
            <path key={index} d={slice.d} fill={slice.color} stroke="#ffffff" strokeWidth="1" />
          ))}
        </svg>
        <ul className="list compact-list">
          {slices.map((slice, index) => (
            <li key={index} className="list-item">
              <div className="legend-row">
                <span className="legend-swatch" style={{ background: slice.color }} />
                <span>{slice.label}</span>
              </div>
              <strong>{slice.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function PortfolioPage() {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState({ top_students: [], top_teachers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (params = {}) => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get('/projects/portfolio/', {
        params: {
          search: (params.search ?? search) || undefined,
          date_from: (params.dateFrom ?? dateFrom) || undefined,
          date_to: (params.dateTo ?? dateTo) || undefined,
          limit: params.limit ?? limit,
        },
      })
      setData(response.data)
    } catch {
      setError('Не удалось загрузить аналитику портфолио.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      load({
        search,
        dateFrom,
        dateTo,
        limit,
      })
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dateFrom, dateTo, limit])

  const studentsChartData = useMemo(
    () =>
      (data.top_students || []).slice(0, 10).map((student) => ({
        label: `${student.last_name} ${student.first_name}`,
        shortLabel: `${student.last_name?.slice(0, 6) || ''}`,
        value: student.completed_count || 0,
      })),
    [data.top_students],
  )

  const teachersChartData = useMemo(
    () =>
      (data.top_teachers || []).slice(0, 10).map((teacher) => ({
        label: `${teacher.last_name} ${teacher.first_name}`,
        shortLabel: `${teacher.last_name?.slice(0, 6) || ''}`,
        value: teacher.completed_count || 0,
      })),
    [data.top_teachers],
  )

  return (
    <main className="page analytics-sandwich-layout">
      <section className="panel">
        <h1>Отчеты и аналитика портфолио</h1>
        <p className="muted-text">F-паттерн: сначала фильтры, затем графики, затем детальные таблицы.</p>

        <div className="toolbar-actions wrap-actions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ФИО или логину" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <input type="number" min="1" max="100" value={limit} onChange={(e) => setLimit(Number(e.target.value || 20))} />
        </div>

        {loading ? <p>Загрузка аналитики...</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="charts-grid">
        <BarChart title="Топ студентов (столбчатая диаграмма)" data={studentsChartData} />
        <LineChart title="Топ преподавателей (линейная диаграмма)" data={teachersChartData} />
        <PieChart title="Вклад преподавателей (круговая диаграмма)" data={teachersChartData.slice(0, 6)} />
      </section>

      <section className="data-grid">
        <article className="panel">
          <h2>Топ студентов</h2>
          <ul className="list">
            {data.top_students?.map((student, index) => (
              <li key={student.id} className="list-item">
                <div>
                  <strong>
                    #{index + 1} {student.last_name} {student.first_name} ({student.username})
                  </strong>
                  <p>Группа: {student.group_name || '-'}</p>
                </div>
                <strong>{student.completed_count}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Топ преподавателей</h2>
          <ul className="list">
            {data.top_teachers?.map((teacher, index) => (
              <li key={teacher.id} className="list-item">
                <div>
                  <strong>
                    #{index + 1} {teacher.last_name} {teacher.first_name} ({teacher.username})
                  </strong>
                </div>
                <strong>{teacher.completed_count}</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  )
}
