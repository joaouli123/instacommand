import { Card } from '@/components/ui/card'
import { reportFormat } from '@/lib/report-chart'

export function MetricCard({ label, value, detail, accent = false }: { label: string; value: number | string | null | undefined; detail?: string; accent?: boolean }) {
  const missing = value == null || value === '—'
  return <Card className={`min-w-0 p-3.5 sm:p-4 ${accent ? 'border-indigo-200 bg-indigo-50/40' : ''}`}>
    <h3 className="text-xs font-medium leading-snug text-slate-600 sm:text-sm">{label}</h3>
    <p className="mt-1.5 break-words text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-[28px]">{typeof value === 'string' ? value : reportFormat(value)}</p>
    {(detail || missing) && <p className="mt-1 text-[11px] leading-relaxed text-slate-500 sm:text-xs">{detail || 'Não fornecido pela rede'}</p>}
  </Card>
}
