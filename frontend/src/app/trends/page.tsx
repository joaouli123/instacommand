"use client"

import { FormEvent, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Flame, Hash, Info, Plus, RefreshCw, TrendingUp, X } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { PageHeader } from "@/components/layout/PageHeader"
import { ReferencePostCard, type RankedPost } from "@/components/dashboard/ReferencePostCard"

type SavedHashtag = { id: string; hashtag: string; lastSearchedAt: string }
type Source = { type: "hashtag"; label: string; status: "ok" | "error"; error?: string; cached?: boolean; searchedAt?: string; count?: number }
type Feed = { items: RankedPost[]; explodingToday: RankedPost[]; sources: Source[]; competitorsIncluded: number; quota: { used: number; limit: number }; generatedAt: string }

const SUGGESTED = ["marketingdigital", "empreendedorismo", "reels", "dicas", "negocios", "moda", "fitness", "receitas", "viagem", "beleza", "design", "tecnologia"]
const PERIODS = [{ label: "24 h", value: 1 }, { label: "7 dias", value: 7 }, { label: "30 dias", value: 30 }, { label: "Tudo", value: 0 }]
const FORMATS = [{ label: "Todos", value: "ALL" }, { label: "Reels", value: "REELS" }, { label: "Carrossel", value: "CAROUSEL" }, { label: "Imagem", value: "IMAGE" }]
const SORTS = [{ label: "Engajamento", value: "engagement" }, { label: "Curtidas", value: "likes" }, { label: "Comentários", value: "comments" }, { label: "Mais recentes", value: "recent" }]
const HASHTAG = /^[^\s#.,;:!?@$%&*()+=\[\]{}'\"<>/\|`~^-]{1,100}$/

function Segmented<T extends string | number>({ options, value, onChange, label }: { options: Array<{ label: string; value: T }>; value: T; onChange: (value: T) => void; label: string }) {
  return <div role="group" aria-label={label} className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">{options.map((option) => <button key={String(option.value)} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${value === option.value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{option.label}</button>)}</div>
}

export default function TrendsPage() {
  const { accountId, activeAccount, isLoading: accountLoading } = useActiveAccount()
  const queryClient = useQueryClient()
  const [days, setDays] = useState(7)
  const [format, setFormat] = useState("ALL")
  const [sort, setSort] = useState("engagement")
  const [newTag, setNewTag] = useState("")
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const savedQuery = useQuery({ queryKey: ["saved-hashtags", accountId], queryFn: () => api.getSavedHashtags(accountId) as Promise<SavedHashtag[]>, enabled: !!accountId })
  const feedQuery = useQuery({ queryKey: ["trend-feed", accountId, days, format, sort], queryFn: () => api.getTrendFeed(accountId, { days, format, sort }) as Promise<Feed>, enabled: !!accountId, staleTime: 5 * 60 * 1000 })
  const saved = savedQuery.data ?? []
  const feed = feedQuery.data

  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["saved-hashtags", accountId] }), queryClient.invalidateQueries({ queryKey: ["trend-feed", accountId] })]) }

  const track = async (raw: string) => {
    const tag = raw.trim().replace(/[#\s]+/g, "").toLowerCase()
    if (!accountId || !tag) return
    if (!HASHTAG.test(tag)) return toast.error("Hashtag inválida: use letras, números e _ sem espaços.")
    if (saved.some((item) => item.hashtag === tag)) return toast(`#${tag} já está monitorada.`)
    setBusyTag(tag)
    try {
      // Search first so the hashtag id is stored and invalid tags are rejected by Meta.
      const result = await api.searchHashtag(accountId, tag)
      await api.trackHashtag(accountId, { hashtag: tag, data: result })
      setNewTag(""); toast.success(`#${tag} adicionada ao radar.`)
      await invalidate()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível consultar essa hashtag na Meta.") }
    finally { setBusyTag(null) }
  }

  const untrack = async (item: SavedHashtag) => {
    try { await api.untrackHashtag(accountId, item.id); toast.success(`#${item.hashtag} removida.`); await invalidate() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível remover a hashtag.") }
  }

  const refresh = async () => {
    setRefreshing(true)
    try { queryClient.setQueryData(["trend-feed", accountId, days, format, sort], await api.getTrendFeed(accountId, { days, format, sort, refresh: true })); await queryClient.invalidateQueries({ queryKey: ["trend-feed", accountId], refetchType: "none" }); toast.success("Radar atualizado com a Meta.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao atualizar.") }
    finally { setRefreshing(false) }
  }

  const words = newTag.replace(/#/g, " ").split(/[\s,]+/).map((word) => word.toLowerCase()).filter((word) => word.length > 1)
  const wordSuggestions = words.length > 1 ? Array.from(new Set([words.join(""), ...words])).slice(0, 6) : []
  const submit = (event: FormEvent) => { event.preventDefault(); void track(newTag) }

  if (!accountLoading && !activeAccount) return <Card className="mx-auto max-w-xl p-10 text-center"><Hash className="mx-auto mb-3 text-indigo-600" size={28} /><h2 className="text-xl font-bold text-slate-900">Conecte uma conta para ver o que está em alta</h2><p className="mt-2 text-sm text-slate-500">A busca de hashtags da Meta só funciona a partir de um perfil profissional conectado.</p></Card>

  const failed = feed?.sources.filter((source) => source.status === "error") ?? []
  const hasSources = saved.length > 0 || (feed?.competitorsIncluded ?? 0) > 0

  return <div className="space-y-6 animate-fade-in">
    <PageHeader eyebrow="Radar de conteúdo" title="Em alta no seu nicho" description="Os posts que mais estão performando nas hashtags que você acompanha e nos seus concorrentes, para usar como referência."
      actions={<Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing || !hasSources} className="gap-2"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />Atualizar agora</Button>} />

    <Card className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Hashtags no radar</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {savedQuery.isLoading ? <Skeleton className="h-8 w-48" /> : saved.length ? saved.map((item) => { const source = feed?.sources.find((entry) => entry.label === item.hashtag); return <span key={item.id} title={source?.error} className={`inline-flex items-center gap-1 rounded-lg border pl-2.5 text-xs font-medium ${source?.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}><Hash size={12} />{item.hashtag}{source?.count !== undefined && <span className="text-slate-400">· {source.count}</span>}<button type="button" aria-label={`Remover #${item.hashtag}`} onClick={() => void untrack(item)} className="ml-0.5 rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={13} /></button></span> }) : <span className="text-xs text-slate-500">Nenhuma hashtag ainda. Adicione abaixo ou escolha uma sugestão.</span>}
          </div>
          <form onSubmit={submit} className="mt-3 flex max-w-md gap-2"><div className="relative flex-1"><Hash className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="adicionar hashtag do nicho" className="h-9 pl-9" /></div><Button type="submit" size="sm" disabled={!!busyTag || !newTag.trim()} className="h-9 gap-1 bg-indigo-600 text-white">{busyTag && busyTag === newTag.trim().replace(/[#\s]+/g, "").toLowerCase() ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}Adicionar</Button></form>
          {wordSuggestions.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-[11px] text-slate-500">Hashtags não têm espaço. Adicionar:</span>{wordSuggestions.map((tag) => <button key={tag} type="button" disabled={!!busyTag} onClick={() => void track(tag)} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">{busyTag === tag ? "..." : `#${tag}`}</button>)}</div>}
          <div className="mt-3 flex flex-wrap gap-1.5"><span className="mr-1 text-[11px] text-slate-400">Sugestões:</span>{SUGGESTED.filter((tag) => !saved.some((item) => item.hashtag === tag)).slice(0, 8).map((tag) => <button key={tag} type="button" disabled={!!busyTag} onClick={() => void track(tag)} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-indigo-300 hover:text-indigo-700">{busyTag === tag ? "..." : `#${tag}`}</button>)}</div>
        </div>
        <div className="flex shrink-0 items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 lg:max-w-xs"><Info size={15} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Limite da Meta: {feed ? `${feed.quota.used}/${feed.quota.limit}` : "30"} hashtags por semana</p><p>Cada conta pode consultar até 30 hashtags diferentes a cada 7 dias. Os resultados ficam em cache por 1 h; repetir a mesma hashtag não gasta cota nova.</p></div></div>
      </div>
    </Card>

    <div className="flex flex-wrap items-center gap-2"><Segmented label="Período" options={PERIODS} value={days} onChange={setDays} /><Segmented label="Formato" options={FORMATS} value={format} onChange={setFormat} /><Segmented label="Ordenar por" options={SORTS} value={sort} onChange={setSort} />{feedQuery.isFetching && !feedQuery.isLoading && <RefreshCw size={14} className="animate-spin text-slate-400" />}{feed && <span className="ml-auto text-[11px] text-slate-400">Fontes: {saved.length} hashtags · {feed.competitorsIncluded} concorrentes</span>}</div>

    {failed.length > 0 && <Card role="alert" className="flex items-start gap-2 border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><div>{failed.map((source) => <p key={source.label}><strong>#{source.label}:</strong> {source.error}</p>)}</div></Card>}

    {feedQuery.isLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }, (_, index) => <Skeleton key={index} className="aspect-[4/6] w-full" />)}</div>
      : feedQuery.isError ? <Card className="flex flex-col items-center gap-3 p-10 text-center"><AlertTriangle className="text-amber-500" /><p className="text-sm text-slate-600">{feedQuery.error instanceof Error ? feedQuery.error.message : "Não foi possível carregar o radar."}</p><Button variant="outline" onClick={() => feedQuery.refetch()}>Tentar novamente</Button></Card>
      : !hasSources ? <Card className="p-12 text-center"><TrendingUp className="mx-auto mb-3 text-slate-300" size={32} /><h3 className="section-title">Monte seu radar</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Adicione hashtags do seu nicho acima, ou concorrentes em <a href="/competitors" className="text-indigo-700 underline">Análise de concorrentes</a>, para ver os posts que mais estão performando agora.</p></Card>
      : feed && <>
        {feed.explodingToday.length > 0 && <Card className="p-5"><div className="flex items-center gap-2"><Flame className="text-orange-500" size={18} /><h3 className="section-title">Explodindo hoje</h3></div><p className="text-xs text-slate-500">Posts das últimas 24 h que mais ganham interações por hora nas suas hashtags.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{feed.explodingToday.slice(0, 6).map((post) => <ReferencePostCard key={post.id} post={post} highlight={post.velocity !== null ? `${Math.round(post.velocity).toLocaleString("pt-BR")}/h` : undefined} />)}</div></Card>}
        <Card className="p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="section-title">Top posts em alta</h3><p className="text-xs text-slate-500">Ranking combinado: posts em destaque das hashtags e últimos posts dos concorrentes.</p></div><span className="text-[11px] text-slate-400">Gerado {new Date(feed.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div>
          {feed.items.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{feed.items.map((post, index) => <ReferencePostCard key={`${post.source.type}-${post.id}`} post={post} rank={index + 1} />)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Nenhum post para esse filtro. Tente outro período ou formato.</p>}
        </Card>
      </>}

    <Card className="border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-5 text-indigo-900"><p className="text-sm font-semibold">Por que não aparece o “Explorar” do Instagram?</p><p className="mt-1 text-indigo-800">A Meta não oferece a aba Explorar nem um ranking global de virais pela API oficial. O que existe de real é a busca de hashtags (posts em destaque e das últimas 24 h) e os dados públicos de perfis profissionais. Visualizações de posts de terceiros não são liberadas pela Meta; por isso o ranking usa curtidas e comentários. Posts de vídeo podem vir sem prévia.</p><Badge variant="secondary" className="mt-2">Dados oficiais da Meta</Badge></Card>
  </div>
}
