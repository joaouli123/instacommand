"use client"

// YouTube competitors of the company chosen at the top: the company's channel next to
// the tracked channels, sortable, with each channel's most viewed recent videos.
import { FormEvent, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, RefreshCw, Trash2, UserPlus } from "lucide-react"
import toast from "react-hot-toast"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AvatarImage } from "@/components/ui/avatar-image"
import { MediaPreview } from "@/components/dashboard/MediaPreview"
import { fetchApi } from "@/lib/api"
import { reportFormat } from "@/lib/report-chart"
import { useActiveAccount } from "@/hooks/useActiveAccount"

export type PublicVideo = { id: string; title: string; channelTitle: string; publishedAt: string; url: string; thumbnail: string | null; views: number | null; likes: number | null; comments: number | null; durationSeconds: number | null }
type ChannelRow = { title: string; handle: string | null; thumbnailUrl: string | null; subscribers: number | null; views: number | null; videoCount: number | null; avgViews: number | null; avgLikes: number | null; avgComments: number | null; engagementRate: number | null; uploadsPerWeek: number | null; topVideos: PublicVideo[] }
type Competitor = ChannelRow & { id: string; channelId: string; description: string | null; lastCollectedAt: string | null }
type Overview = { connected: boolean; own: (ChannelRow & { channelId: string }) | null; competitors: Competitor[] }
type SortKey = "subscribers" | "avgViews" | "engagementRate" | "uploadsPerWeek"

const pct = (value: number | null) => value == null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
const perWeek = (value: number | null) => value == null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
const COLUMNS: Array<{ key: SortKey; label: string; show: (row: ChannelRow) => string }> = [
  { key: "subscribers", label: "Inscritos", show: (row) => reportFormat(row.subscribers) },
  { key: "avgViews", label: "Média de views", show: (row) => reportFormat(row.avgViews == null ? null : Math.round(row.avgViews)) },
  { key: "engagementRate", label: "Engajamento", show: (row) => pct(row.engagementRate) },
  { key: "uploadsPerWeek", label: "Vídeos/semana", show: (row) => perWeek(row.uploadsPerWeek) },
]

