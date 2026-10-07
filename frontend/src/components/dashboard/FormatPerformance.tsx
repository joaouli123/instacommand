"use client"

import { useState } from "react"
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Clock3, Database, Film, GalleryHorizontal as Images, Image as ImageIcon, Lightbulb, Sparkles, Trophy, Type } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type FormatRow = { type: string; posts: number; views?: number | null; reach: number | null; interactions?: number | null }

const FORMATS: Record<string, { label: string; Icon: typeof ImageIcon; color: string; tint: string }> = {
  IMAGE: { label: "Imagem", Icon: ImageIcon, color: "#6366f1", tint: "bg-indigo-50 text-indigo-600" },
  CAROUSEL: { label: "Carrossel", Icon: Images, color: "#0ea5e9", tint: "bg-sky-50 text-sky-600" },
  CAROUSEL_ALBUM: { label: "Carrossel", Icon: Images, color: "#0ea5e9", tint: "bg-sky-50 text-sky-600" },
  REEL: { label: "Reel", Icon: Film, color: "#ec4899", tint: "bg-pink-50 text-pink-600" },
  VIDEO: { label: "Vídeo", Icon: Film, color: "#ec4899", tint: "bg-pink-50 text-pink-600" },
  STORY: { label: "Story", Icon: Sparkles, color: "#f59e0b", tint: "bg-amber-50 text-amber-600" },
  TEXT: { label: "Texto", Icon: Type, color: "#64748b", tint: "bg-slate-100 text-slate-600" },
}
const format = (type: string) => FORMATS[type] || { label: type, Icon: ImageIcon, color: "#64748b", tint: "bg-slate-100 text-slate-600" }
const number = (value: number | null) => value == null ? "—" : Math.round(value).toLocaleString("pt-BR")
const perPost = (total: number | null | undefined, posts: number) => total == null || !posts ? null : total / posts

type MetricKey = "avgInteractions" | "avgViews" | "rate"
const METRICS: Array<{ key: MetricKey; label: string; hint: string }> = [
  { key: "avgInteractions", label: "Interações por post", hint: "Média de curtidas, comentários, salvos e compartilhamentos em cada publicação." },
  { key: "avgViews", label: "Visualizações por post", hint: "Média de visualizações em cada publicação." },
  { key: "rate", label: "Engajamento", hint: "Interações ÷ visualizações, em %." },
]

/**
 * Horizontal bars, one metric at a time: the right chart to rank categories,
 * with an axis that always fits the chosen metric. Averages per post keep the
 * comparison fair between formats posted more or fewer times.
 */
export function FormatPerformance({ rows }: { rows: FormatRow[] }) {
  const [metric, setMetric] = useState<MetricKey>("avgInteractions")
  const data = rows.filter((row) => row.posts > 0).map((row) => {
    const views = perPost(row.views ?? null, row.posts)
    const interactions = perPost(row.interactions ?? null, row.posts)
    const { label, color } = format(row.type)
    return { type: row.type, label, color, posts: row.posts, avgViews: views, avgInteractions: interactions, rate: views && interactions != null ? interactions / views * 100 : null }
  }).filter((row) => row[metric] != null).sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
  const total = rows.reduce((sum, row) => sum + row.posts, 0)
  const current = METRICS.find((item) => item.key === metric)!
  const show = (value: number) => metric === "rate" ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : number(value)

  return <Card className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="section-title">Desempenho por formato</h3><p className="section-subtitle">{current.hint}</p></div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{total} posts</span>
    </div>
    <div className="mt-4 inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Métrica do gráfico">
      {METRICS.map((item) => <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)} className={cn("report-toggle", metric === item.key && "bg-white text-indigo-700 shadow-sm")}>{item.label}</button>)}
    </div>
    {!data.length ? <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Sem dados suficientes para comparar os formatos.</p>
      : <div className="mt-4 w-full" style={{ height: Math.max(140, data.length * 56 + 24) }} role="img" aria-label={`${current.label} por formato: ${data.map((row) => `${row.label} ${show(row[metric] ?? 0)}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={14}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis type="category" dataKey="label" width={92} tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: "#334155", fontWeight: 600 }} />
            <Tooltip cursor={{ fill: "#f8fafc" }} content={({ active, payload }) => {
              const row = active && payload?.[0]?.payload as (typeof data)[number] | undefined
              if (!row) return null
              return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"><p className="font-semibold text-slate-900">{row.label}</p><p className="mt-1 text-slate-500">{current.label}: <b className="text-slate-900">{show(row[metric] ?? 0)}</b></p><p className="text-slate-500">{row.posts} {row.posts === 1 ? "publicação" : "publicações"}</p></div>
            }} />
            <Bar dataKey={metric} radius={[0, 8, 8, 0]} maxBarSize={30} animationDuration={500}>
              {data.map((row) => <Cell key={row.type} fill={row.color} />)}
              <LabelList dataKey={metric} position="right" formatter={(value: number) => show(value)} style={{ fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>}
    {data.length > 1 && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Trophy size={13} className="text-amber-500" /><b className="text-slate-700">{data[0].label}</b> lidera em {current.label.toLowerCase()}.</p>}
  </Card>
}


type Recommendation = { type: string; message: string; basedOn?: number; title?: string; highlight?: string }
const KINDS: Record<string, { label: string; Icon: typeof Lightbulb; tint: string }> = {
  FORMAT: { label: "Formato", Icon: Trophy, tint: "bg-amber-50 text-amber-600" },
  TIMING: { label: "Horário", Icon: Clock3, tint: "bg-sky-50 text-sky-600" },
  DATA: { label: "Dados", Icon: Database, tint: "bg-slate-100 text-slate-600" },
}

export function Recommendations({ items, fallbackCount }: { items: Recommendation[]; fallbackCount: number }) {
  return <Card className="p-5">
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Lightbulb size={17} /></span><div><h3 className="section-title">Recomendações</h3><p className="section-subtitle">O que o seu histórico recente sugere para os próximos posts.</p></div></div>
    {!items.length ? <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Ainda não há histórico suficiente para recomendações.</p>
      : <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((item, index) => {
        const kind = KINDS[item.type] || { label: "Observação", Icon: Lightbulb, tint: "bg-violet-50 text-violet-600" }
        return <div key={`${item.type}-${index}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", kind.tint)}><kind.Icon size={16} /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kind.label}</p>
            {item.title && <p className="mt-0.5 text-sm font-semibold text-slate-900">{item.title}{item.highlight && <span className="ml-1.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700">{item.highlight}</span>}</p>}
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p>
            <p className="mt-2 text-xs text-slate-400">Com base em {item.basedOn || fallbackCount} {(item.basedOn || fallbackCount) === 1 ? "publicação" : "publicações"}</p>
          </div>
        </div>
      })}</div>}
  </Card>
}
