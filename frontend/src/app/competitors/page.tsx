"use client"

import { FormEvent, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, ArrowDown, ArrowUp, Crown, RefreshCw, Trash2, UserPlus, Users } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { AvatarImage } from "@/components/ui/avatar-image"
import { PageHeader } from "@/components/layout/PageHeader"
import { ReferencePostCard, compact, formatLabel, type RankedPost } from "@/components/dashboard/ReferencePostCard"

type FormatStat = { format: RankedPost["format"]; posts: number; avgInteractions: number | null; share: number }
type Metrics = { followers: number; mediaCount: number; avgLikes: number | null; avgComments: number | null; engagementRate: number | null; postsPerWeek: number | null; formats: FormatStat[]; topPosts: RankedPost[]; metricCoverage?: { posts: number } }
type Own = Metrics & { igUsername: string; igName?: string | null; igProfilePicUrl?: string | null }
type Competitor = Metrics & { id: string; igUsername: string; igName?: string | null; igProfilePicUrl?: string | null; igBio?: string | null; lastCollectedAt: string | null; history: Array<{ collectedAt: string; followers: number; engagementRate: number | null }> }
type Overview = { own: Own; competitors: Competitor[] }
type SortKey = "followers" | "engagementRate" | "avgLikes" | "avgComments" | "postsPerWeek"

