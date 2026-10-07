"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  AlertCircle, Bookmark, Heart,
  MessageCircle, RefreshCw, Share2, TrendingUp, Users,
} from "lucide-react"
import { MetricCard } from "./MetricCard"
import { ReportChart } from "./ReportChart"
import { ReportAccessNotice } from "./ReportAccessNotice"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { api, fetchApi } from "@/lib/api"
import { instagramCountryLabel, instagramFollowerCards, instagramProfileWindow, type InstagramProfileReport } from "@/lib/instagram-report"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MediaPreview } from "@/components/dashboard/MediaPreview"

type Account = { id: string; igUsername: string; igFollowersCount: number; lastSyncAt?: string | null }
type Dashboard = {
  followers: number; followerGrowth: number | null; hasFollowerHistory?: boolean
  reach: number | null; views: number | null; impressions: number | null
  accountsEngaged?: number | null; profileLinkTaps?: number | null
  interactions: number | null; interactionsPartial?: boolean; engagementRate?: number | null; pendingPosts: number
}
type FollowerSnapshot = { date: string; followers: number | null; followersEstimated?: boolean; followsGained?: number | null; followsLost?: number | null; reach: number | null; views: number | null; accountsEngaged?: number | null; interactions: number | null }
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
  const [profileReport, setProfileReport] = useState<InstagramProfileReport | null>(null)
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
  const controller = useRef<AbortController | null>(null)
  const rankRequests = useRef({ STORY: 0, REEL: 0, FEED: 0 })
  const [syncing, setSyncing] = useState(false)
  const { accounts: activeAccounts, accountId: activeAccountId, isLoading: accountsLoading, setActiveAccount } = useActiveAccount()

  const loadRanking = useCallback(async (id: string, days: number, type: TopGroup, metric: RankMetric) => {
    const version = latestRequest.current
    const rankingId = ++rankRequests.current[type]
    const current = () => version === latestRequest.current && rankingId === rankRequests.current[type]
    setRankingLoading((state) => ({ ...state, [type]: true }))
    try {
      const result = await fetchApi(`/analytics/${encodeURIComponent(id)}/top-posts?days=${days}&mediaType=${type}&sortBy=${metric}`) as { data?: AnalyticsPost[] }
      if (!current()) return
      setRankings((state) => ({ ...state, [type]: result.data || [] }))
      setRankMetrics((state) => ({ ...state, [type]: metric }))
    } catch {
      if (!current()) return
      setRankings((state) => ({ ...state, [type]: [] }))
    } finally { if (current()) setRankingLoading((state) => ({ ...state, [type]: false })) }
  }, [])

  const loadAudience = useCallback(async (id: string, type: "followers" | "engaged") => {
    const version = latestRequest.current
    setLoadingAudience(true)
    try {
      const result = await fetchApi(`/analytics/${encodeURIComponent(id)}/audience?audience=${type}`) as AudiencePayload
      if (version !== latestRequest.current) return
      setAudience(result)
      setAudienceType(type)
    } catch (loadError) {
      if (version !== latestRequest.current) return
      setAudience({ available: false, data: [], message: loadError instanceof Error ? loadError.message : "Não foi possível consultar a audiência." })
    } finally { if (version === latestRequest.current) setLoadingAudience(false) }
  }, [])

  const loadAnalytics = useCallback(async (id: string, days: number, page = 1) => {
    const requestId = ++latestRequest.current
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    const get = (path: string) => fetchApi(`/analytics/${encodeURIComponent(id)}/${path}`, { signal: request.signal })
    setRankingLoading({ STORY: false, REEL: false, FEED: false })
    setRankMetrics({ STORY: "views", REEL: "views", FEED: "interactions" })
    setLoadingAudience(false)
    setLoadingPosts(false)
    setLoading(true)
    setError("")
    setDashboard(null)
    setProfileReport(null)
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
      const [nextDashboard, nextGrowth, nextEngagement, nextPosts, nextAudience, nextBestTimes, nextContentTypes, nextRecommendations, topStories, topReels, topFeed, nextProfileReport] = await Promise.all([
        get(`dashboard?days=${days}`), get(`growth?days=${days}`), get(`engagement?days=${days}`), get(`posts?page=${page}&limit=20&days=${days}`),
        Promise.resolve(emptyAudience),
        optional(get(`best-times?days=${days}`), []),
        optional(get(`content-types?days=${days}`), []),
        optional(get(`recommendations?days=${days}`), []),
        optional(get(`top-posts?days=${days}&mediaType=STORY&sortBy=views`), { data: [] }),
        optional(get(`top-posts?days=${days}&mediaType=REEL&sortBy=views`), { data: [] }),
        optional(get(`top-posts?days=${days}&mediaType=FEED&sortBy=interactions`), { data: [] }),
        optional(get(`profile-report?days=${days}`), null),
      ])
      if (requestId !== latestRequest.current) return
      setDashboard(nextDashboard as Dashboard)
      setProfileReport(nextProfileReport as InstagramProfileReport | null)
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
  }, [])

  useEffect(() => {
    const nextAccounts = (activeAccounts || []) as Account[]
    setAccounts(nextAccounts)
    if (!activeAccountId) {
      if (!accountsLoading) setLoading(false)
      return
    }
    setAccountId(activeAccountId)
    void loadAnalytics(activeAccountId, Number(period), 1)
    return () => { latestRequest.current += 1; controller.current?.abort() }
  // The active-account hook is the single source of truth for the global selector.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, activeAccounts, accountsLoading])

  useEffect(() => {
    if (section === "demografia" && accountId && !loading) void loadAudience(accountId, audienceType)
  // Audience is loaded only when its panel is opened, not before the overview.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, accountId, loading, loadAudience])

  const syncNow = async () => {
    if (!accountId || syncing) return
    const version = latestRequest.current
    setSyncing(true); setError("")
    try {
      await api.syncAccount(accountId)
      const refreshed = await api.getAccounts() as Account[]
      if (version !== latestRequest.current) return
      setAccounts(refreshed)
      await loadAnalytics(accountId, Number(period), 1)
    } catch (error) { if (version === latestRequest.current) setError(error instanceof Error ? error.message : "Não foi possível sincronizar agora.") }
    finally { setSyncing(false) }
  }

  const audienceRows = useMemo(() => getAudienceRows(audience), [audience])
  const genderRows = useMemo(() => rowsFor(audienceRows, "gender"), [audienceRows])
  const ageRows = useMemo(() => rowsFor(audienceRows, "age"), [audienceRows])
  const countryRows = useMemo(() => rowsFor(audienceRows, "country").map(row => ({ ...row, label: instagramCountryLabel(row.label) })), [audienceRows])
  const cityRows = useMemo(() => rowsFor(audienceRows, "city"), [audienceRows])
  const followerChart = useMemo(() => growth.map((item) => ({
    date: item.date, followers: item.followers,
    // Meta's own count of who followed and who left that day.
    novos: item.followsGained ?? null,
    saidas: item.followsLost == null ? null : -item.followsLost,
    saldo: item.followsGained != null && item.followsLost != null ? item.followsGained - item.followsLost : null,
  })), [growth])
  const estimatedFollowerDays = growth.filter((item) => item.followersEstimated).length
  const profileHistory = useMemo(() => growth.map((item) => ({
    date: item.date, alcance: item.reach, visualizacoes: item.views, engajadas: item.accountsEngaged ?? null, interacoes: item.interactions,
  })), [growth])
  const engagementData = useMemo(() => engagement.map((item) => ({
    date: item.date, interacoes: item.interactions, posts: item.posts, likes: item.likes, comments: item.comments, saves: item.saves, shares: item.shares,
  })), [engagement])
  const followerPoints = growth.filter((item): item is FollowerSnapshot & { followers: number } => typeof item.followers === 'number')
  const periodNetGrowth = followerPoints.length > 1 ? followerPoints[followerPoints.length - 1].followers - followerPoints[0].followers : null
  const followerLatestDate = growth.length ? growth[growth.length - 1].date : null
  const currentAccount = accounts.find((account) => account.id === accountId)
  const profileWindow = instagramProfileWindow(profileReport, Number(period))
  const profileMetrics = profileReport?.metrics
  const previousMetrics = profileReport?.previous?.metrics
  const vs = (key: keyof NonNullable<typeof profileMetrics>) => ({ current: profileMetrics?.[key], previous: previousMetrics?.[key] })
  const followerNet = profileReport?.followers.net
  const profileNotice = <div className="space-y-1 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs leading-relaxed text-slate-600">
    <p className="font-semibold text-slate-800">Resumo do perfil · {profileWindow.label.toLowerCase()}{profileReport?.previous && <span className="font-normal text-slate-500"> · comparado aos {profileReport.previous.period.days} dias anteriores (<span className="font-semibold text-emerald-700">▲ subiu</span> / <span className="font-semibold text-rose-700">▼ caiu</span>)</span>}</p>
    {Number(period) > 30 && <p>{profileWindow.notice}</p>}
    {!profileReport?.available && <p role="status" className="font-medium text-amber-800">{profileReport?.message || "Não foi possível consultar os totais do perfil. Os dados das publicações continuam disponíveis; tente atualizar mais tarde."}</p>}
    <details><summary className="cursor-pointer">Sobre esses números</summary><div className="mt-2 space-y-1">
      {Number(period) <= 30 && <p>{profileWindow.notice}</p>}
      {profileReport && <p>Consulta de {new Date(profileReport.collectedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {formatDate(profileReport.period.since)} a {formatDate(profileReport.period.until)} · dia atual pode estar incompleto.</p>}
      <p>“—” significa dado não fornecido. Zero só aparece quando confirmado pela rede.</p>
    </div></details>
  </div>
  const onPeriodChange = (value: string) => { setPeriod(value); setPostsPage(1); if (accountId) void loadAnalytics(accountId, Number(value), 1) }
  const onAccountChange = (value: string) => setActiveAccount(value)

  const onPostsPageChange = async (nextPage: number) => {
    if (nextPage < 1 || nextPage > postsTotalPages || nextPage === postsPage || !accountId) return
    const version = latestRequest.current
    setLoadingPosts(true)
    try {
      const result = await api.getAnalyticsPosts(accountId, nextPage, 20, Number(period)) as { data?: AnalyticsPost[]; total?: number; page?: number; totalPages?: number }
      if (version !== latestRequest.current) return
      setPosts(result.data || [])
      setPostsPage(result.page || nextPage)
      setPostsTotal(result.total || 0)
      setPostsTotalPages(Math.max(1, result.totalPages || 1))
    } catch (loadError) { if (version === latestRequest.current) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar essa página.") }
    finally { if (version === latestRequest.current) setLoadingPosts(false) }
  }

  if ((accountsLoading || loading) && !dashboard) return <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500"><RefreshCw size={18} className="mr-2 animate-spin" />Carregando dados reais da Meta...</div>
  if (!accounts.length) return <Card className="p-10 text-center"><Users className="mx-auto mb-3 text-indigo-600" /><h2 className="font-bold text-slate-900">Nenhuma conta conectada</h2><p className="mt-1 text-sm text-slate-500">Conecte uma conta profissional do Instagram para visualizar publicações e métricas.</p></Card>

  const changeRankMetric = (type: TopGroup, metric: RankMetric) => {
    setRankMetrics((state) => ({ ...state, [type]: metric }))
    if (accountId) void loadRanking(accountId, Number(period), type, metric)
  }

  return <div className="min-w-0 space-y-4 sm:space-y-5 animate-fade-in">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Instagram</p><h2 className="report-title">Desempenho do perfil</h2><p className="mt-1 text-sm text-slate-500">Explore sua audiência e os resultados dos conteúdos.</p></div>
      <div className="grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:w-auto">
        <Select value={accountId} onValueChange={onAccountChange}><SelectTrigger aria-label="Conta do Instagram" className="w-full min-w-0 [&>span]:truncate sm:w-56"><SelectValue placeholder="Conta" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>@{account.igUsername}</SelectItem>)}</SelectContent></Select>
        <Select value={period} onValueChange={onPeriodChange}><SelectTrigger aria-label="Período do Instagram" className="w-full min-w-0 [&>span]:truncate sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger><SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem><SelectItem value="365">Últimos 12 meses</SelectItem><SelectItem value="730">Últimos 24 meses</SelectItem></SelectContent></Select>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={syncNow} disabled={syncing || loading}><RefreshCw size={15} className={`mr-2 ${syncing ? "animate-spin" : ""}`}/>{syncing ? "Sincronizando…" : "Sincronizar dados"}</Button><span className="text-xs text-slate-500">Atualiza publicações e métricas disponíveis.</span></div>
    <ReportAccessNotice accountId={accountId} network="Instagram"/>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs leading-relaxed text-slate-500"><span>Conta <strong className="text-slate-900">@{currentAccount?.igUsername}</strong> · {formatNumber(postsTotal)} publicações no período de {period} dias</span><span>Última sincronização: {currentAccount?.lastSyncAt ? new Date(currentAccount.lastSyncAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "não registrada"}</span></div>

    <Tabs value={section} onValueChange={setSection}>
      <div><TabsList aria-label="Seções do Instagram" className="flex h-auto w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="visao" className="px-2 text-xs sm:text-sm">Visão geral</TabsTrigger><TabsTrigger value="seguidores" className="px-2 text-xs sm:text-sm">Seguidores</TabsTrigger><TabsTrigger value="demografia" className="px-2 text-xs sm:text-sm">Demografia</TabsTrigger><TabsTrigger value="stories" className="px-2 text-xs sm:text-sm">Top 20 Stories</TabsTrigger><TabsTrigger value="reels" className="px-2 text-xs sm:text-sm">Top 20 Reels</TabsTrigger><TabsTrigger value="posts" className="px-2 text-xs sm:text-sm">Top posts</TabsTrigger><TabsTrigger value="horarios" className="px-2 text-xs sm:text-sm">Melhores horários</TabsTrigger>
      </TabsList></div>

      <TabsContent value="visao" className="space-y-5">
        {profileNotice}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <MetricCard label="Seguidores atuais" value={formatNumber(dashboard?.followers)} detail={followerLatestDate ? `Coleta de ${formatDate(followerLatestDate)}` : "Total retornado pela Meta"} compare={{ current: dashboard?.followers, previous: dashboard?.followers != null && followerNet != null ? dashboard.followers - followerNet : null }}/>
          <MetricCard label="Alcance" value={profileMetrics?.reach} detail={`${profileWindow.label} · contas únicas estimadas`} accent compare={vs("reach")}/>
          <MetricCard label="Visualizações" value={profileMetrics?.views} detail={profileWindow.label} accent compare={vs("views")}/>
          <MetricCard label="Interações no perfil" value={profileMetrics?.interactions} detail={`${profileWindow.label} · total informado pelo Instagram`} compare={vs("interactions")}/>
          <MetricCard label="Contas engajadas" value={profileMetrics?.accountsEngaged} detail={`${profileWindow.label} · pessoas que interagiram`} compare={vs("accountsEngaged")}/>
          <MetricCard label="Taxa de engajamento" value={formatPercent(profileReport?.engagementRate)} detail="Contas engajadas ÷ contas alcançadas, na mesma janela" compare={{ current: profileReport?.engagementRate, previous: profileReport?.previous?.engagementRate, format: (value) => formatPercent(value) }}/>
          <MetricCard label="Frequência" value={profileReport?.frequency == null ? null : profileReport.frequency.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} detail="Visualizações ÷ contas alcançadas, na mesma janela" compare={{ current: profileReport?.frequency, previous: profileReport?.previous?.frequency, format: (value) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) }}/>
          <MetricCard label="Toques em links do perfil" value={profileMetrics?.profileLinkTaps} detail={profileWindow.label} compare={vs("profileLinkTaps")}/>
          {([
            ["likes", "Curtidas"], ["comments", "Comentários"], ["shares", "Compartilhamentos"],
            ["saves", "Salvos"], ["replies", "Respostas"], ["reposts", "Republicações"],
          ] as const).map(([key, label]) => <MetricCard key={key} label={label} value={profileMetrics?.[key]} detail={profileWindow.label} compare={vs(key)}/>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Interações nos posts selecionados" value={dashboard?.interactions} detail={`Posts publicados nos últimos ${period} dias · contadores acumulados até a coleta${dashboard?.interactionsPartial ? " · soma parcial" : ""}`}/><MetricCard label="Taxa média por publicação" value={formatPercent(dashboard?.engagementRate)} detail="Média das taxas disponíveis dos posts selecionados. Não é a taxa do perfil acima."/></div>
        <ReportChart key={`reach-${accountId}-${period}`} title="Alcance diário" description={`${profileWindow.label} · contas únicas estimadas por dia, consultadas no Instagram. Semanal e mensal mostram o último dia disponível; o total único do período está no card de alcance.`} rows={(profileReport?.dailyReach || []).map(point => ({ date: point.date, reach: point.value }))} series={[{ key: "reach", label: "Contas alcançadas por dia", color: "#4f46e5", aggregation: "last" }]} filename="instagram-alcance-diario"/>
        <div className="grid gap-5 xl:grid-cols-2">
          <ReportChart key={`profile-${accountId}-${period}`} title="Perfil dia a dia" description="Valores de cada dia informados pelo Instagram (a Meta disponibiliza os últimos 30 dias; o InstaCommand guarda cada dia a partir daí). Semanal e mensal mostram o último dia disponível." rows={profileHistory} series={[{ key: "alcance", label: "Alcance", color: "#4f46e5", aggregation: "last" }, { key: "visualizacoes", label: "Visualizações", color: "#0284c7", aggregation: "last" }, { key: "engajadas", label: "Contas engajadas", color: "#0d9488", aggregation: "last" }, { key: "interacoes", label: "Interações", color: "#d97706", aggregation: "last" }]} defaultKeys={["alcance", "visualizacoes"]} filename="instagram-perfil-diario"/>
          <ReportChart key={`interactions-${accountId}-${period}`} title="Interações por data de publicação" description="Contadores dos posts publicados em cada data, acumulados até a coleta. A soma pode ser parcial." rows={engagementData} series={[{ key: "interacoes", label: "Interações", color: "#4f46e5" }, { key: "likes", label: "Curtidas", color: "#e11d48" }, { key: "comments", label: "Comentários", color: "#0284c7" }, { key: "saves", label: "Salvos", color: "#d97706" }, { key: "shares", label: "Compartilhamentos", color: "#0d9488" }]} defaultKeys={["interacoes"]} kind="bar" filename="instagram-interacoes"/>
        </div>
        <Card className="p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-2"><ChartHeading title="Formatos publicados" subtitle="Totais acumulados por formato; o alcance pode incluir as mesmas pessoas em posts diferentes."/><Badge variant="secondary">{formatNumber(contentTypes.reduce((sum, item) => sum + item.posts, 0))} posts</Badge></div>{contentTypes.length ? <ResponsiveContainer width="100%" height={290}><BarChart accessibilityLayer data={contentTypes} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/><XAxis dataKey="type" tickFormatter={formatType}/><YAxis/><Tooltip labelFormatter={value => formatType(String(value))} formatter={(value: number, name: string) => [formatNumber(value), name]}/><Legend/><Bar dataKey="interactions" name="Interações" isAnimationActive={false} fill="#4f46e5" radius={[5, 5, 0, 0]}/><Bar dataKey="views" name="Visualizações" isAnimationActive={false} fill="#0ea5e9" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer> : <Empty text="Sem dados suficientes para comparar os formatos." />}</Card>
        <Card className="p-5"><ChartHeading title="Recomendações do histórico" />{recommendations.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{recommendations.map((item, index) => <div key={`${item.type}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Badge variant="default">{{ DATA: "Dados disponíveis", FORMAT: "Formato", TIMING: "Horário" }[item.type] || "Observação"}</Badge><p className="mt-2 text-sm text-slate-700">{item.message}</p><p className="mt-2 text-xs text-slate-400">Baseado em {item.basedOn || postsTotal} publicação(ões)</p></div>)}</div> : <Empty text="Ainda não há histórico suficiente para recomendações." />}</Card>
      </TabsContent>

      <TabsContent value="seguidores" className="space-y-5">
        {profileNotice}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">{instagramFollowerCards(profileReport).map(card => <MetricCard key={card.label} {...card} detail={`${profileWindow.label} · informado pelo Instagram`} accent/>)}</div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3"><Stat label="Seguidores no início" value={formatNumber(followerPoints[0]?.followers)} detail={followerPoints[0] ? `${formatDate(followerPoints[0].date)}${followerPoints[0].followersEstimated ? " · estimado" : ""}` : "Sem dado no início"} icon={Users}/><Stat label="Seguidores atuais" value={formatNumber(followerPoints.at(-1)?.followers ?? dashboard?.followers)} detail={followerPoints.at(-1) ? formatDate(followerPoints.at(-1)!.date) : "Total mais recente"} icon={Users}/><Stat label="Variação líquida" value={periodNetGrowth == null ? "—" : `${periodNetGrowth > 0 ? "+" : ""}${formatNumber(periodNetGrowth)}`} detail="Entre o primeiro e o último dia com total disponível" icon={TrendingUp}/></div>
        <ReportChart key={`followers-${accountId}-${period}`} title="Evolução de seguidores" description={`Total ao fim de cada dia, semana ou mês.${estimatedFollowerDays ? ` ${estimatedFollowerDays} dia(s) anteriores às coletas do InstaCommand foram calculados a partir dos ganhos e perdas diários informados pela Meta (disponíveis para os últimos 30 dias e contas com 100+ seguidores).` : ""} Datas sem dado permanecem sem valor.`} rows={followerChart} series={[{ key: "followers", label: "Seguidores", color: "#4f46e5", aggregation: "last" }]} filename="instagram-seguidores" fitToData/>
        <ReportChart key={`growth-${accountId}-${period}`} title="Ganhos e perdas por dia" description="Contas que passaram a seguir e que deixaram de seguir em cada dia, segundo a Meta (não disponível para contas com menos de 100 seguidores)." rows={followerChart} series={[{ key: "novos", label: "Novos seguidores", color: "#0d9488" }, { key: "saidas", label: "Deixaram de seguir", color: "#e11d48" }, { key: "saldo", label: "Saldo do dia", color: "#4f46e5" }]} defaultKeys={["novos", "saidas"]} kind="bar" filename="instagram-ganhos-e-perdas"/>
      </TabsContent>

      <TabsContent value="demografia" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">Quem acompanha seu perfil</h3><p className="text-sm text-slate-500">Dados demográficos de seguidores ou de pessoas que interagiram, conforme a disponibilidade da Meta.</p></div><div className="flex gap-2"><Button variant={audienceType === "followers" ? "default" : "outline"} onClick={() => accountId && void loadAudience(accountId, "followers")} disabled={loadingAudience}>Seguidores</Button><Button variant={audienceType === "engaged" ? "default" : "outline"} onClick={() => accountId && void loadAudience(accountId, "engaged")} disabled={loadingAudience}>Público engajado</Button></div></div>
        {loadingAudience && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin"/>Consultando este público…</p>}
        {!loadingAudience && !audience.available && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle size={18} className="mt-0.5 shrink-0"/><div><strong>Demografia não disponível</strong><p className="mt-1">{audience.message || "A Meta não retornou esses dados para esta conta. Isso pode depender da permissão do app ou da elegibilidade do público."}</p></div></div>}
        {!loadingAudience && audience.available && <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5"><ChartHeading title="Por gênero" subtitle="Distribuição do público retornado pela Meta."/>{genderRows.length ? <><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={genderRows.map(row => ({ ...row, name: genderLabel(row.label), label: genderLabel(row.label) }))} dataKey="value" nameKey="label" innerRadius={65} outerRadius={95} paddingAngle={3} isAnimationActive={false}>{genderRows.map((row, index) => <Cell key={`${row.label}-${index}`} fill={colors[index % colors.length]}/>)}</Pie><Tooltip formatter={(value: number) => [formatNumber(value), "Pessoas"]}/></PieChart></ResponsiveContainer><div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-600">{genderRows.map((row, index) => <span key={row.label} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }}/>{genderLabel(row.label)} · {formatNumber(row.value)} ({formatPercent(100 * row.value / Math.max(1, genderRows.reduce((sum, item) => sum + item.value, 0)))})</span>)}</div></> : <Empty text="A Meta não retornou a divisão por gênero."/>}</Card>
          <DemographicBars title="Por faixa etária" data={ageRows} empty="A Meta não retornou faixas etárias." />
          <DemographicBars title="Por país" data={countryRows} empty="A Meta não retornou países." />
          <DemographicBars title="Por cidade" data={cityRows} empty="A Meta não retornou cidades." />
        </div>}
        {!loadingAudience && audience.available && <p className="text-xs leading-relaxed text-slate-500">Janela demográfica: últimos 30 dias. Percentuais por gênero usam apenas as pessoas retornadas nessa divisão, não o total de seguidores. País e cidade mostram os 8 principais resultados disponíveis; a cobertura pode variar por dimensão.</p>}
      </TabsContent>

      <TabsContent value="stories"><TopContent title="Top 20 Stories" group="STORY" posts={rankings.STORY} metric={rankMetrics.STORY} loading={rankingLoading.STORY} onMetricChange={changeRankMetric} period={period} /></TabsContent>
      <TabsContent value="reels"><TopContent title="Top 20 Reels" group="REEL" posts={rankings.REEL} metric={rankMetrics.REEL} loading={rankingLoading.REEL} onMetricChange={changeRankMetric} period={period} /></TabsContent>
      <TabsContent value="posts" className="space-y-5"><TopContent title="Top 20 posts e carrosséis" group="FEED" posts={rankings.FEED} metric={rankMetrics.FEED} loading={rankingLoading.FEED} onMetricChange={changeRankMetric} period={period} /><PostTable posts={posts} total={postsTotal} page={postsPage} pages={postsTotalPages} loading={loadingPosts} onPageChange={onPostsPageChange}/></TabsContent>
      <TabsContent value="horarios" className="space-y-5"><Card className="p-5"><ChartHeading title="Melhores horários observados" subtitle="Média de interações dos posts por dia e hora de publicação (horário de São Paulo)."/>{bestTimes.length ? <ResponsiveContainer width="100%" height={350}><BarChart data={bestTimes} layout="vertical" margin={{ top: 8, right: 28, left: 22, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false}/><XAxis type="number"/><YAxis type="category" dataKey="day" width={62} tickFormatter={(day, index) => `${day} ${String(bestTimes[index]?.hour ?? 0).padStart(2, "0")}h`}/><Tooltip formatter={(value: number) => [formatNumber(value), "Média de interações"]} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.day}, ${String(payload[0].payload.hour).padStart(2, "0")}h · ${payload[0].payload.posts} post(s)` : "Horário"}/><Bar dataKey="averageInteractions" name="Média de interações" fill="#4f46e5" radius={[0, 5, 5, 0]}/></BarChart></ResponsiveContainer> : <Empty text="Ainda não há amostra suficiente para calcular horários."/>}</Card><p className="text-xs text-slate-500">Horários com poucos posts podem oscilar bastante; a média descreve apenas as publicações observadas e não garante desempenho futuro.</p></TabsContent>
    </Tabs>
  </div>
}

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Users }) {
  return <MetricCard label={label} value={value} detail={detail}/>
}

function ChartHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="mb-3"><h3 className="section-title">{title}</h3>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}</div>
}

function Empty({ text }: { text: string }) {
  return <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{text}</div>
}

function genderLabel(value: string) {
  return ({ F: "Mulheres", M: "Homens", U: "Não informado" } as Record<string, string>)[value] || value
}

function DemographicBars({ title, data, empty }: { title: string; data: AudienceRow[]; empty: string }) {
  if (!data.length) return <Card className="p-5"><ChartHeading title={title}/><Empty text={empty}/></Card>
  return <Card className="p-5"><ChartHeading title={title} subtitle="Contagem retornada pela Meta."/><ResponsiveContainer width="100%" height={280}><BarChart accessibilityLayer data={data} layout="vertical" margin={{ top: 5, right: 28, left: 12, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false}/><XAxis type="number" tick={{ fontSize: 11 }}/><YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }}/><Tooltip formatter={(value: number) => [formatNumber(value), "Pessoas"]}/><Bar dataKey="value" name="Pessoas" fill="#4f46e5" radius={[0, 5, 5, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer><details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Ver valores</summary><dl className="mt-2 space-y-2">{data.map(row => <div key={row.label} className="flex justify-between gap-3"><dt className="break-words">{row.label}</dt><dd className="shrink-0 font-semibold tabular-nums">{formatNumber(row.value)}</dd></div>)}</dl></details></Card>
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
      return <li key={post.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><a href={post.igPermalink || "#"} target={post.igPermalink ? "_blank" : undefined} rel="noreferrer" className="group block"><div className="relative aspect-[4/3] overflow-hidden bg-slate-100"><MediaPreview src={post.igMediaUrl} isVideo={post.mediaType === "REEL"} className="transition duration-300 group-hover:scale-[1.02]"/><span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-700">#{index + 1} · {formatType(post.mediaType)}</span></div><div className="p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-500">{metricLabel}</span><span className="text-lg font-bold text-indigo-700">{formatNumber(amount)}</span></div><p className="mt-2 line-clamp-2 min-h-10 break-words text-sm text-slate-700">{post.caption || "Publicação sem legenda"}</p><p className="mt-3 text-xs text-slate-400">Publicado em {formatDate(post.publishedAt)}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500"><span><Heart size={12} className="mr-1 inline"/>{formatNumber(metrics.likes)}</span><span><MessageCircle size={12} className="mr-1 inline"/>{formatNumber(metrics.comments)}</span>{group === "STORY" && <span>Respostas: {formatNumber(metrics.replies)}</span>}<span><Bookmark size={12} className="mr-1 inline"/>{formatNumber(metrics.saves)}</span><span><Share2 size={12} className="mr-1 inline"/>{formatNumber(metrics.shares)}</span></div>{metric === "interactions" && metrics.interactionsPartial && <p className="mt-2 text-[11px] text-amber-700">Soma parcial: alguns contadores não foram fornecidos.</p>}</div></a></li>
    })}</ol><p className="text-xs text-slate-500">Exibindo {posts.length} publicação(ões) com {metricLabel.toLowerCase()} disponível.</p></> : <Card className="p-8"><Empty text={group === "STORY" ? "Nenhum Story com métricas foi coletado neste período. Sincronize a conta enquanto houver Stories ativos; a Meta pode não retornar métricas para todos eles." : `Ainda não há ${group === "REEL" ? "Reels" : "posts e carrosséis"} com ${metricLabel.toLowerCase()} disponível neste período.`}/></Card>}
  </div>
}

function PostTable({ posts, total, page, pages, loading, onPageChange }: { posts: AnalyticsPost[]; total: number; page: number; pages: number; loading: boolean; onPageChange: (page: number) => void }) {
  const columns: Array<{ key: keyof PostMetrics; label: string }> = [
    { key: "views", label: "Visualizações" }, { key: "likes", label: "Curtidas" }, { key: "comments", label: "Comentários" },
    { key: "saves", label: "Salvos" }, { key: "shares", label: "Compartilhamentos" }, { key: "reach", label: "Alcance" },
  ]
  const publication = (post: AnalyticsPost) => <div className="flex min-w-0 items-start gap-3">{post.igMediaUrl && <div className="h-10 w-10 shrink-0 overflow-hidden rounded"><MediaPreview src={post.igMediaUrl} isVideo={post.mediaType === "REEL"} fallback=""/></div>}<div className="min-w-0"><p className="line-clamp-3 break-words text-sm font-medium">{post.caption || "Sem legenda"}</p><p className="mt-1 text-xs text-slate-500">{formatType(post.mediaType)} · {formatDate(post.publishedAt)}</p>{post.igPermalink && <a href={post.igPermalink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-indigo-600 underline">Abrir no Instagram</a>}</div></div>
  return <Card className="min-w-0 p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold text-slate-900">Todas as publicações do período</h3><p className="mt-1 text-xs text-slate-500">Contadores acumulados até a última coleta. “—” indica dado não fornecido.</p></div><Badge variant="secondary">{formatNumber(total)} posts</Badge></div>
    <div className="space-y-3 lg:hidden">{posts.map(post => { const metrics = getMetrics(post); return <article key={post.id} className="rounded-xl border border-slate-200 p-3">{publication(post)}<dl className="mt-3 grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">{columns.map(column => <div key={column.key} className="rounded-lg bg-slate-50 p-2"><dt className="break-words text-[11px] text-slate-500">{column.label}</dt><dd className="mt-1 text-sm font-bold tabular-nums">{formatNumber(metrics[column.key] as number | null)}</dd></div>)}</dl><p className="mt-2 text-xs text-slate-500">Taxa de engajamento: {formatPercent(metrics.engagement)}</p></article> })}</div>
    <div className="hidden overflow-x-auto lg:block" tabIndex={0} aria-label="Tabela de publicações do Instagram"><table className="w-full min-w-[900px] text-sm"><caption className="sr-only">Publicações e métricas acumuladas</caption><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="p-3 text-left">Publicação</th>{columns.map(column => <th key={column.key} className="p-3 text-right">{column.label}</th>)}<th className="p-3 text-right">Engajamento</th></tr></thead><tbody>{posts.map(post => { const metrics = getMetrics(post); return <tr key={post.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="w-72 min-w-60 p-3">{publication(post)}</td>{columns.map(column => <td key={column.key} className="p-3 text-right tabular-nums">{formatNumber(metrics[column.key] as number | null)}</td>)}<td className="p-3 text-right">{formatPercent(metrics.engagement)}</td></tr> })}</tbody></table></div>
    {!posts.length && <Empty text="Nenhuma publicação importada no período escolhido."/>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs text-slate-500" role="status">Página {page} de {pages}{loading ? " · Carregando…" : ""}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading}>Anterior</Button><Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pages || loading}>Próxima</Button></div></div>
  </Card>
}
