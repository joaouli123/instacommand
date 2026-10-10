import { currentLocale, tr } from './i18n'

export type ChartRow ={ date: string; [key: string]: string | number | null }
export type ChartSeries = { key: string; label: string; color: string; aggregation?: 'sum' | 'last' }
export type ChartInterval = 'day' | 'week' | 'month'

export function reportDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : ''
}

export function groupChartRows(rows: ChartRow[], series: ChartSeries[], interval: ChartInterval): ChartRow[] {
  const buckets = new Map<string, ChartRow>()
  for (const row of [...rows].filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date)).sort((a, b) => a.date.localeCompare(b.date))) {
    let key = row.date
    if (interval === 'month') key = `${row.date.slice(0, 7)}-01`
    if (interval === 'week') {
      const day = new Date(`${row.date}T12:00:00Z`)
      day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7)
      key = day.toISOString().slice(0, 10)
    }
    const bucket = buckets.get(key) || Object.fromEntries([['date', key], ...series.map(s => [s.key, null])]) as ChartRow
    for (const metric of series) {
      const value = row[metric.key]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      bucket[metric.key] = metric.aggregation === 'last' ? value : (typeof bucket[metric.key] === 'number' ? Number(bucket[metric.key]) : 0) + value
    }
    buckets.set(key, bucket)
  }
  return Array.from(buckets.values())
}

/** Missing observations stay missing; never connect them as a real zero. */
export function fillChartGaps(rows: ChartRow[], series: ChartSeries[]): ChartRow[] {
  if (!rows.length) return []
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const byDay = new Map(sorted.map(row => [row.date, row]))
  const start = Date.parse(`${sorted[0].date}T12:00:00Z`)
  const end = Date.parse(`${sorted.at(-1)!.date}T12:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 731 * 86400000) return sorted
  const result: ChartRow[] = []
  for (let cursor = start; cursor <= end; cursor += 86400000) {
    const date = new Date(cursor).toISOString().slice(0, 10)
    result.push(byDay.get(date) || Object.fromEntries([['date', date], ...series.map(s => [s.key, null])]) as ChartRow)
  }
  return result
}

export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[\s\uFEFF]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function reportCsv(rows: unknown[][]) {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')
}

export function downloadReport(rows: unknown[][], filename: string) {
  const url = URL.createObjectURL(new Blob([reportCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename.replace(/[^\w.\-]/g, '-'); link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Formatters run during render, so they follow the current UI language.
export const reportFormat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(currentLocale(), { maximumFractionDigits: 2 })
export const reportDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(currentLocale(), { day: '2-digit', month: 'short', timeZone: 'UTC' })
export const mediaLabel = (value: string | null) => tr(({ IMAGE: 'Foto', VIDEO: 'Vídeo', REEL: 'Reel', STORY: 'Story', CAROUSEL: 'Carrossel', CAROUSEL_ALBUM: 'Carrossel', TEXT_POST: 'Texto', REPOST_FACADE: 'Republicação' } as Record<string, string>)[value || ''] || 'Publicação')