export function VideoCard({ video }: { video: PublicVideo }) {
  return <a href={video.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:shadow-md">
    <div className="relative aspect-video overflow-hidden bg-slate-100"><MediaPreview src={video.thumbnail} fallback="" className="transition duration-500 group-hover:scale-105" />{video.durationSeconds != null && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 text-[10px] font-semibold text-white">{Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, "0")}</span>}</div>
    <div className="p-3"><p className="line-clamp-2 text-sm font-medium text-slate-800">{video.title}</p><p className="mt-1 truncate text-xs text-slate-500">{video.channelTitle}</p>
      <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-slate-500"><span><b className="text-slate-800">{reportFormat(video.views)}</b> views</span><span>{reportFormat(video.likes)} curtidas</span><span>{new Date(video.publishedAt).toLocaleDateString("pt-BR")}</span></p></div>
  </a>
}

export function YouTubeCompetitors() {
  const { activeAccount, accountId } = useActiveAccount()
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState("")
  const [sort, setSort] = useState<SortKey>("subscribers")
  const [selectedId, setSelectedId] = useState("")
  const query = useQuery<Overview>({ queryKey: ["youtube-competitors", accountId], enabled: !!accountId, retry: false, queryFn: ({ signal }) => fetchApi(`/youtube-research/${encodeURIComponent(accountId)}/competitors`, { signal }) as Promise<Overview> })
  const data = query.data
  const competitors = useMemo(() => data?.competitors || [], [data])
  const rows = useMemo(() => [...(data?.own ? [{ id: "own", own: true, row: data.own as ChannelRow }] : []), ...competitors.map((row) => ({ id: row.id, own: false, row: row as ChannelRow }))]
    .sort((a, b) => (b.row[sort] ?? -1) - (a.row[sort] ?? -1)), [data, competitors, sort])
  const selected = competitors.find((item) => item.id === selectedId) || competitors[0]
  const reload = () => queryClient.invalidateQueries({ queryKey: ["youtube-competitors", accountId] })

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (!input.trim()) return
    setAdding(true)
    try { await fetchApi(`/youtube-research/${encodeURIComponent(accountId)}/competitors`, { method: "POST", body: JSON.stringify({ channel: input.trim() }) }); setInput(""); toast.success("Canal adicionado aos concorrentes."); await reload() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o canal.") }
    finally { setAdding(false) }
  }
  const refresh = async (id: string) => {
    setBusy(id)
    try { await fetchApi(`/youtube-research/competitors/${encodeURIComponent(id)}/refresh`, { method: "POST" }); await reload(); toast.success("Canal atualizado.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar.") }
    finally { setBusy("") }
  }
  const remove = async (competitor: Competitor) => {
    if (!window.confirm(`Parar de monitorar ${competitor.title}? O histórico dele será apagado.`)) return
    setBusy(competitor.id)
    try { await fetchApi(`/youtube-research/competitors/${encodeURIComponent(competitor.id)}`, { method: "DELETE" }); await reload() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível remover.") }
    finally { setBusy("") }
  }

  if (query.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (query.isError) return <Card className="border-rose-200 p-5 text-sm text-rose-700" role="alert">{query.error.message}</Card>
  if (data && !data.connected) return <Card className="p-8 text-center"><h2 className="text-lg font-bold text-slate-900">Conecte o canal do YouTube desta empresa</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">Para comparar @{activeAccount?.igUsername} com outros canais, a empresa precisa ter o próprio canal conectado e vinculado em Contas. As consultas usam a conexão do canal da empresa.</p><a href="/accounts" className="mt-4 inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white">Ir para Contas</a></Card>

  return <div className="space-y-5">
    <Card className="p-4">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="@canal, link youtube.com/@canal ou ID do canal" aria-label="Canal concorrente do YouTube" className="h-10" />
        <Button type="submit" disabled={adding || !input.trim() || competitors.length >= 20} className="h-10 gap-2 bg-indigo-600 text-white"><UserPlus size={16} />{adding ? "Buscando…" : "Adicionar canal"}</Button>
      </form>
      <p className="mt-2 text-xs text-slate-500">Canais públicos do YouTube. Os números são atualizados todos os dias. <Badge variant="secondary" className="ml-1">{competitors.length}/20 monitorados</Badge></p>
    </Card>

    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4"><div><h3 className="section-title">Comparativo de canais</h3><p className="section-subtitle">Médias dos 15 vídeos mais recentes de cada canal</p></div>
        <select aria-label="Ordenar canais" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">{COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></div>
      {rows.length <= 1 && !competitors.length ? <p className="p-6 text-sm text-slate-500">Adicione o primeiro canal concorrente para comparar com o canal da empresa.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2.5 font-semibold">Canal</th>{COLUMNS.map((column) => <th key={column.key} className="px-3 py-2.5 text-right font-semibold">{column.label}</th>)}<th className="w-20" /></tr></thead>
        <tbody>{rows.map(({ id, own, row }) => { const competitor = own ? null : row as Competitor; return <tr key={id} onClick={() => competitor && setSelectedId(competitor.id)} className={`border-t border-slate-100 ${own ? "bg-indigo-50/50" : "cursor-pointer hover:bg-slate-50"} ${competitor && selected?.id === competitor.id ? "ring-1 ring-inset ring-indigo-200" : ""}`}>
          <td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-600"><AvatarImage src={row.thumbnailUrl} fallback={(row.title[0] || "?").toUpperCase()} /></span><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{row.title}{own && <Badge className="ml-2 bg-indigo-600 text-white">Sua empresa</Badge>}</p><p className="truncate text-xs text-slate-500">{row.handle || "Canal do YouTube"}</p></div></div></td>
          {COLUMNS.map((column) => <td key={column.key} className="px-3 py-3 text-right font-medium text-slate-800">{column.show(row)}</td>)}
          <td className="px-3 py-3 text-right">{competitor && <span className="inline-flex gap-1"><button type="button" aria-label={`Atualizar ${competitor.title}`} disabled={!!busy} onClick={(event) => { event.stopPropagation(); void refresh(competitor.id) }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><RefreshCw size={14} className={busy === competitor.id ? "animate-spin" : ""} /></button><button type="button" aria-label={`Remover ${competitor.title}`} disabled={!!busy} onClick={(event) => { event.stopPropagation(); void remove(competitor) }} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></span>}</td>
        </tr> })}</tbody>
      </table></div>}
    </Card>

    {selected && <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="section-title">Vídeos mais vistos de {selected.title}</h3><p className="section-subtitle">{selected.lastCollectedAt ? `Coletado em ${new Date(selected.lastCollectedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Ainda não coletado"} · {reportFormat(selected.videoCount)} vídeos no canal · {reportFormat(selected.views)} views no total</p></div>
        <a href={`https://www.youtube.com/channel/${selected.channelId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">Abrir canal<ExternalLink size={12} /></a></div>
      {selected.topVideos.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selected.topVideos.map((video) => <VideoCard key={video.id} video={video} />)}</div> : <p className="mt-4 text-sm text-slate-500">Nenhum vídeo público recente.</p>}
    </Card>}

    {data?.own && data.own.topVideos.length > 0 && <Card className="p-5"><h3 className="section-title">Vídeos mais vistos do seu canal</h3><p className="section-subtitle">Entre os 15 mais recentes de {data.own.title}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.own.topVideos.map((video) => <VideoCard key={video.id} video={video} />)}</div></Card>}
  </div>
}