const USERNAME = /^@?[A-Za-z0-9._]{1,30}$/
// Accept pasted profile URLs and stray spaces: instagram.com/user/ -> user
const cleanUsername = (raw: string) => { const url = raw.trim().match(/instagr(?:am\.com|\.am)\/([^/?#\s]+)/i); return (url ? url[1] : raw).replace(/\s+/g, "").replace(/^@+/, "").replace(/\/+$/, "").toLowerCase() }
const pct = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
const columns: Array<{ key: SortKey; label: string; render: (row: Metrics) => string }> = [
  { key: "followers", label: "Seguidores", render: (row) => compact(row.followers) },
  { key: "engagementRate", label: "Engajamento", render: (row) => pct(row.engagementRate) },
  { key: "avgLikes", label: "Média curtidas", render: (row) => compact(row.avgLikes) },
  { key: "avgComments", label: "Média coment.", render: (row) => compact(row.avgComments) },
  { key: "postsPerWeek", label: "Posts/semana", render: (row) => row.postsPerWeek === null ? "—" : row.postsPerWeek.toLocaleString("pt-BR") },
]

function Delta({ value, base }: { value: number | null; base: number | null }) {
  if (value === null || base === null || base === 0) return null
  const diff = ((value - base) / base) * 100
  if (Math.abs(diff) < 1) return null
  const up = diff > 0
  return <span className={`ml-1 inline-flex items-center text-[10px] font-semibold ${up ? "text-rose-600" : "text-emerald-600"}`} title="Comparado à sua conta">{up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{Math.abs(diff).toFixed(0)}%</span>
}

const followerGrowth = (history: Competitor["history"]) => {
  if (history.length < 2) return null
  const first = history[0].followers, last = history[history.length - 1].followers
  return { diff: last - first, days: Math.max(1, Math.round((new Date(history[history.length - 1].collectedAt).getTime() - new Date(history[0].collectedAt).getTime()) / 86_400_000)) }
}

export default function CompetitorsPage() {
  const { accountId, activeAccount, isLoading: accountLoading } = useActiveAccount()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("engagementRate")
  const query = useQuery({ queryKey: ["competitors-overview", accountId], queryFn: () => api.getCompetitorsOverview(accountId) as Promise<Overview>, enabled: !!accountId })
  const data = query.data
  const competitors = useMemo(() => data?.competitors ?? [], [data])
  const selected = competitors.find((item) => item.id === selectedId) ?? competitors[0] ?? null
  const usernameValid = !username.trim() || USERNAME.test(cleanUsername(username))

  const rows = useMemo(() => {
    if (!data) return []
    const all: Array<{ id: string; own: boolean; row: Own | Competitor }> = [{ id: "own", own: true, row: data.own }, ...competitors.map((row) => ({ id: row.id, own: false, row }))]
    return all.sort((a, b) => ((b.row[sortKey] as number | null) ?? -1) - ((a.row[sortKey] as number | null) ?? -1))
  }, [data, competitors, sortKey])

  const reload = () => queryClient.invalidateQueries({ queryKey: ["competitors-overview", accountId] })

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const value = cleanUsername(username)
    setAddError(null)
    if (!accountId || !value) return toast.error("Informe o @username do concorrente.")
    if (!USERNAME.test(value)) return toast.error("@username inválido: use letras, números, ponto e _ (até 30).")
    if (value.toLowerCase() === activeAccount?.igUsername?.toLowerCase()) return toast.error("Esse é o seu próprio perfil.")
    setSaving(true)
    try {
      const item = await api.addCompetitor(accountId, value) as { id: string; igUsername: string }
      setUsername(""); setSelectedId(item.id)
      toast.success(`@${item.igUsername} adicionado e analisado.`)
      await reload()
    } catch (error) { const message = error instanceof Error ? error.message : "Não foi possível consultar esse perfil na Meta."; setAddError(message); toast.error(message) }
    finally { setSaving(false) }
  }

  const refresh = async (ids: string[]) => {
    setRefreshing(ids.length > 1 ? "all" : ids[0])
    const results = await Promise.allSettled(ids.map((id) => api.refreshCompetitor(id)))
    const failed = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[]
    if (failed.length) toast.error(failed[0].reason instanceof Error ? failed[0].reason.message : "Falha ao atualizar.")
    if (failed.length < ids.length) toast.success(ids.length > 1 ? `${ids.length - failed.length} perfis atualizados.` : "Dados atualizados.")
    await reload(); setRefreshing(null)
  }

  const remove = async (item: Competitor) => {
    if (!window.confirm(`Remover @${item.igUsername} do monitoramento? O histórico salvo também será apagado.`)) return
    try { await api.deleteCompetitor(item.id); toast.success("Monitoramento removido."); if (selectedId === item.id) setSelectedId(null); await reload() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível remover o concorrente.") }
  }

  if (!accountLoading && !activeAccount) return <Card className="mx-auto max-w-xl p-10 text-center"><Users className="mx-auto mb-3 text-indigo-600" size={28} /><h2 className="text-xl font-bold text-slate-900">Conecte uma conta para monitorar concorrentes</h2><p className="mt-2 text-sm text-slate-500">A Meta só permite consultar concorrentes a partir de um perfil profissional conectado.</p></Card>

  const leader = rows.find((item) => item.row.engagementRate !== null)

  return <div className="space-y-6 animate-fade-in">
    <PageHeader eyebrow="Inteligência competitiva" title="Análise de concorrentes" description={<>Compare @{activeAccount?.igUsername} com perfis públicos do seu nicho, com dados reais da Meta.</>}
      actions={<>{competitors.length > 0 && <Button variant="outline" size="sm" disabled={!!refreshing} onClick={() => void refresh(competitors.map((item) => item.id))} className="gap-2"><RefreshCw size={14} className={refreshing === "all" ? "animate-spin" : ""} />Atualizar todos</Button>}<Badge variant="secondary">{competitors.length}/20 monitorados</Badge></>} />

    <Card className="p-4">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><span className="absolute left-3.5 top-3 text-sm text-slate-400">@</span><Input value={username} onChange={(event) => { setUsername(event.target.value); setAddError(null) }} aria-invalid={!usernameValid} placeholder="username ou link do perfil" className={`h-11 flex-1 pl-8 ${usernameValid ? "" : "border-rose-300 focus-visible:ring-rose-200"}`} /></div>
        <Button type="submit" disabled={saving || !usernameValid || competitors.length >= 20} className="h-11 gap-2 bg-indigo-600 text-white">{saving ? <RefreshCw size={16} className="animate-spin" /> : <UserPlus size={16} />}{saving ? "Consultando a Meta..." : "Adicionar concorrente"}</Button>
      </form>
      {addError && <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-xs text-rose-700"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{addError}</p>}
      <p className={`mt-2 text-xs ${usernameValid ? "text-slate-500" : "text-rose-600"}`}>{usernameValid ? "O perfil precisa ser profissional (Business ou Creator) e público. Ao adicionar, já coletamos os últimos 25 posts." : "Use apenas letras, números, ponto e _ (até 30 caracteres)."}</p>
    </Card>

    {query.isLoading ? <div className="space-y-4"><Skeleton className="h-56 w-full" /><Skeleton className="h-80 w-full" /></div>
      : query.isError ? <Card className="flex flex-col items-center gap-3 p-10 text-center"><AlertTriangle className="text-amber-500" /><p className="text-sm text-slate-600">{query.error instanceof Error ? query.error.message : "Não foi possível carregar os concorrentes."}</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></Card>
      : !competitors.length ? <Card className="p-12 text-center"><Users className="mx-auto mb-3 text-slate-300" size={32} /><h3 className="section-title">Nenhum concorrente monitorado</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Adicione 3 a 5 perfis do seu nicho para comparar engajamento, frequência e formatos, e descobrir quais posts deles mais funcionam.</p></Card>
      : data && <>
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="section-title">Comparativo</h3><p className="text-xs text-slate-500">Clique no título de uma coluna para ordenar. Setas mostram a diferença em relação à sua conta.</p></div>{leader && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Crown size={13} />Maior engajamento: {leader.own ? "você" : `@${leader.row.igUsername}`}</span>}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2.5 font-semibold">Perfil</th>{columns.map((column) => <th key={column.key} className="px-3 py-2.5 text-right font-semibold"><button type="button" onClick={() => setSortKey(column.key)} className={`inline-flex items-center gap-1 ${sortKey === column.key ? "text-indigo-700" : "hover:text-slate-800"}`}>{column.label}{sortKey === column.key && <ArrowDown size={11} />}</button></th>)}<th className="px-3 py-2.5 text-right font-semibold">Melhor formato</th><th className="w-20" /></tr></thead>
              <tbody>{rows.map(({ id, own, row }) => { const competitor = own ? null : row as Competitor; const best = row.formats.find((item) => item.avgInteractions !== null); return <tr key={id} onClick={() => competitor && setSelectedId(competitor.id)} className={`border-t border-slate-100 ${own ? "bg-indigo-50/50" : "cursor-pointer hover:bg-slate-50"} ${competitor && selected?.id === competitor.id ? "ring-1 ring-inset ring-indigo-200" : ""}`}>
                <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-center text-sm font-bold leading-9 text-white"><AvatarImage src={row.igProfilePicUrl} fallback={row.igUsername[0]?.toUpperCase()} /></div><div className="min-w-0"><p className="truncate font-semibold text-slate-900">@{row.igUsername}{own && <Badge variant="secondary" className="ml-2 align-middle text-[10px]">Você</Badge>}</p><p className="truncate text-[11px] text-slate-400">{own ? `${row.metricCoverage?.posts ?? 0} posts sincronizados` : competitor?.lastCollectedAt ? `Atualizado ${new Date(competitor.lastCollectedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Aguardando coleta"}</p></div></div></td>
                {columns.map((column) => <td key={column.key} className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-800">{column.render(row)}{!own && <Delta value={row[column.key] as number | null} base={data.own[column.key] as number | null} />}</td>)}
                <td className="px-3 py-3 text-right text-xs text-slate-600">{best ? `${formatLabel[best.format]} · ${compact(best.avgInteractions)}` : "—"}</td>
                <td className="px-3 py-3 text-right">{competitor && <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}><button type="button" title="Atualizar" aria-label={`Atualizar @${competitor.igUsername}`} disabled={!!refreshing} onClick={() => void refresh([competitor.id])} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><RefreshCw size={14} className={refreshing === competitor.id ? "animate-spin" : ""} /></button><button type="button" title="Remover" aria-label={`Remover @${competitor.igUsername}`} onClick={() => void remove(competitor)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></div>}</td>
              </tr> })}</tbody>
            </table>
          </div>
        </Card>

        {selected && <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">{competitors.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${selected.id === item.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"}`}>@{item.igUsername}</button>)}</div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-start justify-between gap-3"><div><h3 className="section-title">Crescimento de @{selected.igUsername}</h3><p className="text-xs text-slate-500">Seguidores por coleta (diária, automática).</p></div>{(() => { const growth = followerGrowth(selected.history); return growth && <Badge variant="secondary" className={growth.diff >= 0 ? "text-emerald-700" : "text-rose-700"}>{growth.diff >= 0 ? "+" : ""}{growth.diff.toLocaleString("pt-BR")} em {growth.days} d</Badge> })()}</div>
              {selected.history.length >= 2 ? <div className="mt-4 h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={selected.history.map((item) => ({ date: new Date(item.collectedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), followers: item.followers }))} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={56} domain={["dataMin", "dataMax"]} tickFormatter={(value: number) => compact(value)} /><Tooltip formatter={(value) => [Number(value).toLocaleString("pt-BR"), "Seguidores"]} /><Line type="monotone" dataKey="followers" stroke="#4f46e5" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
                : <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">O gráfico aparece a partir da segunda coleta (a coleta automática roda uma vez por dia).</p>}
            </Card>
            <Card className="p-5">
              <h3 className="section-title">Formatos de @{selected.igUsername}</h3>
              <p className="text-xs text-slate-500">Média de interações nos últimos posts coletados.</p>
              {selected.formats.length ? <div className="mt-4 space-y-3">{selected.formats.map((item, index) => { const max = Math.max(...selected.formats.map((format) => format.avgInteractions ?? 0), 1); return <div key={item.format}><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">{formatLabel[item.format]}{index === 0 && item.avgInteractions !== null && <Crown size={11} className="ml-1 inline text-amber-500" />}</span><span className="text-slate-500">{compact(item.avgInteractions)} · {item.posts} posts ({item.share}%)</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${((item.avgInteractions ?? 0) / max) * 100}%` }} /></div></div> })}</div> : <p className="mt-4 text-sm text-slate-500">Sem posts coletados ainda.</p>}
              {selected.igBio && <p className="mt-4 line-clamp-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{selected.igBio}</p>}
            </Card>
          </div>
          <Card className="p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="section-title">Posts que mais engajaram · @{selected.igUsername}</h3><p className="text-xs text-slate-500">Ordenados por engajamento sobre seguidores, entre os últimos 25 posts.</p></div></div>
            {selected.topPosts.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{selected.topPosts.map((post, index) => <ReferencePostCard key={post.id} post={post} rank={index + 1} />)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Nenhum post coletado. Clique em atualizar na tabela.</p>}
          </Card>
        </div>}
      </>}

    <Card className="border-indigo-100 bg-indigo-50/50 p-4 text-sm text-indigo-900"><p className="font-semibold">De onde vêm os dados</p><p className="mt-1 text-xs leading-5 text-indigo-800">Consultamos o Business Discovery da Meta: seguidores, total de posts e curtidas/comentários dos 25 posts mais recentes de cada perfil. Visualizações, alcance e salvamentos de concorrentes não são liberados pela Meta. Quando o perfil oculta curtidas, mostramos “—” em vez de inventar números. Engajamento = (curtidas + comentários) ÷ seguidores.</p></Card>
  </div>
}
