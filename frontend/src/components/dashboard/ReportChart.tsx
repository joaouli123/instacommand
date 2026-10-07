'use client'

import { useId, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, BarChart3, Table2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChartInterval, ChartRow, ChartSeries, downloadReport, fillChartGaps, groupChartRows, reportDate, reportFormat } from '@/lib/report-chart'

export function ReportChart({ title, description, rows, series, defaultKeys, kind = 'area', filename = 'relatorio', empty = 'Não há observações disponíveis nesse período.', fitToData = false }: {
  title: string; description: string; rows: ChartRow[]; series: ChartSeries[]; defaultKeys?: string[]; kind?: 'area' | 'bar'; filename?: string; empty?: string
  // Totals such as followers change little relative to their size; fit the axis to the data so the trend is visible.
  fitToData?: boolean
}) {
  const id = useId()
  // SVG ids cannot contain the colons React puts in useId values.
  const gradientId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  const [interval, setInterval] = useState<ChartInterval>('day')
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [selected, setSelected] = useState(defaultKeys || series.map(s => s.key))
  const active = series.filter(s => selected.includes(s.key))
  const data = useMemo(() => groupChartRows(fillChartGaps(rows, series), series, interval), [rows, series, interval])
  const available = data.some(row => active.some(s => typeof row[s.key] === 'number'))
  const exportRows = () => downloadReport([
    [title, description], ['Agrupamento', { day: 'Diário', week: 'Semana iniciada em', month: 'Mensal' }[interval]],
    ['Data', ...active.map(s => s.label)], ...data.map(row => [row.date, ...active.map(s => row[s.key] ?? '')]),
  ], `${filename}-${interval}.csv`)
  // Keep axes, tooltips and the zoom brush directly discoverable by the chart's child parser.
  const axes = [
    <CartesianGrid key="grid" stroke="#eef2f7" vertical={false}/>,
    <XAxis key="x" dataKey="date" interval="preserveStartEnd" tickFormatter={reportDate} minTickGap={24} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={6}/>,
    <YAxis key="y" allowDecimals={false} domain={fitToData ? ['dataMin', 'dataMax'] : undefined} width={54} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v)}/>,
    <Tooltip key="tooltip" content={<ChartTooltip series={series} />} cursor={kind === 'bar' ? { fill: '#f1f5f9', radius: 8 } : { stroke: '#cbd5e1', strokeDasharray: '4 4' }} />,
    data.length > 14 && <Brush key="zoom" ariaLabel={`Limite do trecho de ${title}; use as setas para ajustar`} dataKey="date" height={22} stroke="#c7d2fe" fill="#f8fafc" travellerWidth={9} tickFormatter={reportDate}/>,
  ]
  return <Card className="min-w-0 overflow-hidden p-4 sm:p-5" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h3 id={`${id}-title`} className="text-base font-bold text-slate-900">{title}</h3><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{description}</p></div>
      <Button variant="ghost" size="icon" aria-label={`Exportar ${title}`} title="Baixar os dados em CSV" disabled={!available} onClick={exportRows}><Download size={17}/></Button>
    </div>
    <div className="my-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex rounded-lg bg-slate-100 p-1" aria-label={`Exibição de ${title}`}>
        <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')} className={`report-toggle ${view === 'chart' ? 'bg-white shadow-sm text-indigo-700' : ''}`}><BarChart3 size={14}/>Gráfico</button>
        <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className={`report-toggle ${view === 'table' ? 'bg-white shadow-sm text-indigo-700' : ''}`}><Table2 size={14}/>Dados</button>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-500"><span className="sr-only">Agrupar {title}</span><select value={interval} onChange={e => setInterval(e.target.value as ChartInterval)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700"><option value="day">Diário</option><option value="week">Semanal</option><option value="month">Mensal</option></select></label>
    </div>
    {series.length > 1 && <div className="mb-4 flex flex-wrap gap-2" aria-label={`Métricas de ${title}`}>{series.map(s => <button key={s.key} type="button" aria-pressed={selected.includes(s.key)} onClick={() => setSelected(keys => keys.includes(s.key) ? keys.filter(k => k !== s.key) : [...keys, s.key])} className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${selected.includes(s.key) ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-100 bg-slate-50 text-slate-500'}`}><span className="h-2 w-2 rounded-full" style={{ background: s.color, opacity: selected.includes(s.key) ? 1 : .3 }}/>{s.label}</button>)}</div>}
    {!available ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm leading-relaxed text-slate-500" role="status">{active.length ? empty : 'Selecione uma métrica acima para explorar o gráfico.'}</div> : view === 'table' ? <div className="max-h-80 overflow-auto rounded-lg border border-slate-100" tabIndex={0} aria-label={`Dados de ${title}`}><table className="w-full text-xs"><caption className="sr-only">{title}. {description}</caption><thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="p-3 text-left">{interval === 'week' ? 'Semana de' : 'Data'}</th>{active.map(s => <th className="p-3 text-right" key={s.key}>{s.label}</th>)}</tr></thead><tbody>{data.map(row => <tr key={row.date} className="border-t border-slate-100"><th scope="row" className="whitespace-nowrap p-3 text-left font-normal">{row.date.split('-').reverse().join('/')}</th>{active.map(s => <td key={s.key} className="p-3 text-right tabular-nums">{reportFormat(row[s.key] as number | null)}</td>)}</tr>)}</tbody></table></div> : <div className="h-64 w-full min-w-0 sm:h-72" role="img" aria-label={`${title}. Use Dados para consultar a tabela acessível.`}><ResponsiveContainer width="100%" height="100%">{kind === 'bar' ? <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: -8, bottom: 4 }} barGap={4} barCategoryGap="22%"><defs>{active.map(s => <linearGradient key={s.key} id={`bar-${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={1}/><stop offset="100%" stopColor={s.color} stopOpacity={0.55}/></linearGradient>)}</defs>{axes}{active.map(s => <Bar key={s.key} dataKey={s.key} name={s.label} fill={`url(#bar-${gradientId}-${s.key})`} radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={600}/>)}</BarChart> : <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}><defs>{active.map(s => <linearGradient key={s.key} id={`area-${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.28}/><stop offset="95%" stopColor={s.color} stopOpacity={0}/></linearGradient>)}</defs>{axes}{active.map(s => <Area key={s.key} type="monotone" connectNulls={false} dataKey={s.key} name={s.label} stroke={s.color} fill={`url(#area-${gradientId}-${s.key})`} strokeWidth={2.5} strokeLinecap="round" dot={data.length < 15 ? { r: 3, strokeWidth: 2, fill: '#fff' } : false} activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff', fill: s.color }} animationDuration={600}/>)}</AreaChart>}</ResponsiveContainer></div>}
    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">“—” indica dado ausente. {interval !== 'day' ? 'Agrupamentos usam apenas as observações disponíveis; totais podem ser parciais. ' : ''}{available && data.length > 14 && view === 'chart' ? 'Arraste as extremidades da faixa inferior para ampliar um trecho.' : ''}</p>
  </Card>
}

type TooltipEntry = { dataKey?: string | number; name?: string; value?: number | null; color?: string; stroke?: string; fill?: string }

/** Floating card listing each series with its color, for the hovered date. */
function ChartTooltip({ active, payload, label, series }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number; series: ChartSeries[] }) {
  if (!active || !payload?.length) return null
  return <div className="min-w-[150px] max-w-[270px] rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur">
    <p className="mb-1.5 font-semibold text-slate-900">{reportDate(String(label))}</p>
    <div className="space-y-1">{payload.map((entry) => <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: series.find((item) => item.key === entry.dataKey)?.color }} />{entry.name}</span><span className="font-bold tabular-nums text-slate-900">{reportFormat(entry.value ?? null)}</span></div>)}</div>
  </div>
}
