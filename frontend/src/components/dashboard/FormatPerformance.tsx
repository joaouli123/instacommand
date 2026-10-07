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

/**
 * Formats compared by averages per post: totals favour whichever format was
 * posted more, and a single shared axis hides interactions behind views.
 */
export function FormatPerformance({ rows }: { rows: FormatRow[] }) {
  const data = rows.filter((row) => row.posts > 0).map((row) => {
    const views = perPost(row.views ?? null, row.posts)
    const interactions = perPost(row.interactions ?? null, row.posts)
    return { ...row, avgViews: views, avgInteractions: interactions, rate: views && interactions != null ? interactions / views * 100 : null }
  }).sort((a, b) => (b.avgInteractions ?? -1) - (a.avgInteractions ?? -1))
  const maxViews = Math.max(1, ...data.map((row) => row.avgViews ?? 0))
  const maxInteractions = Math.max(1, ...data.map((row) => row.avgInteractions ?? 0))
  const total = data.reduce((sum, row) => sum + row.posts, 0)

  return <Card className="p-5">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="section-title">Desempenho por formato</h3><p className="section-subtitle">Média por publicação, para comparar formatos de forma justa.</p></div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{total} posts</span>
    </div>
    {!data.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Sem dados suficientes para comparar os formatos.</p>
      : <div className="space-y-3">{data.map((row, index) => {
        const { label, Icon, color, tint } = format(row.type)
        return <div key={row.type} className={cn("rounded-xl border p-3.5 sm:p-4", index === 0 && data.length > 1 ? "border-amber-200 bg-amber-50/40" : "border-slate-200")}>
          <div className="flex items-center gap-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tint)}><Icon size={17} /></span>
            <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">{label}{index === 0 && data.length > 1 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"><Trophy size={11} />Melhor formato</span>}</p><p className="text-xs text-slate-500">{row.posts} {row.posts === 1 ? "publicação" : "publicações"}</p></div>
            <div className="text-right"><p className="text-base font-bold tabular-nums text-slate-900">{row.rate == null ? "—" : `${row.rate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</p><p className="text-[11px] text-slate-500">engajamento</p></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Meter label="Visualizações por post" value={row.avgViews} max={maxViews} color={color} />
            <Meter label="Interações por post" value={row.avgInteractions} max={maxInteractions} color={color} />
          </div>
        </div>
      })}</div>}
  </Card>
}

function Meter({ label, value, max, color }: { label: string; value: number | null; max: number; color: string }) {
  return <div>
    <div className="flex items-baseline justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-bold tabular-nums text-slate-900">{number(value)}</span></div>
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${value == null ? 0 : Math.max(3, value / max * 100)}%`, background: color }} /></div>
  </div>
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
