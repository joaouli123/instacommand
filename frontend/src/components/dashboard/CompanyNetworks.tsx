"use client"

// One card per network of the company chosen at the top: audience and the period's main
// numbers, with the change against the previous period. Only that company's profiles.
import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDownRight, ArrowUpRight, Plus } from "lucide-react"
import { SiFacebook, SiInstagram, SiThreads, SiTiktok, SiX, SiYoutube } from "@icons-pack/react-simple-icons"
import { Card } from "@/components/ui/card"
import { AvatarImage } from "@/components/ui/avatar-image"
import { fetchApi } from "@/lib/api"
import { reportFormat } from "@/lib/report-chart"

type Metric = { key: string; label: string; value: number | null; previous?: number | null; format?: "number" | "percent" | "minutes" }
type NetworkSummary = { network: string; accountId?: string; name: string; handle?: string | null; avatarUrl?: string | null; status: "ok" | "error"; error?: string; audience: number | null; audienceLabel: string; metrics: Metric[]; notice?: string | null }
type Summary = { company: { id: string; igUsername: string }; days: number; networks: NetworkSummary[]; missing: string[] }

const NETWORKS: Record<string, { label: string; Icon: typeof SiInstagram; bg: string; tab: string }> = {
  INSTAGRAM: { label: "Instagram", Icon: SiInstagram, bg: "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400", tab: "instagram" },
  FACEBOOK: { label: "Facebook", Icon: SiFacebook, bg: "bg-[#1877F2]", tab: "facebook" },
  THREADS: { label: "Threads", Icon: SiThreads, bg: "bg-[#101113]", tab: "threads" },
  X: { label: "X", Icon: SiX, bg: "bg-black", tab: "x" },
  YOUTUBE: { label: "YouTube", Icon: SiYoutube, bg: "bg-[#ff0033]", tab: "youtube" },
  TIKTOK: { label: "TikTok", Icon: SiTiktok, bg: "bg-black", tab: "tiktok" },
}

const show = (metric: Metric) => metric.value == null ? "—"
  : metric.format === "percent" ? `${metric.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
  : metric.format === "minutes" ? `${(metric.value / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
  : reportFormat(metric.value)

function Change({ metric }: { metric: Metric }) {
  if (metric.value == null || metric.previous == null || metric.previous === 0) return null
  const percent = (metric.value - metric.previous) / Math.abs(metric.previous) * 100
  if (!Number.isFinite(percent) || Math.abs(percent) < 0.5) return null
  const up = percent > 0
  return <span className={`inline-flex items-center text-[10px] font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`} title={`Período anterior: ${show({ ...metric, value: metric.previous })}`}>{up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(percent).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span>
}

export function CompanyNetworks({ accountId }: { accountId: string }) {
  const [days, setDays] = useState(30)
  const query = useQuery<Summary>({
    queryKey: ["company-summary", accountId, days], enabled: !!accountId, staleTime: 5 * 60_000, retry: false,
    queryFn: ({ signal }) => fetchApi(`/analytics/company/${encodeURIComponent(accountId)}/summary?days=${days}`, { signal }) as Promise<Summary>,
  })
  const summary = query.data
  return <Card className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs md:p-6" aria-labelledby="company-networks-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h3 id="company-networks-title" className="section-title">Todas as redes da empresa</h3><p className="text-xs font-medium text-slate-500">Somente os perfis de {summary ? `@${summary.company.igUsername}` : "da empresa selecionada"} · comparado ao período anterior</p></div>
      <select aria-label="Período das redes" value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">{[7, 30, 90].map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}</select>
    </div>
    {query.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Carregando redes">{[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />)}</div>
      : query.isError ? <p role="alert" className="text-sm text-rose-700">{query.error.message} <button onClick={() => query.refetch()} className="underline">Tentar novamente</button></p>
      : summary && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summary.networks.map((item, index) => {
          const network = NETWORKS[item.network]
          if (!network) return null
          return <article key={`${item.network}-${item.accountId || index}`} className="flex flex-col rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <span className="relative h-10 w-10 shrink-0">
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-600"><AvatarImage src={item.avatarUrl} fallback={(item.name || network.label)[0]?.toUpperCase() || "?"} /></span>
                <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${network.bg}`}><network.Icon size={11} color="#fff" title={network.label} /></span>
              </span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{item.name || network.label}</p><p className="truncate text-xs text-slate-500">{[network.label, item.handle].filter(Boolean).join(" · ")}</p></div>
              {item.status === "ok" && <div className="text-right"><p className="text-lg font-bold leading-none text-slate-900">{reportFormat(item.audience)}</p><p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">{item.audienceLabel}</p></div>}
            </div>
            {item.status === "error" ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{item.error}</p>
              : <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">{item.metrics.map((metric) => <div key={metric.key} className="min-w-0"><dt className="truncate text-[11px] text-slate-500">{metric.label}</dt><dd className="flex items-baseline gap-1.5"><span className="text-sm font-semibold text-slate-900">{show(metric)}</span><Change metric={metric} /></dd></div>)}</dl>}
            {item.notice && <p className="mt-3 text-[11px] leading-4 text-amber-700">{item.notice}</p>}
            <Link href={`/analytics?tab=${network.tab}`} className="mt-auto pt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Ver relatório completo →</Link>
          </article>
        })}
        {summary.missing.map((key) => {
          const network = NETWORKS[key]
          return <Link key={key} href="/accounts" className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-700">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${network.bg}`}><network.Icon size={16} color="#fff" title={network.label} /></span>
            <span className="inline-flex items-center gap-1 font-semibold"><Plus size={14} />Conectar {network.label}</span>
            <span className="text-[11px]">Nenhum perfil desta empresa</span>
          </Link>
        })}
      </div>}
  </Card>
}
