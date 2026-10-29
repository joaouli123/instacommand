"use client"

// What is trending on YouTube Brazil: the official chart by category, or the most viewed
// recent videos for a keyword, read with the company's own channel connection.
import { FormEvent, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw, Search, X } from "lucide-react"
import toast from "react-hot-toast"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApi } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { VideoCard, type PublicVideo } from "@/components/research/YouTubeCompetitors"

type Trends = { mode: "chart" | "search"; q: string | null; category: string; days: number | null; videos: PublicVideo[]; categories: Array<{ id: string; label: string }>; collectedAt: string }
const DAYS = [{ label: "24 h", value: 1 }, { label: "7 dias", value: 7 }, { label: "30 dias", value: 30 }]

export function YouTubeTrends() {
  const { accountId } = useActiveAccount()
  const [category, setCategory] = useState("")
  const [draft, setDraft] = useState("")
  const [q, setQ] = useState("")
  const [days, setDays] = useState(7)
  const [refreshing, setRefreshing] = useState(false)
  const params = new URLSearchParams({ ...(q ? { q, days: String(days) } : { category }) })
  const query = useQuery<Trends>({ queryKey: ["youtube-trends", accountId, q, q ? days : category], enabled: !!accountId, retry: false, staleTime: 10 * 60_000,
    queryFn: ({ signal }) => fetchApi(`/youtube-research/${encodeURIComponent(accountId)}/trends?${params}`, { signal }) as Promise<Trends> })
  const data = query.data
  const search = (event: FormEvent) => { event.preventDefault(); setQ(draft.trim()) }
  const refresh = async () => {
    setRefreshing(true)
    try { await fetchApi(`/youtube-research/${encodeURIComponent(accountId)}/trends?${params}&refresh=1`); await query.refetch() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar.") }
    finally { setRefreshing(false) }
  }
  const notConnected = query.isError && /Conecte ou vincule o canal do YouTube/.test(query.error.message)

  return <div className="space-y-5">
    <Card className="space-y-3 p-4">
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Palavra-chave do seu nicho, ex.: aplicativo de corridas" aria-label="Buscar vídeos em alta por palavra-chave" className="h-10 pl-9" /></div>
        <Button type="submit" className="h-10 bg-indigo-600 text-white">Buscar</Button>
        {q && <Button type="button" variant="outline" className="h-10 gap-1" onClick={() => { setQ(""); setDraft("") }}><X size={14} />Ver ranking oficial</Button>}
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {q ? <div role="group" aria-label="Publicados nos últimos" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">{DAYS.map((option) => <button key={option.value} type="button" aria-pressed={days === option.value} onClick={() => setDays(option.value)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${days === option.value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{option.label}</button>)}</div>
          : <select aria-label="Categoria" value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">{(data?.categories || [{ id: "", label: "Todas as categorias" }]).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing || query.isFetching} className="gap-2"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />Atualizar</Button>
        <span className="text-xs text-slate-500">{q ? `Vídeos mais vistos para “${q}” publicados nos últimos ${days === 1 ? "1 dia" : `${days} dias`}, no Brasil.` : "Ranking oficial “Em alta” do YouTube no Brasil."}</span>
      </div>
    </Card>
    {query.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-video w-full rounded-xl" />)}</div>
      : notConnected ? <Card className="p-8 text-center"><h2 className="text-lg font-bold text-slate-900">Conecte o canal do YouTube desta empresa</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">As buscas no YouTube usam a conexão do canal da empresa selecionada no topo. Conecte ou vincule o canal em Contas.</p><a href="/accounts" className="mt-4 inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white">Ir para Contas</a></Card>
      : query.isError ? <Card className="border-rose-200 p-5 text-sm text-rose-700" role="alert">{query.error.message}</Card>
      : data && (data.videos.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.videos.map((video) => <VideoCard key={video.id} video={video} />)}</div> : <Card className="p-6 text-sm text-slate-500">Nenhum vídeo encontrado. Tente outra palavra-chave ou um período maior.</Card>)}
  </div>
}
