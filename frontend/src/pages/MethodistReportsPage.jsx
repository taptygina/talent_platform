import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import { formatProjectStatus, formatProjectType } from '../utils/labels'

const PROJECT_TYPE_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: 'contest', label: 'Конкурс' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'coursework', label: 'Курсовой проект' },
  { value: 'diploma', label: 'Дипломный проект' },
  { value: 'other', label: 'Другое' },
]

const chartColors = ['#0f766e', '#c57b39', '#2a67b3', '#748091', '#2f8a5b', '#c3484d']

function getTopRow(rows, labelFormatter) {
  const top = [...rows].sort((left, right) => (right.total || 0) - (left.total || 0))[0]
  if (!top || !top.total) return null
  const key = top.status || top.type || top.month
  return {
    label: labelFormatter(key),
    total: top.total,
  }
}

function ChartFrame({ title, subtitle, insight, legend, children }) {
  return (
    <>
      <div className="chart-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="muted-text">{subtitle}</p> : null}
        </div>
      </div>
      <div className="chart-body">
        <div className="chart-visual">{children}</div>
        {legend?.length ? (
          <ul className="chart-legend" aria-label="Легенда графика">
            {legend.map((item) => (
              <li
                key={item.key}
                className={`chart-legend-item ${item.active ? 'chart-legend-item-active' : ''}`}
                onClick={item.onSelect}
              >
                <span className="legend-swatch" style={{ background: item.color }} />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {insight ? <p className="chart-insight">{insight}</p> : null}
    </>
  )
}

function BarChart({ rows, activeKey, onSelect }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.total || 0))
  const total = Math.max(1, rows.reduce((acc, row) => acc + (row.total || 0), 0))
  return (
    <svg className="chart-svg" viewBox="0 0 460 220" role="img" aria-label="Гистограмма по статусам">
      {rows.map((row, index) => {
        const width = 70
        const gap = 18
        const x = 20 + index * (width + gap)
        const rawHeight = Math.round(((row.total || 0) / maxValue) * 140)
        const barHeight = row.total > 0 ? Math.max(6, rawHeight) : 2
        const y = 170 - barHeight
        const isActive = activeKey === row.status
        const percent = Math.round(((row.total || 0) / total) * 1000) / 10
        return (
          <g
            key={row.status || index}
            className={`chart-item ${isActive ? 'chart-item-active' : ''}`}
            onClick={() => onSelect(isActive ? '' : row.status)}
            data-tip-label={formatProjectStatus(row.status)}
            data-tip-value={row.total || 0}
            data-tip-percent={percent}
            style={{ cursor: 'pointer' }}
          >
            <rect x={x} y={y} width={width} height={barHeight} rx="8" fill={isActive ? '#0b5e58' : '#79bcb6'} />
            <text x={x + width / 2} y={188} textAnchor="middle" fontSize="11" fill="#30484a">
              {formatProjectStatus(row.status)}
            </text>
            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize="11" fill="#1c2a2b">
              {row.total || 0}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function PieChart({ rows, activeKey, onSelect }) {
  const rawTotal = rows.reduce((acc, row) => acc + (row.total || 0), 0)
  const total = Math.max(1, rawTotal)
  const nonZeroRows = rows.filter((row) => (row.total || 0) > 0)
  const colors = chartColors
  let startAngle = -Math.PI / 2

  const sectors = rows.map((row, index) => {
    const part = (row.total || 0) / total
    const angle = Math.max(part * Math.PI * 2, 0)
    const endAngle = startAngle + angle

    const r = 78
    const cx = 110
    const cy = 96
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

    const item = { row, path, color: colors[index % colors.length], angle }
    startAngle = endAngle
    return item
  })

  return (
    <div className="pie-wrap">
      <svg className="chart-svg" viewBox="0 0 220 220" role="img" aria-label="Круговая диаграмма по типам">
        {rawTotal === 0 ? <circle cx="110" cy="96" r="78" fill="#e7efec" stroke="#d3dfdb" strokeWidth="1.5" /> : null}
        {nonZeroRows.length === 1 ? (
          <circle
            cx="110"
            cy="96"
            r="78"
            fill={colors[rows.findIndex((row) => row.type === nonZeroRows[0].type) % colors.length]}
            stroke={activeKey === nonZeroRows[0].type ? '#1c2a2b' : '#ffffff'}
            strokeWidth={activeKey === nonZeroRows[0].type ? 3 : 1}
            onClick={() => onSelect(activeKey === nonZeroRows[0].type ? '' : nonZeroRows[0].type)}
            data-tip-label={formatProjectType(nonZeroRows[0].type)}
            data-tip-value={nonZeroRows[0].total || 0}
            data-tip-percent={100}
            style={{ cursor: 'pointer' }}
            className={`chart-item ${activeKey === nonZeroRows[0].type ? 'chart-item-active' : ''}`}
          />
        ) : null}
        {nonZeroRows.length !== 1 && sectors.map(({ row, path, color, angle }) => {
          if (angle <= 0.0001) return null
          const isActive = activeKey === row.type
          const percent = Math.round(((row.total || 0) / total) * 1000) / 10
          return (
            <path
              key={row.type}
              d={path}
              className={`chart-item ${isActive ? 'chart-item-active' : ''}`}
              fill={color}
              stroke={isActive ? '#1c2a2b' : '#ffffff'}
              strokeWidth={isActive ? 3 : 1}
              onClick={() => onSelect(isActive ? '' : row.type)}
              data-tip-label={formatProjectType(row.type)}
              data-tip-value={row.total || 0}
              data-tip-percent={percent}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </svg>
    </div>
  )
}

function LineChart({ rows, activeKey, onSelect }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.total || 0))
  const left = 28
  const right = 430
  const top = 18
  const bottom = 160
  const width = Math.max(1, right - left)
  const step = rows.length > 1 ? width / (rows.length - 1) : width

  const points = rows.map((row, index) => {
    const x = left + index * step
    const y = bottom - ((row.total || 0) / maxValue) * (bottom - top)
    return { ...row, x, y }
  })

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const total = Math.max(1, rows.reduce((acc, row) => acc + (row.total || 0), 0))

  return (
    <svg className="chart-svg" viewBox="0 0 460 220" role="img" aria-label="Динамика проектов за 12 месяцев">
      <polyline fill="none" stroke="#0f766e" strokeWidth="3" points={polyline} />
      {points.map((point) => {
        const isActive = activeKey === point.month
        const percent = Math.round(((point.total || 0) / total) * 1000) / 10
        return (
          <g
            key={point.month}
            className={`chart-item ${isActive ? 'chart-item-active' : ''}`}
            onClick={() => onSelect(isActive ? '' : point.month)}
            data-tip-label={`Месяц ${point.month}`}
            data-tip-value={point.total || 0}
            data-tip-percent={percent}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={point.x} cy={point.y} r={isActive ? 6 : 4} fill={isActive ? '#c57b39' : '#0f766e'} />
            <text x={point.x} y={184} textAnchor="middle" fontSize="10" fill="#40585a">{point.month.slice(2)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function MethodistReportsPage() {
  const { user } = useAuth()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [projectType, setProjectType] = useState('')
  const [supervisor, setSupervisor] = useState('')

  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, label: '', value: 0, percent: 0 })

  const canView = useMemo(() => ['student', 'teacher', 'methodist', 'curator', 'admin'].includes(user?.role), [user?.role])
  const isPlatformScopeRole = useMemo(() => ['methodist', 'curator', 'admin'].includes(user?.role), [user?.role])

  const loadAnalytics = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get('/projects/methodist_analytics/', {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          project_type: projectType || undefined,
          supervisor: supervisor || undefined,
          selected_status: selectedStatus || undefined,
          selected_type: selectedType || undefined,
          selected_month: selectedMonth || undefined,
        },
      })
      setData(response.data)
    } catch {
      setError('Не удалось загрузить интерактивную аналитику.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAnalytics()
    }, 220)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, projectType, supervisor, selectedStatus, selectedType, selectedMonth])

  const resetDrilldown = () => {
    setSelectedStatus('')
    setSelectedType('')
    setSelectedMonth('')
  }

  const onChartMouseMove = (event) => {
    const target = event.target?.closest?.('[data-tip-label]')
    if (!target) {
      if (tooltip.visible) setTooltip((prev) => ({ ...prev, visible: false }))
      return
    }
    const label = target.getAttribute('data-tip-label') || ''
    const value = Number(target.getAttribute('data-tip-value') || 0)
    const percent = Number(target.getAttribute('data-tip-percent') || 0)
    setTooltip({
      visible: true,
      x: event.clientX + 14,
      y: event.clientY + 14,
      label,
      value,
      percent,
    })
  }

  const onChartMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }

  if (!canView) {
    return (
      <main className="page">
        <section className="panel centered-panel">
          <h1>Отчеты методиста</h1>
          <p>Раздел доступен только методисту, куратору и администратору.</p>
        </section>
      </main>
    )
  }

  const chartData = data?.charts || { status_counts: [], type_counts: [], monthly_counts: [] }
  const tableProjects = data?.table?.projects || []
  const topStatus = getTopRow(chartData.status_counts, formatProjectStatus)
  const topType = getTopRow(chartData.type_counts, formatProjectType)
  const topMonth = getTopRow(chartData.monthly_counts, (value) => value)
  const statusLegend = chartData.status_counts.map((row, index) => ({
    key: row.status,
    label: formatProjectStatus(row.status),
    value: row.total || 0,
    color: selectedStatus === row.status ? '#0b5e58' : '#79bcb6',
    active: selectedStatus === row.status,
    onSelect: () => setSelectedStatus(selectedStatus === row.status ? '' : row.status),
  }))
  const typeLegend = chartData.type_counts.map((row, index) => ({
    key: row.type,
    label: formatProjectType(row.type),
    value: row.total || 0,
    color: chartColors[index % chartColors.length],
    active: selectedType === row.type,
    onSelect: () => setSelectedType(selectedType === row.type ? '' : row.type),
  }))
  const monthLegend = [
    {
      key: 'created',
      label: 'Созданные проекты',
      value: chartData.monthly_counts.reduce((acc, row) => acc + (row.total || 0), 0),
      color: '#0f766e',
    },
    selectedMonth
      ? {
          key: 'selected',
          label: `Выбранный месяц ${selectedMonth}`,
          value: chartData.monthly_counts.find((row) => row.month === selectedMonth)?.total || 0,
          color: '#c57b39',
          active: true,
          onSelect: () => setSelectedMonth(''),
        }
      : null,
  ].filter(Boolean)
  const scope = data?.scope || (isPlatformScopeRole ? 'platform' : 'personal')
  const title = scope === 'platform' ? 'Интерактивная аналитика платформы' : 'Моя личная аналитика'
  const subtitle = scope === 'platform'
    ? 'Общие показатели платформы и пользователей. Кликайте по диаграммам для drilldown.'
    : 'Личная статистика по вашим проектам. Кликайте по диаграммам для детализации.'

  return (
    <main className="page analytics-sandwich-layout">
      <section className="panel">
        <h1>{title}</h1>
        <p className="muted-text">{subtitle}</p>

        <div className="toolbar-actions wrap-actions">
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <select value={projectType} onChange={(event) => setProjectType(event.target.value)}>
            {PROJECT_TYPE_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
          {scope === 'platform' ? (
            <select value={supervisor} onChange={(event) => setSupervisor(event.target.value)}>
              <option value="">Все преподаватели</option>
              {(data?.supervisors || []).map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
              ))}
            </select>
          ) : null}
          <button type="button" className="button-ghost" onClick={resetDrilldown}>Сбросить клики</button>
        </div>
      </section>

      {loading ? <section className="panel">Загрузка аналитики...</section> : null}
      {error ? <section className="panel error">{error}</section> : null}

      {data ? (
        <>
          <section className="data-grid analytics-charts-grid" onMouseMove={onChartMouseMove} onMouseLeave={onChartMouseLeave}>
            <article className="panel chart-panel">
              <ChartFrame
                title="В каком состоянии находятся проекты?"
                subtitle="Статусы показывают, где нужна управленческая реакция."
                insight={topStatus ? `Больше всего проектов в статусе «${topStatus.label}»: ${topStatus.total}.` : 'Пока нет данных для вывода.'}
                legend={statusLegend}
              >
                <BarChart rows={chartData.status_counts} activeKey={selectedStatus} onSelect={setSelectedStatus} />
              </ChartFrame>
            </article>

            <article className="panel chart-panel">
              <ChartFrame
                title="Какие типы проектов преобладают?"
                subtitle="Распределение помогает видеть баланс учебных форматов."
                insight={topType ? `Лидирует тип «${topType.label}»: ${topType.total}.` : 'Пока нет данных для вывода.'}
                legend={typeLegend}
              >
                <PieChart rows={chartData.type_counts} activeKey={selectedType} onSelect={setSelectedType} />
              </ChartFrame>
            </article>

            <article className="panel chart-wide chart-panel">
              <ChartFrame
                title="Как менялась проектная активность за год?"
                subtitle="Динамика показывает месяцы роста и просадки."
                insight={topMonth ? `Пиковый месяц: ${topMonth.label}, создано проектов: ${topMonth.total}.` : 'Пока нет данных для вывода.'}
                legend={monthLegend}
              >
                <LineChart rows={chartData.monthly_counts} activeKey={selectedMonth} onSelect={setSelectedMonth} />
              </ChartFrame>
            </article>
          </section>
          {tooltip.visible ? (
            <div className="chart-tooltip" style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}>
              <div className="chart-tooltip-label">{tooltip.label}</div>
              <div className="chart-tooltip-meta">
                <span>Значение: <strong>{tooltip.value}</strong></span>
                <span>Доля: <strong>{tooltip.percent}%</strong></span>
              </div>
            </div>
          ) : null}

          <section className="panel">
            <h2>Детальные данные проектов</h2>
            <p className="muted-text">Показано: {data?.table?.count || 0}</p>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Тип</th>
                    <th>Статус</th>
                    <th>Преподаватель</th>
                    <th>Создан</th>
                    <th>Начало</th>
                    <th>Завершение</th>
                  </tr>
                </thead>
                <tbody>
                  {tableProjects.map((project) => (
                    <tr key={project.id}>
                      <td>{project.id}</td>
                      <td>{project.title}</td>
                      <td>{formatProjectType(project.type)}</td>
                      <td>{formatProjectStatus(project.status)}</td>
                      <td>{project.supervisor_name}</td>
                      <td>{project.created_at ? String(project.created_at).slice(0, 10) : '-'}</td>
                      <td>{project.start_date || '-'}</td>
                      <td>{project.end_date || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
