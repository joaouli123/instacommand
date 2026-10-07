import { createContext, useContext, useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { reportFormat } from '@/lib/report-chart'
import { periodChange } from '@/lib/instagram-report'

export type MetricCompare = {
  current: number | null | undefined
  previous: number | null | undefined
  /** How to print the previous value (rates, decimals); defaults to the report number format. */
  format?: (value: number) => string
}

/** Lets a report turn every "vs. período anterior" badge on or off at once. */
export const CompareContext = createContext(true)

const STORAGE_KEY = 'instacommand_compare_previous'
const EVENT = 'instacommand-compare-changed'

/** One preference for every report tab, remembered per browser (storage may be blocked). */
export function useComparePreference(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(true)
  useEffect(() => {
    const read = () => { try { setValue(window.localStorage.getItem(STORAGE_KEY) !== '0') } catch { /* ignore */ } }
    read()
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [])
  const update = (next: boolean) => {
    setValue(next)
    try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVENT))
  }
  return [value, update]
}

export function CompareToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex w-fit cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs">
    <Switch checked={value} onCheckedChange={onChange} aria-label="Comparar com o período anterior" />
    Comparar com o período anterior
  </label>
}

export function MetricCard({ label, value, detail, accent = false, compare }: { label: string; value: number | string | null | undefined; detail?: string; accent?: boolean; compare?: MetricCompare }) {
  const missing = value == null || value === '—'
  const comparing = useContext(CompareContext)
  const change = compare && comparing ? periodChange(compare.current, compare.previous) : null
  return <Card className={`min-w-0 p-3.5 sm:p-4 ${accent ? 'border-indigo-200 bg-indigo-50/40' : ''}`}>
    <h3 className="text-xs font-medium leading-snug text-slate-600 sm:text-sm">{label}</h3>
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <p className="break-words text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-[28px]">{typeof value === 'string' ? value : reportFormat(value)}</p>
      {change && <ChangeBadge direction={change.direction} percent={change.percent} />}
    </div>
    {change && compare?.previous != null && <p className="mt-1 text-[11px] font-medium text-slate-500 sm:text-xs">{compare.format ? compare.format(compare.previous) : reportFormat(compare.previous)} no período anterior</p>}
    {(detail || missing) && <p className="mt-1 text-[11px] leading-relaxed text-slate-500 sm:text-xs">{detail || 'Não fornecido pela rede'}</p>}
  </Card>
}

export function ChangeBadge({ direction, percent }: { direction: 'up' | 'down' | 'flat'; percent: number | null }) {
  const tone = direction === 'up' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : direction === 'down' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '='
  const text = percent == null ? 'novo' : `${percent > 0 ? '+' : ''}${percent.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: Math.abs(percent) < 10 ? 1 : 0 })}%`
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ring-1 ring-inset ${tone}`} title="Comparado ao período anterior de mesma duração">{arrow} {text}</span>
}
