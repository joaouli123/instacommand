"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Bookmark, Eye, Heart,
  MessageCircle, RefreshCw, Share2, TrendingUp, Users,
} from "lucide-react"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { api, fetchApi } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Account = { id: string; igUsername: string; igFollowersCount: number; lastSyncAt?: string | null }
type Dashboard = {
  followers: number; followerGrowth: number | null; hasFollowerHistory?: boolean
  reach: number | null; views: number | null; impressions: number | null
  accountsEngaged?: number | null; profileLinkTaps?: number | null
  interactions: number | null; interactionsPartial?: boolean; engagementRate?: number | null; pendingPosts: number
}
type FollowerSnapshot = { date: string; followers: number; reach: number | null; views: number | null; interactions: number | null }
type TimelineItem = { date: string; likes: number | null; comments: number | null; saves: number | null; shares: number | null; reach: number | null; impressions: number | null; engagement: number | null; posts: number; interactions: number | null }
type Insight = { likes?: number | null; comments?: number | null; saves?: number | null; shares?: number | null; reach?: number | null; views?: number | null; engagement?: number | null; collectedAt?: string }
type PostMetrics = { likes?: number | null; comments?: number | null; replies?: number | null; saves?: number | null; shares?: number | null; reach?: number | null; views?: number | null; engagement?: number | null; interactions?: number | null; interactionsPartial?: boolean; coverage?: Record<string, number> }
type AnalyticsPost = { id: string; mediaType: string; caption?: string | null; igMediaUrl?: string | null; igPermalink?: string | null; publishedAt: string; score?: number; metrics?: PostMetrics; insights?: Insight[] }
type AudiencePayload = { available: boolean; data: Array<Record<string, unknown>>; message?: string; audience?: string; timeframe?: string }
type AudienceRow = { name: string; label: string; value: number }
type ContentType = { type: string; posts: number; likes: number | null; comments: number | null; saves: number | null; shares: number | null; views?: number | null; reach: number | null; engagement: number | null; interactions?: number | null }
type BestTime = { day: string; hour: number; score: number; averageInteractions: number; posts: number }
type TopGroup = "STORY" | "REEL" | "FEED"
type RankMetric = "interactions" | "views" | "reach"

const numberFormatter = new Intl.NumberFormat("pt-BR")
const colors = ["#4f46e5", "#0284c7", "#06b6d4", "#94a3b8", "#a855f7", "#f97316"]
const formatNumber = (value: number | null | undefined) => value == null ? "—" : numberFormatter.format(Math.round(value))
const formatPercent = (value: number | null | undefined) => value == null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
const formatDate = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })
const formatType = (value: string) => ({ REEL: "Reel", CAROUSEL: "Carrossel", IMAGE: "Imagem", STORY: "Story" }[value] || value)
const emptyAudience: AudiencePayload = { available: false, data: [] }
const optional = <T,>(request: Promise<T>, fallback: T) => request.catch(() => fallback)

function getAudienceRows(audience: AudiencePayload): AudienceRow[] {
  return audience.data.flatMap((item) => {
    const name = String(item.name || "Dados")
    const values = Array.isArray(item.values) ? item.values : []
    return values.flatMap((entry) => {
      const value = (entry as { value?: unknown }).value
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        const numeric = typeof value === "number" && Number.isFinite(value) ? value : null
        return numeric === null ? [] : [{ name, label: "Total", value: numeric }]
      }
      return Object.entries(value as Record<string, unknown>).flatMap(([label, raw]) =>
        typeof raw === "number" && Number.isFinite(raw) ? [{ name, label, value: raw }] : [],
      )
    })
  })
}

function rowsFor(rows: AudienceRow[], dimension: string) {
  return rows.filter((row) => row.name.endsWith(`_${dimension}`)).sort((a, b) => b.value - a.value).slice(0, dimension === "city" || dimension === "country" ? 8 : 12)
}

function getMetrics(post: AnalyticsPost): PostMetrics {
  return post.metrics || post.insights?.[0] || {}
}

