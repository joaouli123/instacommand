import { Clock3 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type BestTime = { day: string; hour: number; averageInteractions: number; posts: number }

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().slice(0, 3)
const dayIndex = (day: string) => DAYS.findIndex((name) => normalize(name) === normalize(day))
const hour = (value: number) => `${String(value).padStart(2, "0")}h`
// Same indigo scale as the heatmap: the best slot is the strongest shade.
const RANKS = ["bg-indigo-600 text-white", "bg-indigo-100 text-indigo-700", "bg-indigo-50 text-indigo-600"]

/**
 * Day × hour heatmap of average interactions per post published in that slot.
 * Empty cells mean no post was published then, not zero engagement.
 */
export function BestTimesHeatmap({ items }: { items: BestTime[] }) {
  const cells = new Map<string, BestTime>()
  for (const item of items) { const index = dayIndex(item.day); if (index >= 0) cells.set(`${index}-${item.hour}`, item) }
  const max = Math.max(1, ...items.map((item) => item.averageInteractions))
  const top = [...items].sort((a, b) => b.averageInteractions - a.averageInteractions).slice(0, 3)

  return <Card className="p-5">
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Clock3 size={17} /></span><div><h3 className="section-title">Melhores horários para publicar</h3><p className="section-subtitle">Média de interações por post, pelo dia e hora em que foi publicado (horário de São Paulo).</p></div></div>
    {!items.length ? <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Ainda não há amostra suficiente para calcular horários.</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{top.map((item, index) => <div key={`${item.day}-${item.hour}`} className={cn("flex items-center gap-3 rounded-xl border p-3", index === 0 ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200")}>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", RANKS[index])}>{index + 1}º</span>
        <div className="min-w-0"><p className="text-sm font-bold text-slate-900">{item.day}, {hour(item.hour)}</p><p className="text-xs text-slate-500">{Math.round(item.averageInteractions).toLocaleString("pt-BR")} interações/post · {item.posts} {item.posts === 1 ? "post" : "posts"}</p></div>
      </div>)}</div>

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid gap-1" style={{ gridTemplateColumns: "36px repeat(24, minmax(0, 1fr))" }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[10px] text-slate-400">{h % 3 === 0 ? hour(h) : ""}</span>)}
            {DAYS.map((name, d) => <div key={name} className="contents">
              <span className="flex items-center text-[11px] font-semibold text-slate-500">{name}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = cells.get(`${d}-${h}`)
                const strength = cell ? 0.15 + 0.85 * (cell.averageInteractions / max) : 0
                return <div key={h} title={cell ? `${name}, ${hour(h)} · ${Math.round(cell.averageInteractions).toLocaleString("pt-BR")} interações/post · ${cell.posts} post(s)` : `${name}, ${hour(h)} · sem publicações`}
                  className={cn("aspect-square rounded-[5px] transition hover:ring-2 hover:ring-indigo-300", !cell && "bg-slate-100")}
                  style={cell ? { background: `rgba(79, 70, 229, ${strength.toFixed(2)})` } : undefined} />
              })}
            </div>)}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-slate-500">
            <span className="mr-1 inline-flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-slate-100" />Sem posts</span>
            Menos<div className="h-2.5 w-28 rounded-full" style={{ background: "linear-gradient(90deg, rgba(79,70,229,.15), rgba(79,70,229,1))" }} />Mais engajamento
          </div>
        </div>
      </div>
    </>}
  </Card>
}
