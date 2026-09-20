"use client"

import { FormEvent, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Hash, Flame, Sparkles, RefreshCw, ExternalLink } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"

type Media = { id: string; caption?: string; media_url?: string; thumbnail_url?: string; permalink?: string; like_count?: number; comments_count?: number }
type HashtagResult = { igHashtagId: string; topMediaCount: number; recentMediaCount: number; topMedia: Media[]; recentMedia: Media[] }
type SavedHashtag = { id: string; hashtag: string; topMediaCount: number; recentMediaCount: number }

export default function TrendsPage() {
  const { accountId, activeAccount, isLoading: accountLoading } = useActiveAccount()
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<HashtagResult | null>(null)
  const [saved, setSaved] = useState<SavedHashtag[]>([])
  const savedQuery = useQuery({ queryKey: ["saved-hashtags", accountId], queryFn: () => api.getSavedHashtags(accountId), enabled: !!accountId })
  const formatsQuery = useQuery({ queryKey: ["trend-formats", accountId], queryFn: () => api.getContentTypes(accountId), enabled: !!accountId })

  useEffect(() => { setSaved((savedQuery.data || []) as SavedHashtag[]) }, [savedQuery.data])

  const searchTerm = async (term: string) => {
    if (!accountId) return toast.error("Conecte uma conta antes de pesquisar tendências.")
    if (!term.trim()) return toast.error("Digite uma hashtag para pesquisar.")
    setSearching(true)
    try { setResult(await api.searchHashtag(accountId, term.trim()) as HashtagResult) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível consultar essa hashtag na Meta.") }
    finally { setSearching(false) }
  }

  const search = async (event?: FormEvent) => {
    event?.preventDefault()
    await searchTerm(query)
  }

  const track = async () => {
    if (!accountId || !result || !query.trim()) return
    try { const item = await api.trackHashtag(accountId, { hashtag: query.trim(), data: result }) as SavedHashtag; setSaved((current) => [item, ...current.filter((savedItem) => savedItem.id !== item.id)]); toast.success(`#${query.replace(/^#/, "")} entrou no monitoramento.`) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível monitorar a hashtag.") }
  }

  const untrack = async (id: string) => { try { await api.untrackHashtag(accountId, id); setSaved((current) => current.filter((item) => item.id !== id)); toast.success("Monitoramento removido.") } catch { toast.error("Não foi possível remover o monitoramento.") } }
  const formats = (formatsQuery.data || []) as Array<{ type: string; posts: number; likes: number; comments: number; engagement: number }>
  const media = result?.topMedia || []

  if (!accountLoading && !activeAccount) return <Card className="mx-auto max-w-xl p-10 text-center"><Hash className="mx-auto mb-3 text-indigo-600" size={28}/><h2 className="text-xl font-bold text-slate-900">Conecte uma conta para pesquisar</h2><p className="mt-2 text-sm text-slate-500">As tendências agora vêm da API da Meta e do histórico real da conta.</p></Card>

  return <div className="space-y-6 animate-fade-in">
    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Radar de conteúdo</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Tendências e insights</h2><p className="mt-1 text-sm text-slate-500">Pesquise hashtags reais e compare formatos que já performaram em @{activeAccount?.igUsername}.</p></div>
    <Card className="p-4"><form onSubmit={search} className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400"/><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 rounded-xl pl-10" placeholder="Pesquisar uma hashtag, ex.: designgrafico"/></div><Button type="submit" disabled={searching} className="h-11 gap-2 bg-indigo-600 text-white"><Search size={15}/>{searching ? "Consultando..." : "Pesquisar"}</Button></form><div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">Monitoradas</span>{saved.length ? saved.map((item) => <button key={item.id} type="button" onClick={() => { setQuery(item.hashtag); void searchTerm(item.hashtag) }} onContextMenu={(event) => { event.preventDefault(); void untrack(item.id) }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"><Hash size={13}/>{item.hashtag}</button>) : <span className="text-xs text-slate-400">Nenhuma hashtag monitorada. Pesquise e salve uma.</span>}</div></Card>
    {result && <Card className="border-indigo-100 bg-indigo-50/40 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Resultado da Meta · #{query.replace(/^#/, "")}</p><p className="mt-1 text-sm text-slate-600">Amostra retornada: {result.topMediaCount} posts em destaque e {result.recentMediaCount} recentes.</p></div><Button variant="outline" onClick={track} className="gap-2 border-indigo-200 text-indigo-700"><Hash size={15}/>Monitorar hashtag</Button></div>{media.length ? <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{media.slice(0, 4).map((item) => <a key={item.id} href={item.permalink || "#"} target={item.permalink ? "_blank" : undefined} rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="aspect-square bg-slate-100">{(item.media_url || item.thumbnail_url) ? <img src={item.media_url || item.thumbnail_url} alt="" className="h-full w-full object-cover transition group-hover:scale-105"/> : <div className="flex h-full items-center justify-center text-xs text-slate-400">Sem mídia</div>}</div><div className="flex items-center justify-between p-2 text-[11px] text-slate-500"><span>{(item.like_count || 0).toLocaleString("pt-BR")} likes</span><ExternalLink size={12}/></div></a>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">A Meta não retornou mídias para essa busca.</p>}</Card>}
    <div className="grid gap-6 lg:grid-cols-2"><Card className="p-5"><div className="flex items-center gap-2"><Flame className="text-orange-500" size={18}/><h3 className="text-lg font-bold text-slate-900">Formatos no seu histórico</h3></div><p className="mt-1 text-xs text-slate-500">Sem pontuações inventadas: mostramos somente o que veio dos posts importados.</p><div className="mt-4 space-y-3">{formats.length ? formats.map((item) => <div key={item.type} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><span className="font-semibold text-slate-800">{item.type}</span><Badge variant="secondary">{item.posts} posts</Badge></div><div className="mt-2 flex gap-4 text-xs text-slate-500"><span>{item.likes.toLocaleString("pt-BR")} likes</span><span>{item.comments.toLocaleString("pt-BR")} comentários</span><span>{item.engagement.toLocaleString("pt-BR")}% médio</span></div></div>) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Sincronize posts para comparar formatos.</div>}</div></Card><Card className="p-5"><div className="flex items-center gap-2"><Sparkles className="text-indigo-600" size={18}/><h3 className="text-lg font-bold text-slate-900">Como usar esta tela</h3></div><div className="mt-4 space-y-3 text-sm text-slate-600"><p>1. Pesquise uma hashtag e veja uma amostra devolvida pela Meta.</p><p>2. Salve as hashtags que deseja acompanhar. Clique com o botão direito em uma monitorada para remover.</p><p>3. Use a comparação de formatos para decidir entre Feed, Carrossel e Reels com base no seu próprio histórico.</p></div>{savedQuery.isFetching || formatsQuery.isFetching ? <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400"><RefreshCw size={12} className="animate-spin"/>Atualizando dados...</p> : null}</Card></div>
  </div>
}