export function InstagramAnalytics() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState("")
  const [period, setPeriod] = useState("30")
  const [section, setSection] = useState("visao")
  const [audienceType, setAudienceType] = useState<"followers" | "engaged">("followers")
  const [postsPage, setPostsPage] = useState(1)
  const [postsTotal, setPostsTotal] = useState(0)
  const [postsTotalPages, setPostsTotalPages] = useState(1)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [growth, setGrowth] = useState<FollowerSnapshot[]>([])
  const [engagement, setEngagement] = useState<TimelineItem[]>([])
  const [posts, setPosts] = useState<AnalyticsPost[]>([])
  const [audience, setAudience] = useState<AudiencePayload>(emptyAudience)
  const [bestTimes, setBestTimes] = useState<BestTime[]>([])
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [recommendations, setRecommendations] = useState<Array<{ type: string; message: string; basedOn?: number }>>([])
  const [rankings, setRankings] = useState<Record<TopGroup, AnalyticsPost[]>>({ STORY: [], REEL: [], FEED: [] })
  const [rankMetrics, setRankMetrics] = useState<Record<TopGroup, RankMetric>>({ STORY: "views", REEL: "views", FEED: "interactions" })
  const [rankingLoading, setRankingLoading] = useState<Record<TopGroup, boolean>>({ STORY: false, REEL: false, FEED: false })
  const [loading, setLoading] = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [loadingAudience, setLoadingAudience] = useState(false)
  const [error, setError] = useState("")
  const latestRequest = useRef(0)
  const { accounts: activeAccounts, accountId: activeAccountId, isLoading: accountsLoading, setActiveAccount } = useActiveAccount()

  const loadRanking = useCallback(async (id: string, days: number, type: TopGroup, metric: RankMetric) => {
    setRankingLoading((state) => ({ ...state, [type]: true }))
    try {
      const result = await fetchApi(`/analytics/${encodeURIComponent(id)}/top-posts?days=${days}&mediaType=${type}&sortBy=${metric}`) as { data?: AnalyticsPost[] }
      setRankings((state) => ({ ...state, [type]: result.data || [] }))
      setRankMetrics((state) => ({ ...state, [type]: metric }))
    } catch {
      setRankings((state) => ({ ...state, [type]: [] }))
    } finally { setRankingLoading((state) => ({ ...state, [type]: false })) }
  }, [])

  const loadAudience = useCallback(async (id: string, type: "followers" | "engaged") => {
    setLoadingAudience(true)
    try {
      const result = await fetchApi(`/analytics/${encodeURIComponent(id)}/audience?audience=${type}`) as AudiencePayload
      setAudience(result)
      setAudienceType(type)
    } catch (loadError) {
      setAudience({ available: false, data: [], message: loadError instanceof Error ? loadError.message : "Não foi possível consultar a audiência." })
    } finally { setLoadingAudience(false) }
  }, [])

  const loadAnalytics = useCallback(async (id: string, days: number, page = 1) => {
    const requestId = ++latestRequest.current
    setLoading(true)
    setError("")
    setDashboard(null)
    setGrowth([])
    setEngagement([])
    setPosts([])
    setPostsTotal(0)
    setAudience(emptyAudience)
    setBestTimes([])
    setContentTypes([])
    setRecommendations([])
    setRankings({ STORY: [], REEL: [], FEED: [] })
    try {
      const postFallback = { data: [], total: 0, page, totalPages: 1 }
      const [nextDashboard, nextGrowth, nextEngagement, nextPosts, nextAudience, nextBestTimes, nextContentTypes, nextRecommendations, topStories, topReels, topFeed] = await Promise.all([
        api.getDashboard(id, days), api.getGrowth(id, days), api.getEngagement(id, days), api.getAnalyticsPosts(id, page, 20, days),
        optional(fetchApi(`/analytics/${id}/audience?audience=${audienceType}`), emptyAudience),
        optional(fetchApi(`/analytics/${id}/best-times?days=${days}`), []),
        optional(fetchApi(`/analytics/${id}/content-types?days=${days}`), []),
        optional(fetchApi(`/analytics/${id}/recommendations?days=${days}`), []),
        optional(fetchApi(`/analytics/${id}/top-posts?days=${days}&mediaType=STORY&sortBy=views`), { data: [] }),
        optional(fetchApi(`/analytics/${id}/top-posts?days=${days}&mediaType=REEL&sortBy=views`), { data: [] }),
        optional(fetchApi(`/analytics/${id}/top-posts?days=${days}&mediaType=FEED&sortBy=interactions`), { data: [] }),
      ])
      if (requestId !== latestRequest.current) return
      setDashboard(nextDashboard as Dashboard)
      setGrowth(nextGrowth as FollowerSnapshot[])
      setEngagement(nextEngagement as TimelineItem[])
      const postPayload = nextPosts as { data?: AnalyticsPost[]; total?: number; page?: number; totalPages?: number }
      setPosts(postPayload.data || [])
      setPostsTotal(postPayload.total || 0)
      setPostsPage(postPayload.page || page)
      setPostsTotalPages(Math.max(1, postPayload.totalPages || 1))
      setAudience(nextAudience as AudiencePayload)
      setBestTimes(nextBestTimes as BestTime[])
      setContentTypes(nextContentTypes as ContentType[])
      setRecommendations(nextRecommendations as Array<{ type: string; message: string; basedOn?: number }>)
      setRankings({
        STORY: ((topStories as { data?: AnalyticsPost[] }).data || []),
        REEL: ((topReels as { data?: AnalyticsPost[] }).data || []),
        FEED: ((topFeed as { data?: AnalyticsPost[] }).data || []),
      })
      setRankMetrics({ STORY: "views", REEL: "views", FEED: "interactions" })
    } catch (loadError) {
      if (requestId !== latestRequest.current) return
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os dados reais da conta.")
    } finally { if (requestId === latestRequest.current) setLoading(false) }
  }, [audienceType])

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

  const audienceRows = useMemo(() => getAudienceRows(audience), [audience])
  const genderRows = useMemo(() => rowsFor(audienceRows, "gender"), [audienceRows])
  const ageRows = useMemo(() => rowsFor(audienceRows, "age"), [audienceRows])
  const countryRows = useMemo(() => rowsFor(audienceRows, "country"), [audienceRows])
  const cityRows = useMemo(() => rowsFor(audienceRows, "city"), [audienceRows])
  const followerChart = useMemo(() => growth.map((item, index) => ({
    date: formatDate(item.date), followers: item.followers,
    netChange: index ? item.followers - growth[index - 1].followers : null,
  })), [growth])
  const profileHistory = useMemo(() => growth.filter((item) => item.reach !== null || item.views !== null).map((item) => ({
    date: formatDate(item.date), alcance: item.reach, visualizacoes: item.views,
  })), [growth])
  const engagementData = useMemo(() => engagement.filter((item) => item.interactions != null).map((item) => ({
    date: formatDate(item.date), interacoes: item.interactions, posts: item.posts,
  })), [engagement])
  const periodNetGrowth = growth.length > 1 ? growth[growth.length - 1].followers - growth[0].followers : null
  const followerGrowthRate = growth.length > 1 && growth[0].followers > 0 ? periodNetGrowth! / growth[0].followers * 100 : null
  const followerLatestDate = growth.length ? growth[growth.length - 1].date : null
  const currentAccount = accounts.find((account) => account.id === accountId)
  const onPeriodChange = (value: string) => { setPeriod(value); setPostsPage(1); if (accountId) void loadAnalytics(accountId, Number(value), 1) }
  const onAccountChange = (value: string) => setActiveAccount(value)

  const onPostsPageChange = async (nextPage: number) => {
    if (nextPage < 1 || nextPage > postsTotalPages || nextPage === postsPage || !accountId) return
    setLoadingPosts(true)
    try {
      const result = await api.getAnalyticsPosts(accountId, nextPage, 20, Number(period)) as { data?: AnalyticsPost[]; total?: number; page?: number; totalPages?: number }
      setPosts(result.data || [])
      setPostsPage(result.page || nextPage)
      setPostsTotal(result.total || 0)
      setPostsTotalPages(Math.max(1, result.totalPages || 1))
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar essa página.") }
    finally { setLoadingPosts(false) }
  }

  if ((accountsLoading || loading) && !dashboard) return <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500"><RefreshCw size={18} className="mr-2 animate-spin" />Carregando dados reais da Meta...</div>
  if (!accounts.length) return <Card className="p-10 text-center"><Users className="mx-auto mb-3 text-indigo-600" /><h2 className="font-bold text-slate-900">Nenhuma conta conectada</h2><p className="mt-1 text-sm text-slate-500">Conecte uma conta profissional do Instagram para visualizar publicações e métricas.</p></Card>

  const changeRankMetric = (type: TopGroup, metric: RankMetric) => {
    setRankMetrics((state) => ({ ...state, [type]: metric }))
    if (accountId) void loadRanking(accountId, Number(period), type, metric)
  }

  return <div className="space-y-6 animate-fade-in">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Performance real</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Análise de desempenho</h2><p className="mt-1 text-sm text-slate-500">Métricas e histórico retornados pela sua conta do Instagram.</p></div>
      <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
        <Select value={accountId} onValueChange={onAccountChange}><SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Conta" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>@{account.igUsername}</SelectItem>)}</SelectContent></Select>
        <Select value={period} onValueChange={onPeriodChange}><SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger><SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem><SelectItem value="365">Últimos 12 meses</SelectItem><SelectItem value="730">Últimos 24 meses</SelectItem></SelectContent></Select>
      </div>
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><span>Conta <strong className="text-slate-900">@{currentAccount?.igUsername}</strong> · {formatNumber(postsTotal)} publicações no período de {period} dias</span><span>Última sincronização: {currentAccount?.lastSyncAt ? new Date(currentAccount.lastSyncAt).toLocaleString("pt-BR") : "não registrada"}</span></div>

    <Tabs value={section} onValueChange={setSection}>
      <div className="overflow-x-auto pb-1"><TabsList className="grid h-auto min-w-[760px] w-full grid-cols-7 gap-1">
        <TabsTrigger value="visao" className="px-2 text-xs sm:text-sm">Visão geral</TabsTrigger><TabsTrigger value="seguidores" className="px-2 text-xs sm:text-sm">Seguidores</TabsTrigger><TabsTrigger value="demografia" className="px-2 text-xs sm:text-sm">Demografia</TabsTrigger><TabsTrigger value="stories" className="px-2 text-xs sm:text-sm">Top 20 Stories</TabsTrigger><TabsTrigger value="reels" className="px-2 text-xs sm:text-sm">Top 20 Reels</TabsTrigger><TabsTrigger value="posts" className="px-2 text-xs sm:text-sm">Top posts</TabsTrigger><TabsTrigger value="horarios" className="px-2 text-xs sm:text-sm">Melhores horários</TabsTrigger>
      </TabsList></div>

      <TabsContent value="visao" className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Seguidores atuais" value={formatNumber(dashboard?.followers)} detail={followerLatestDate ? `Coleta de ${formatDate(followerLatestDate)}` : "Total retornado pela Meta"} icon={Users} />
          <Stat label="Variação líquida no período" value={periodNetGrowth == null ? "—" : `${periodNetGrowth > 0 ? "+" : ""}${formatNumber(periodNetGrowth)}`} detail={followerGrowthRate == null ? "Precisa de ao menos duas coletas" : `${formatPercent(followerGrowthRate)} sobre o início do período`} icon={periodNetGrowth != null && periodNetGrowth < 0 ? ArrowDownRight : ArrowUpRight} />
          <Stat label="Alcance da coleta mais recente" value={formatNumber(dashboard?.reach)} detail="Não é a soma do período" icon={Eye} />
          <Stat label="Visualizações da coleta mais recente" value={formatNumber(dashboard?.views)} detail={dashboard?.reach && dashboard.views != null ? `Frequência: ${(dashboard.views / dashboard.reach).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} por conta alcançada` : "Frequência indisponível sem alcance e visualizações"} icon={TrendingUp} />
          <Stat label="Interações nos posts do período" value={formatNumber(dashboard?.interactions)} detail={dashboard?.interactionsPartial ? "Soma parcial: a Meta omitiu alguns contadores" : "Contadores acumulados até a última coleta"} icon={Heart} />
          <Stat label="Taxa média por publicação" value={formatPercent(dashboard?.engagementRate)} detail="Média das taxas disponíveis; não é uma taxa ponderada do perfil" icon={TrendingUp} />
          <Stat label="Contas engajadas" value={formatNumber(dashboard?.accountsEngaged)} detail="Valor da coleta mais recente" icon={Users} />
          <Stat label="Toques em links do perfil" value={formatNumber(dashboard?.profileLinkTaps)} detail="Valor da coleta mais recente, quando disponível" icon={ArrowUpRight} />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5"><ChartHeading title="Alcance e visualizações do perfil" subtitle="Última coleta disponível em cada dia; pontos ausentes não são tratados como zero." />{profileHistory.length ? <ResponsiveContainer width="100%" height={300}><AreaChart data={profileHistory} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}><defs><linearGradient id="analyticsReachFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/><XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false}/><YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/><Tooltip/><Legend/><Area connectNulls={false} type="monotone" dataKey="alcance" name="Alcance" stroke="#4f46e5" fill="url(#analyticsReachFill)"/><Area connectNulls={false} type="monotone" dataKey="visualizacoes" name="Visualizações" stroke="#0284c7" fill="none"/></AreaChart></ResponsiveContainer> : <Empty text="Ainda não há histórico de alcance ou visualizações. Sincronizações futuras vão formar essa série." />}</Card>
          <Card className="p-5"><ChartHeading title="Interações por data de publicação" subtitle="Soma dos contadores conhecidos dos posts publicados em cada dia, acumulados até a coleta." />{engagementData.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={engagementData} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/><XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false}/><YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="interacoes" name="Interações disponíveis" fill="#4f46e5" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer> : <Empty text="Não há posts com contadores disponíveis no período selecionado." />}</Card>
        </div>
        <Card className="p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-2"><ChartHeading title="Formatos publicados" subtitle="Totais acumulados por formato; o alcance pode incluir as mesmas pessoas em posts diferentes."/><Badge variant="secondary">{formatNumber(contentTypes.reduce((sum, item) => sum + item.posts, 0))} posts</Badge></div>{contentTypes.length ? <ResponsiveContainer width="100%" height={290}><BarChart data={contentTypes} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/><XAxis dataKey="type" tickFormatter={formatType}/><YAxis/><Tooltip/><Legend/><Bar dataKey="interactions" name="Interações" fill="#4f46e5" radius={[5, 5, 0, 0]}/><Bar dataKey="views" name="Visualizações" fill="#0ea5e9" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer> : <Empty text="Sem dados suficientes para comparar os formatos." />}</Card>
        <Card className="p-5"><ChartHeading title="Recomendações do histórico" />{recommendations.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{recommendations.map((item, index) => <div key={`${item.type}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Badge variant="default">{item.type}</Badge><p className="mt-2 text-sm text-slate-700">{item.message}</p><p className="mt-2 text-xs text-slate-400">Baseado em {item.basedOn || postsTotal} publicação(ões)</p></div>)}</div> : <Empty text="Ainda não há histórico suficiente para recomendações." />}</Card>
      </TabsContent>

      <TabsContent value="seguidores" className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3"><Stat label="Seguidores no início" value={formatNumber(growth[0]?.followers)} detail={growth[0] ? formatDate(growth[0].date) : "Sem coleta no início"} icon={Users}/><Stat label="Seguidores atuais" value={formatNumber(growth.at(-1)?.followers ?? dashboard?.followers)} detail={growth.at(-1) ? formatDate(growth.at(-1)!.date) : "Total mais recente"} icon={Users}/><Stat label="Variação líquida" value={periodNetGrowth == null ? "—" : `${periodNetGrowth > 0 ? "+" : ""}${formatNumber(periodNetGrowth)}`} detail="Diferença entre as coletas observadas" icon={TrendingUp}/></div>
        <Card className="p-5"><ChartHeading title="Evolução de seguidores" subtitle="Uma observação por dia (a última coleta daquele dia). Datas sem coleta não são interpoladas." />{followerChart.length ? <ResponsiveContainer width="100%" height={360}><AreaChart data={followerChart} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}><defs><linearGradient id="followersFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/><XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false}/><YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={["auto", "auto"]}/><Tooltip formatter={(value: number) => [formatNumber(value), "Seguidores"]}/><Area type="monotone" dataKey="followers" name="Seguidores" stroke="#4f46e5" strokeWidth={2.5} fill="url(#followersFill)"/></AreaChart></ResponsiveContainer> : <Empty text="O histórico começa a aparecer depois de duas sincronizações em dias diferentes." />}</Card>
        <Card className="p-5"><ChartHeading title="Variação líquida entre coletas" subtitle="Diferença no total de seguidores; não separa quem começou a seguir de quem deixou de seguir." />{followerChart.filter((item) => item.netChange !== null).length ? <ResponsiveContainer width="100%" height={260}><BarChart data={followerChart.filter((item) => item.netChange !== null)} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/><XAxis dataKey="date" tick={{ fontSize: 11 }}/><YAxis/><Tooltip formatter={(value: number) => [`${value > 0 ? "+" : ""}${formatNumber(value)}`, "Variação líquida"]}/><Bar dataKey="netChange" name="Variação líquida" radius={[5, 5, 0, 0]}>{followerChart.filter((item) => item.netChange !== null).map((item, index) => <Cell key={index} fill={(item.netChange || 0) >= 0 ? "#16a34a" : "#ef4444"}/>)}</Bar></BarChart></ResponsiveContainer> : <Empty text="É preciso haver pelo menos duas coletas para calcular uma variação." />}</Card>
      </TabsContent>

      <TabsContent value="demografia" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">Quem acompanha seu perfil</h3><p className="text-sm text-slate-500">Dados demográficos de seguidores ou de pessoas que interagiram, conforme a disponibilidade da Meta.</p></div><div className="flex gap-2"><Button variant={audienceType === "followers" ? "default" : "outline"} onClick={() => accountId && void loadAudience(accountId, "followers")} disabled={loadingAudience}>Seguidores</Button><Button variant={audienceType === "engaged" ? "default" : "outline"} onClick={() => accountId && void loadAudience(accountId, "engaged")} disabled={loadingAudience}>Público engajado</Button></div></div>
        {!audience.available && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle size={18} className="mt-0.5 shrink-0"/><div><strong>Demografia não disponível</strong><p className="mt-1">{audience.message || "A Meta não retornou esses dados para esta conta. Isso pode depender da permissão do app ou da elegibilidade do público."}</p></div></div>}
        {audience.available && <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5"><ChartHeading title="Por gênero" subtitle="Distribuição do público retornado pela Meta."/>{genderRows.length ? <><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={genderRows} dataKey="value" nameKey="label" innerRadius={65} outerRadius={95} paddingAngle={3} label={({ name, percent }) => `${genderLabel(String(name))} ${(Number(percent) * 100).toFixed(0)}%`}>{genderRows.map((row, index) => <Cell key={`${row.label}-${index}`} fill={colors[index % colors.length]}/>)}</Pie><Tooltip formatter={(value: number) => [formatNumber(value), "Pessoas"]}/></PieChart></ResponsiveContainer><div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-600">{genderRows.map((row, index) => <span key={row.label} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }}/>{genderLabel(row.label)} · {formatNumber(row.value)}</span>)}</div></> : <Empty text="A Meta não retornou a divisão por gênero."/>}</Card>
          <DemographicBars title="Por faixa etária" data={ageRows} empty="A Meta não retornou faixas etárias." />
          <DemographicBars title="Por país" data={countryRows} empty="A Meta não retornou países." />
          <DemographicBars title="Por cidade" data={cityRows} empty="A Meta não retornou cidades." />
        </div>}
        {audience.available && <p className="text-xs text-slate-500">Janela demográfica: últimos 30 dias. A Meta pode omitir dimensões que não estejam disponíveis para a conta.</p>}
      </TabsContent>

      <TabsContent value="stories"><TopContent title="Top 20 Stories" group="STORY" posts={rankings.STORY} metric={rankMetrics.STORY} loading={rankingLoading.STORY} onMetricChange={changeRankMetric} period={period} /></TabsContent>
      <TabsContent value="reels"><TopContent title="Top 20 Reels" group="REEL" posts={rankings.REEL} metric={rankMetrics.REEL} loading={rankingLoading.REEL} onMetricChange={changeRankMetric} period={period} /></TabsContent>
      <TabsContent value="posts" className="space-y-5"><TopContent title="Top 20 posts e carrosséis" group="FEED" posts={rankings.FEED} metric={rankMetrics.FEED} loading={rankingLoading.FEED} onMetricChange={changeRankMetric} period={period} /><PostTable posts={posts} total={postsTotal} page={postsPage} pages={postsTotalPages} loading={loadingPosts} onPageChange={onPostsPageChange}/></TabsContent>
      <TabsContent value="horarios" className="space-y-5"><Card className="p-5"><ChartHeading title="Melhores horários observados" subtitle="Média de interações dos posts por dia e hora de publicação (horário de São Paulo)."/>{bestTimes.length ? <ResponsiveContainer width="100%" height={350}><BarChart data={bestTimes} layout="vertical" margin={{ top: 8, right: 28, left: 22, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false}/><XAxis type="number"/><YAxis type="category" dataKey="day" width={62} tickFormatter={(day, index) => `${day} ${String(bestTimes[index]?.hour ?? 0).padStart(2, "0")}h`}/><Tooltip formatter={(value: number) => [formatNumber(value), "Média de interações"]} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.day}, ${String(payload[0].payload.hour).padStart(2, "0")}h · ${payload[0].payload.posts} post(s)` : "Horário"}/><Bar dataKey="averageInteractions" name="Média de interações" fill="#4f46e5" radius={[0, 5, 5, 0]}/></BarChart></ResponsiveContainer> : <Empty text="Ainda não há amostra suficiente para calcular horários."/>}</Card><p className="text-xs text-slate-500">Horários com poucos posts podem oscilar bastante; a média descreve apenas as publicações observadas e não garante desempenho futuro.</p></TabsContent>
    </Tabs>
  </div>
}

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Users }) {
  return <Card className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-500">{label}</p><Icon size={16} className="shrink-0 text-slate-400"/></div><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></Card>
}

function ChartHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="mb-3"><h3 className="text-base font-bold text-slate-900">{title}</h3>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}</div>
}

function Empty({ text }: { text: string }) {
  return <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{text}</div>
}

function genderLabel(value: string) {
  return ({ F: "Mulheres", M: "Homens", U: "Não informado" } as Record<string, string>)[value] || value
}

function DemographicBars({ title, data, empty }: { title: string; data: AudienceRow[]; empty: string }) {
  if (!data.length) return <Card className="p-5"><ChartHeading title={title}/><Empty text={empty}/></Card>
  return <Card className="p-5"><ChartHeading title={title} subtitle="Contagem retornada pela Meta."/><ResponsiveContainer width="100%" height={280}><BarChart data={data} layout="vertical" margin={{ top: 5, right: 28, left: 12, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false}/><XAxis type="number" tick={{ fontSize: 11 }}/><YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }}/><Tooltip formatter={(value: number) => [formatNumber(value), "Pessoas"]}/><Bar dataKey="value" name="Pessoas" fill="#4f46e5" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></Card>
}

function TopContent({ title, group, posts, metric, loading, onMetricChange, period }: { title: string; group: TopGroup; posts: AnalyticsPost[]; metric: RankMetric; loading: boolean; onMetricChange: (group: TopGroup, metric: RankMetric) => void; period: string }) {
  const options: Array<{ key: RankMetric; label: string }> = group === "FEED" ? [{ key: "interactions", label: "Por interações" }, { key: "reach", label: "Por alcance" }] : [{ key: "views", label: "Por visualizações" }, { key: "interactions", label: "Por interações" }]
  const metricLabel = metric === "interactions" ? "Interações" : metric === "reach" ? "Alcance" : "Visualizações"
  const caveat = group === "STORY"
    ? "Stories entram no histórico quando a sincronização encontra o conteúdo ainda ativo; dados de Stories anteriores à coleta não podem ser reconstruídos."
    : "O ranking inclui apenas publicações com a métrica escolhida disponível; números são os contadores mais recentes retornados pela Meta."
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xl font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">Publicações dos últimos {period} dias ordenadas por {metricLabel.toLowerCase()}.</p></div><div className="flex gap-2">{options.map((option) => <Button key={option.key} variant={metric === option.key ? "default" : "outline"} size="sm" onClick={() => onMetricChange(group, option.key)} disabled={loading}>{option.label}</Button>)}</div></div>
    <p className="text-xs leading-5 text-slate-500">{caveat}</p>
    {loading ? <Card className="flex min-h-[230px] items-center justify-center p-8 text-sm text-slate-500"><RefreshCw size={16} className="mr-2 animate-spin"/>Atualizando ranking…</Card> : posts.length ? <><ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{posts.slice(0, 20).map((post, index) => {
      const metrics = getMetrics(post)
      const amount = post.score ?? (metric === "interactions" ? metrics.interactions : metric === "reach" ? metrics.reach : metrics.views)
      return <li key={post.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><a href={post.igPermalink || "#"} target={post.igPermalink ? "_blank" : undefined} rel="noreferrer" className="group block"><div className="relative aspect-[4/3] overflow-hidden bg-slate-100">{post.igMediaUrl ? <img src={post.igMediaUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/> : <div className="flex h-full items-center justify-center text-sm text-slate-400">Prévia indisponível</div>}<span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-700">#{index + 1} · {formatType(post.mediaType)}</span></div><div className="p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-500">{metricLabel}</span><span className="text-lg font-bold text-indigo-700">{formatNumber(amount)}</span></div><p className="mt-2 line-clamp-2 min-h-10 break-words text-sm text-slate-700">{post.caption || "Publicação sem legenda"}</p><p className="mt-3 text-xs text-slate-400">Publicado em {formatDate(post.publishedAt)}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500"><span><Heart size={12} className="mr-1 inline"/>{formatNumber(metrics.likes)}</span><span><MessageCircle size={12} className="mr-1 inline"/>{formatNumber(metrics.comments)}</span>{group === "STORY" && <span>Respostas: {formatNumber(metrics.replies)}</span>}<span><Bookmark size={12} className="mr-1 inline"/>{formatNumber(metrics.saves)}</span><span><Share2 size={12} className="mr-1 inline"/>{formatNumber(metrics.shares)}</span></div>{metric === "interactions" && metrics.interactionsPartial && <p className="mt-2 text-[11px] text-amber-700">Soma parcial: alguns contadores não foram fornecidos.</p>}</div></a></li>
    })}</ol><p className="text-xs text-slate-500">Exibindo {posts.length} publicação(ões) com {metricLabel.toLowerCase()} disponível.</p></> : <Card className="p-8"><Empty text={group === "STORY" ? "Nenhum Story com métricas foi coletado neste período. Sincronize a conta enquanto houver Stories ativos; a Meta pode não retornar métricas para todos eles." : `Ainda não há ${group === "REEL" ? "Reels" : "posts e carrosséis"} com ${metricLabel.toLowerCase()} disponível neste período.`}/></Card>}
  </div>
}

function PostTable({ posts, total, page, pages, loading, onPageChange }: { posts: AnalyticsPost[]; total: number; page: number; pages: number; loading: boolean; onPageChange: (page: number) => void }) {
  return <Card className="p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold text-slate-900">Todas as publicações do período</h3><p className="text-sm text-slate-500">Contadores acumulados até a última coleta. “—” indica que a Meta não devolveu a métrica.</p></div><Badge variant="secondary">{formatNumber(total)} posts</Badge></div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-2 py-3 text-left">Publicação</th><th className="px-2 py-3 text-left">Tipo</th><th className="px-2 py-3 text-left">Data</th><th className="px-2 py-3 text-right">Visualizações</th><th className="px-2 py-3 text-right"><Heart size={14} className="inline"/> Curtidas</th><th className="px-2 py-3 text-right"><MessageCircle size={14} className="inline"/> Coment.</th><th className="px-2 py-3 text-right"><Bookmark size={14} className="inline"/> Salvos</th><th className="px-2 py-3 text-right"><Share2 size={14} className="inline"/> Compart.</th><th className="px-2 py-3 text-right">Alcance</th><th className="px-2 py-3 text-right">Engaj.</th></tr></thead><tbody>{posts.map((post) => { const insight = post.insights?.[0] || {}; return <tr key={post.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="px-2 py-3"><a href={post.igPermalink || "#"} target={post.igPermalink ? "_blank" : undefined} rel="noreferrer" className="flex max-w-[240px] items-center gap-3 text-slate-700 hover:text-indigo-600">{post.igMediaUrl ? <img src={post.igMediaUrl} alt="" className="h-10 w-10 rounded object-cover"/> : <div className="h-10 w-10 rounded bg-slate-100"/>}<span className="truncate">{post.caption || "Sem legenda"}</span></a></td><td className="px-2 py-3"><Badge variant={post.mediaType === "REEL" ? "default" : post.mediaType === "CAROUSEL" ? "secondary" : "outline"}>{formatType(post.mediaType)}</Badge></td><td className="px-2 py-3 text-slate-500">{formatDate(post.publishedAt)}</td><td className="px-2 py-3 text-right">{formatNumber(insight.views)}</td><td className="px-2 py-3 text-right">{formatNumber(insight.likes)}</td><td className="px-2 py-3 text-right">{formatNumber(insight.comments)}</td><td className="px-2 py-3 text-right">{formatNumber(insight.saves)}</td><td className="px-2 py-3 text-right">{formatNumber(insight.shares)}</td><td className="px-2 py-3 text-right">{formatNumber(insight.reach)}</td><td className="px-2 py-3 text-right">{formatPercent(insight.engagement)}</td></tr> })}</tbody></table>{!posts.length && <Empty text="Nenhuma publicação importada no período escolhido."/>}</div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Página {page} de {pages}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading}>Anterior</Button><Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pages || loading}>Próxima</Button></div></div></Card>
}
