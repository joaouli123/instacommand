"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { FacebookReport } from "@/components/dashboard/FacebookReport"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { api, fetchApi } from "@/lib/api"
import {
  Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis, PieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts"
import { Heart, MessageCircle, Bookmark, Share2, Eye, TrendingUp, Users, RefreshCw, AlertCircle } from "lucide-react"
import { useActiveAccount } from "@/hooks/useActiveAccount"

type Account = { id: string; igUsername: string; igFollowersCount: number; lastSyncAt?: string | null }
type Dashboard = { followers: number; followerGrowth: number; reach: number | null; impressions: number | null; interactions: number | null; interactionsPartial?: boolean; pendingPosts: number }
type TimelineItem = { date: string; likes: number | null; comments: number | null; saves: number | null; shares: number | null; reach: number | null; impressions: number | null; engagement: number | null; posts: number; interactions: number | null }
type Insight = { likes?: number | null; comments?: number | null; saves?: number | null; shares?: number | null; reach?: number | null; impressions?: number | null; engagement?: number | null; collectedAt?: string }
type AnalyticsPost = { id: string; mediaType: string; caption?: string | null; igMediaUrl?: string | null; igPermalink?: string | null; publishedAt: string; insights?: Insight[] }
type AudiencePayload = { available: boolean; data: Array<Record<string, unknown>>; message?: string }

const numberFormatter = new Intl.NumberFormat("pt-BR")
const colors = ["#4f46e5", "#0284c7", "#06b6d4", "#94a3b8", "#a855f7"]
const formatNumber = (value: number | null | undefined) => value == null ? "—" : numberFormatter.format(Math.round(value))
const formatPercent = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(2)}%`
const formatDate = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
const formatType = (value: string) => ({ REEL: "Reel", CAROUSEL: "Carrossel", IMAGE: "Imagem", STORY: "Story" }[value] || value)

function getAudiencePayload(payload: unknown): AudiencePayload {
  if (Array.isArray(payload)) return { available: true, data: payload as Array<Record<string, unknown>> }
  const value = payload as Partial<AudiencePayload> | null
  return { available: Boolean(value?.available), data: Array.isArray(value?.data) ? value.data : [], message: value?.message }
}

function getInsight(post: AnalyticsPost): Insight { return post.insights?.[0] || {} }

function getAudienceRows(audience: AudiencePayload) {
  return audience.data.flatMap((item) => {
    const name = String(item.name || "Dados")
    const values = Array.isArray(item.values) ? item.values : []
    return values.flatMap((entry) => {
      const value = (entry as { value?: unknown }).value
      if (!value || typeof value !== "object" || Array.isArray(value)) return [{ name, label: "Total", value: Number(value) || 0 }]
      return Object.entries(value as Record<string, unknown>).map(([label, rawValue]) => ({ name, label, value: Number(rawValue) || 0 }))
    })
  })
}

export default function AnalyticsPage() {
  return <Tabs defaultValue="instagram" className="space-y-6">
    <TabsList aria-label="Rede social do relatório"><TabsTrigger value="instagram">Instagram</TabsTrigger><TabsTrigger value="facebook">Facebook</TabsTrigger></TabsList>
    <TabsContent value="instagram"><InstagramAnalytics /></TabsContent>
    <TabsContent value="facebook"><FacebookReport /></TabsContent>
  </Tabs>
}

function InstagramAnalytics() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState("")
  const [period, setPeriod] = useState("30")
  const [section, setSection] = useState("visao")
  const [postsPage, setPostsPage] = useState(1)
  const [postsTotal, setPostsTotal] = useState(0)
  const [postsTotalPages, setPostsTotalPages] = useState(1)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [growth, setGrowth] = useState<Array<{ date: string; followers: number }>>([])
  const [engagement, setEngagement] = useState<TimelineItem[]>([])
  const [posts, setPosts] = useState<AnalyticsPost[]>([])
  const [audience, setAudience] = useState<AudiencePayload>({ available: false, data: [] })
  const [bestTimes, setBestTimes] = useState<Array<{ day: string; hour: number; score: number; averageInteractions: number; posts: number }>>([])
  const [contentTypes, setContentTypes] = useState<Array<{ type: string; posts: number; likes: number; comments: number; saves: number; reach: number; engagement: number }>>([])
  const [recommendations, setRecommendations] = useState<Array<{ type: string; message: string; basedOn?: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const latestRequest = useRef(0)
  const { accounts: activeAccounts, accountId: activeAccountId, isLoading: accountsLoading, setActiveAccount } = useActiveAccount()

  const loadAnalytics = async (id: string, days: number, page = 1) => {
    const requestId = ++latestRequest.current
    setLoading(true)
    setError("")
    setDashboard(null)
    setGrowth([])
    setEngagement([])
    setPosts([])
    setPostsTotal(0)
    setAudience({ available: false, data: [] })
    setBestTimes([])
    setContentTypes([])
    setRecommendations([])
    try {
      const [nextDashboard, nextGrowth, nextEngagement, nextPosts, nextAudience, nextBestTimes, nextContentTypes, nextRecommendations] = await Promise.all([
        api.getDashboard(id, days), api.getGrowth(id, days), api.getEngagement(id, days), api.getAnalyticsPosts(id, page, 20, days),
        fetchApi(`/analytics/${id}/audience`), fetchApi(`/analytics/${id}/best-times?days=${days}`), fetchApi(`/analytics/${id}/content-types?days=${days}`), fetchApi(`/analytics/${id}/recommendations?days=${days}`),
      ])
      if (requestId !== latestRequest.current) return
      setDashboard(nextDashboard as Dashboard)
      setGrowth(nextGrowth as Array<{ date: string; followers: number }>)
      setEngagement(nextEngagement as TimelineItem[])
      const postPayload = nextPosts as { data?: AnalyticsPost[]; total?: number; page?: number; totalPages?: number }
      setPosts(postPayload.data || [])
      setPostsTotal(postPayload.total || 0)
      setPostsPage(postPayload.page || page)
      setPostsTotalPages(Math.max(1, postPayload.totalPages || 1))
      setAudience(getAudiencePayload(nextAudience))
      setBestTimes(nextBestTimes as typeof bestTimes)
      setContentTypes(nextContentTypes as typeof contentTypes)
      setRecommendations(nextRecommendations as typeof recommendations)
    } catch (loadError) {
      if (requestId !== latestRequest.current) return
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os dados reais da conta")
    } finally { if (requestId === latestRequest.current) setLoading(false) }
  }

  useEffect(() => {
    const nextAccounts = (activeAccounts || []) as Account[]
    setAccounts(nextAccounts)
    if (!activeAccountId) {
      if (!accountsLoading) setLoading(false)
      return
    }
    setAccountId(activeAccountId)
    void loadAnalytics(activeAccountId, Number(period), 1)
    return () => { latestRequest.current += 1 }
    // The active-account hook is the single source of truth for the global selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, activeAccounts, accountsLoading])

  const reachData = useMemo(() => engagement.filter(item => item.reach != null || item.impressions != null).map((item) => ({ name: formatDate(item.date), alcance: item.reach, impressoes: item.impressions })), [engagement])
  const engagementData = useMemo(() => engagement.filter(item => item.interactions != null).map((item) => ({ name: formatDate(item.date), interacoes: item.interactions, taxa: item.engagement })), [engagement])
  const audienceRows = useMemo(() => getAudienceRows(audience), [audience])
  const genderData = useMemo(() => audienceRows.filter((row) => row.name.includes("gender")).slice(0, 8).map((row, index) => ({ name: row.label, value: row.value * 100, color: colors[index % colors.length] })), [audienceRows])
  const cityData = useMemo(() => audienceRows.filter((row) => row.name.includes("city") || row.name.includes("country")).slice(0, 8).map((row) => ({ cidade: row.label, pct: row.value * 100 })), [audienceRows])
  const onPeriodChange = (value: string) => { setPeriod(value); setPostsPage(1); if (accountId) void loadAnalytics(accountId, Number(value), 1) }
  const onAccountChange = (value: string) => { setActiveAccount(value) }
  const onPostsPageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > postsTotalPages || nextPage === postsPage || !accountId) return
    void loadAnalytics(accountId, Number(period), nextPage)
  }

  if ((accountsLoading || loading) && !dashboard) return <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500"><RefreshCw size={18} className="mr-2 animate-spin" />Carregando dados reais da Meta...</div>
  if (!accounts.length) return <Card className="p-10 text-center"><Users className="mx-auto mb-3 text-indigo-600" /><h2 className="font-bold text-slate-900">Nenhuma conta conectada</h2><p className="mt-1 text-sm text-slate-500">Conecte uma conta profissional do Instagram para visualizar publicações e métricas.</p></Card>

  return <div className="space-y-6 animate-fade-in">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Performance real</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Análise de desempenho</h2><p className="mt-1 text-sm text-slate-500">Dados importados da sua conta, sem números de demonstração.</p></div><div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"><Select value={accountId} onValueChange={onAccountChange}><SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Conta" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>@{account.igUsername}</SelectItem>)}</SelectContent></Select><Select value={period} onValueChange={onPeriodChange}><SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger><SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem><SelectItem value="365">Últimos 12 meses</SelectItem><SelectItem value="730">Últimos 24 meses</SelectItem></SelectContent></Select></div></div>
    {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">Conta <strong>@{accounts.find((account) => account.id === accountId)?.igUsername}</strong> · {formatNumber(postsTotal)} publicações nos últimos {period} dias · última coleta {accounts.find((account) => account.id === accountId)?.lastSyncAt ? new Date(accounts.find((account) => account.id === accountId)?.lastSyncAt || "").toLocaleString("pt-BR") : "não registrada"}.</div>
    <Tabs value={section} onValueChange={setSection}><TabsList className="mb-6"><TabsTrigger value="visao">Visão Geral</TabsTrigger><TabsTrigger value="posts">Conteúdo</TabsTrigger><TabsTrigger value="audiencia">Audiência</TabsTrigger></TabsList>
      <TabsContent value="visao" className="space-y-6"><div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">{[
        { label: "Seguidores", value: formatNumber(dashboard?.followers), sub: `${dashboard?.followerGrowth && dashboard.followerGrowth > 0 ? "+" : ""}${formatNumber(dashboard?.followerGrowth)} desde a coleta anterior`, icon: Users },
        { label: "Interações disponíveis", value: dashboard?.interactions != null ? formatNumber(dashboard.interactions) : "Indisponível", sub: dashboard?.interactionsPartial ? "Cobertura parcial: algumas métricas não foram recebidas" : "Acumuladas nos posts do período", icon: Heart },
        { label: "Alcance da última coleta", value: dashboard?.reach != null ? formatNumber(dashboard.reach) : "Indisponível", sub: "Retrato da última coleta; não é o total do período", icon: Eye },
        { label: "Impressões da última coleta", value: dashboard?.impressions != null ? formatNumber(dashboard.impressions) : "Indisponível", sub: "Ausência de dado não confirma falta de permissão", icon: TrendingUp },
        { label: "Posts pendentes", value: formatNumber(dashboard?.pendingPosts), sub: "Agendamentos ativos", icon: Share2 },
      ].map((stat) => <Card key={stat.label} className="border-slate-200/80 bg-white p-5"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{stat.label}</p><stat.icon size={16} className="text-slate-400" /></div><h4 className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</h4><span className="text-xs text-slate-500">{stat.sub}</span></Card>)}</div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Alcance e impressões</h3>{reachData.length ? <ResponsiveContainer width="100%" height={300}><AreaChart data={reachData}><defs><linearGradient id="realReach" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="name" stroke="#94a3b8" fontSize={12}/><YAxis stroke="#94a3b8" fontSize={12}/><Tooltip/><Legend/><Area type="monotone" dataKey="alcance" name="Alcance" stroke="#4f46e5" fill="url(#realReach)"/><Area type="monotone" dataKey="impressoes" name="Impressões" stroke="#0284c7" fill="none"/></AreaChart></ResponsiveContainer> : <EmptyState text="Não há alcance ou impressões confirmados para os posts do período. Zeros antigos sem confirmação não são exibidos." />}</Card><Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Interações disponíveis por dia de publicação</h3>{engagementData.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={engagementData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="name" stroke="#94a3b8" fontSize={12}/><YAxis stroke="#94a3b8" fontSize={12}/><Tooltip/><Legend/><Bar dataKey="interacoes" name="Interações disponíveis" fill="#4f46e5" radius={[6, 6, 0, 0]}/></BarChart></ResponsiveContainer> : <EmptyState text="Ainda não há publicações no período escolhido." />}</Card></div>
        <Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Recomendações baseadas no seu histórico</h3>{recommendations.length ? <div className="grid gap-3 md:grid-cols-2">{recommendations.map((recommendation, index) => <div key={`${recommendation.type}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Badge variant="default">{recommendation.type}</Badge><p className="mt-2 text-sm text-slate-700">{recommendation.message}</p><p className="mt-2 text-xs text-slate-400">Baseado em {recommendation.basedOn || posts.length} publicações</p></div>)}</div> : <EmptyState text="Ainda não há histórico suficiente para recomendar ações." />}</Card>
      </TabsContent>
      <TabsContent value="posts" className="space-y-6"><Card className="p-6"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-bold text-slate-900">Performance de publicações</h3><p className="text-sm text-slate-500">Posts publicados no período selecionado. Contadores acumulados até a coleta, não apenas interações ocorridas no período. “—” significa dado não confirmado.</p></div><Badge variant="secondary">{formatNumber(postsTotal)} posts</Badge></div><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-2 py-3 text-left">Post</th><th className="px-2 py-3 text-left">Tipo</th><th className="px-2 py-3 text-left">Data</th><th className="px-2 py-3 text-right"><Heart size={14} className="inline"/> Likes</th><th className="px-2 py-3 text-right"><MessageCircle size={14} className="inline"/> Coment.</th><th className="px-2 py-3 text-right"><Bookmark size={14} className="inline"/> Salvos</th><th className="px-2 py-3 text-right"><Share2 size={14} className="inline"/> Compart.</th><th className="px-2 py-3 text-right">Alcance</th><th className="px-2 py-3 text-right">ER</th></tr></thead><tbody>{posts.map((post) => { const insight = getInsight(post); return <tr key={post.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="px-2 py-3"><a href={post.igPermalink || "#"} target="_blank" rel="noreferrer" className="flex max-w-[240px] items-center gap-3 text-slate-700 hover:text-indigo-600">{post.igMediaUrl ? <img src={post.igMediaUrl} alt="" className="h-10 w-10 rounded object-cover"/> : <div className="h-10 w-10 rounded bg-slate-100"/>}<span className="truncate">{post.caption || "Sem legenda"}</span></a></td><td className="px-2 py-3"><Badge variant={post.mediaType === "REEL" ? "default" : post.mediaType === "CAROUSEL" ? "secondary" : "outline"}>{formatType(post.mediaType)}</Badge></td><td className="px-2 py-3 text-slate-500">{formatDate(post.publishedAt)}</td><td className="px-2 py-3 text-right font-medium">{formatNumber(insight.likes)}</td><td className="px-2 py-3 text-right font-medium">{formatNumber(insight.comments)}</td><td className="px-2 py-3 text-right font-medium">{formatNumber(insight.saves)}</td><td className="px-2 py-3 text-right font-medium">{formatNumber(insight.shares)}</td><td className="px-2 py-3 text-right font-medium">{formatNumber(insight.reach)}</td><td className="px-2 py-3 text-right font-bold">{formatPercent(insight.engagement)}</td></tr> })}</tbody></table>{!posts.length && <EmptyState text="Nenhuma publicação foi importada no período escolhido."/>}</div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Página {postsPage} de {postsTotalPages}</p><div className="flex gap-2"><button type="button" onClick={() => onPostsPageChange(postsPage - 1)} disabled={postsPage <= 1 || loading} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button><button type="button" onClick={() => onPostsPageChange(postsPage + 1)} disabled={postsPage >= postsTotalPages || loading} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button></div></div></Card><Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Formatos que mais geram interação</h3>{contentTypes.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={contentTypes}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="type" tickFormatter={formatType}/><YAxis/><Tooltip/><Legend/><Bar dataKey="likes" name="Likes" fill="#4f46e5"/><Bar dataKey="comments" name="Comentários" fill="#06b6d4"/><Bar dataKey="saves" name="Salvos" fill="#f59e0b"/><Bar dataKey="shares" name="Compartilhamentos" fill="#10b981"/></BarChart></ResponsiveContainer> : <EmptyState text="Sem dados suficientes para comparar formatos."/>}</Card></TabsContent>
      <TabsContent value="audiencia" className="space-y-6"><Card className="border-amber-200 bg-amber-50/70 p-5"><div className="flex gap-3"><AlertCircle className="mt-0.5 shrink-0 text-amber-600"/><div><h3 className="font-bold text-amber-900">Dados demográficos da Meta</h3><p className="mt-1 text-sm text-amber-800">{audience.available ? "Dados retornados pela API da Meta." : (audience.message || "A Meta não liberou dados demográficos para esta conexão ainda. Likes, comentários e publicações continuam disponíveis.")}</p></div></div></Card>{audience.available && audienceRows.length ? <div className="grid grid-cols-1 gap-6 md:grid-cols-2"><Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Gênero / faixa</h3><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={genderData.length ? genderData : audienceRows.slice(0, 6).map((row, index) => ({ name: row.label, value: row.value * 100, color: colors[index % colors.length] }))} innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${Number(value).toFixed(1)}%`}>{(genderData.length ? genderData : audienceRows.slice(0, 6)).map((_, index) => <Cell key={index} fill={colors[index % colors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></Card><Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Cidades / países</h3>{cityData.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={cityData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="cidade" angle={-20} textAnchor="end" height={60}/><YAxis unit="%"/><Tooltip/><Bar dataKey="pct" name="%" fill="#4f46e5" radius={[6, 6, 0, 0]}/></BarChart></ResponsiveContainer> : <EmptyState text="A Meta não retornou cidades ou países."/>}</Card></div> : <Card className="p-10 text-center"><Users className="mx-auto mb-3 text-slate-400"/><p className="text-sm text-slate-500">Nenhum dado demográfico disponível para exibir.</p></Card>}<div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Horários observados no período</h3>{bestTimes.length ? <div className="space-y-2">{bestTimes.slice(0, 8).map((time) => <div key={`${time.day}-${time.hour}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-semibold text-slate-700">{time.day}, {String(time.hour).padStart(2, "0")}h</span><span className="text-slate-500">{formatNumber(time.averageInteractions)} interações médias · {time.posts} post(s)</span></div>)}</div> : <EmptyState text="Ainda não há histórico suficiente para calcular horários."/>}</Card><Card className="p-6"><h3 className="mb-4 text-lg font-bold text-slate-900">Como os horários foram calculados</h3><p className="text-sm leading-6 text-slate-600">Agrupamos os posts importados por dia da semana e hora de São Paulo. O ranking usa as interações registradas nos posts do período escolhido. Amostras pequenas não garantem que o horário será o melhor para futuras publicações.</p></Card></div></TabsContent>
    </Tabs>
  </div>
}

function EmptyState({ text }: { text: string }) { return <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{text}</div> }
