"use client"

import { PageHeader } from "@/components/layout/PageHeader"
import Link from "next/link"
import { useState } from "react"
import { reportFormat } from "@/lib/report-chart"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, Calendar, Clock, Heart, MessageCircle, Bookmark, Sparkles, RefreshCw, Type } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatsCards } from "@/components/dashboard/StatsCards"
import { GrowthChart } from "@/components/dashboard/GrowthChart"
import { EngagementChart } from "@/components/dashboard/EngagementChart"
import { api, fetchApi } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { MediaPreview } from "@/components/dashboard/MediaPreview"
import { PlatformIcons } from "@/components/ui/platform-icons"
import { tr, useLang, useT } from "@/lib/i18n"

type DashboardStats = { followers: number | null; followerGrowth: number | null; hasFollowerHistory: boolean; reach: number | null; impressions: number | null; interactions: number | null; pendingPosts: number; engagementRate: number | null }
type PublishedPost = { id: string; mediaType: string; caption?: string | null; igMediaUrl?: string | null; igPermalink?: string | null; publishedAt: string; metrics?: { likes?: number | null; comments?: number | null; saves?: number | null }; insights?: Array<{ likes: number | null; comments: number | null; saves: number | null; engagement: number | null }> }
type ScheduledPost = { id: string; mediaType: string; caption?: string | null; scheduledFor: string; status: string; mediaUrls?: string[]; thumbnailUrl?: string | null; platforms?: string[] }

const formatType = (type: string) => tr(type === "CAROUSEL" ? "Carrossel" : type === "REEL" ? "Reel" : type === "STORY" ? "Story" : type === "TEXT" ? "Texto" : "Feed")
const firstLine = (caption?: string | null) => caption?.split("\n")[0] || tr("Publicação sem legenda")

export default function DashboardPage() {
  const t = useT()
  const { activeAccount, accountId, isLoading: accountsLoading } = useActiveAccount()
  const dashboardQuery = useQuery({ queryKey: ["dashboard", accountId], queryFn: () => api.getDashboard(accountId), enabled: !!accountId })
  const growthQuery = useQuery({ queryKey: ["dashboard-growth", accountId], queryFn: () => api.getGrowth(accountId, 30), enabled: !!accountId })
  const engagementQuery = useQuery({ queryKey: ["dashboard-engagement", accountId], queryFn: () => api.getEngagement(accountId, 30), enabled: !!accountId })
  const postsQuery = useQuery({ queryKey: ["dashboard-posts", accountId], queryFn: ({ signal }) => fetchApi(`/analytics/${encodeURIComponent(accountId)}/top-posts?days=30&sortBy=interactions`, { signal }), enabled: !!accountId })
  const scheduledQuery = useQuery({ queryKey: ["dashboard-scheduled", accountId], queryFn: () => api.getPosts(`accountId=${encodeURIComponent(accountId)}&status=SCHEDULED`), enabled: !!accountId })
  const bestTimesQuery = useQuery({ queryKey: ["dashboard-best-time", accountId], queryFn: () => api.getBestTimes(accountId), enabled: !!accountId })

  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  const refreshAll = async () => {
    if (!accountId || refreshing) return
    setRefreshing(true); setRefreshError("")
    try {
      await api.syncAccount(accountId)
      await Promise.all([dashboardQuery, growthQuery, engagementQuery, postsQuery, scheduledQuery, bestTimesQuery].map(query => query.refetch()))
    } catch (error) { setRefreshError(error instanceof Error ? error.message : t("Não foi possível sincronizar agora.")) }
    finally { setRefreshing(false) }
  }
  const stats = dashboardQuery.data as DashboardStats | undefined
  const growth = (growthQuery.data || []) as Array<{ date: string; followers: number }>
  const engagement = (engagementQuery.data || []) as Array<{ date: string; engagement: number; interactions: number }>
  const postPayload = postsQuery.data as { data?: PublishedPost[] } | undefined
  const topPosts = postPayload?.data || []
  const upcomingPosts = ((scheduledQuery.data || []) as ScheduledPost[]).slice(0, 4)
  const bestTime = (bestTimesQuery.data as Array<{ day: string; hour: number }> | undefined)?.[0]

  if (accountsLoading) return <Card className="p-6" role="status">{t("Carregando suas contas…")}</Card>
  if (!accountsLoading && !activeAccount) return <Card className="mx-auto max-w-xl p-10 text-center"><Sparkles className="mx-auto mb-3 text-indigo-600" size={28}/><h2 className="text-xl font-bold text-slate-900">{t("Conecte sua primeira conta")}</h2><p className="mt-2 text-sm text-slate-500">{t("O dashboard deixa de usar demonstrações e passa a mostrar somente dados reais depois da conexão com a Meta.")}</p><Button asChild className="mt-5 bg-indigo-600 text-white"><Link href="/accounts">{t("Conectar conta")}</Link></Button></Card>

  return <div className="flex flex-col gap-6 animate-fade-in">
    <PageHeader eyebrow={t("Visão geral")} title={t("Dashboard")} description={t("Os números principais da conta e o que vem a seguir.")} />
    <div className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs"><Sparkles size={20}/></div><div><h2 className="text-sm font-bold text-slate-900">{t("Visão real de @{username}", { username: activeAccount?.igUsername })}</h2><p className="text-xs text-slate-600">{bestTime ? t("Melhor horário encontrado: {day} às {hour}h.", { day: t(bestTime.day), hour: String(bestTime.hour).padStart(2, "0") }) : t("Sincronize a conta para encontrar os melhores horários.")}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing || dashboardQuery.isFetching} className="gap-2"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""}/>{refreshing ? t("Sincronizando…") : t("Atualizar tudo")}</Button><Button asChild size="sm" className="bg-indigo-600 text-white"><Link href="/composer">{t("Criar publicação")}</Link></Button></div></div>
    {refreshError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{refreshError}</p>}
    <StatsCards stats={stats} loading={dashboardQuery.isLoading} error={dashboardQuery.isError} onRetry={() => dashboardQuery.refetch()}/>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><GrowthChart data={growth} loading={growthQuery.isLoading} error={growthQuery.isError} onRetry={() => growthQuery.refetch()}/><EngagementChart data={engagement} loading={engagementQuery.isLoading} error={engagementQuery.isError} onRetry={() => engagementQuery.refetch()}/></div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="col-span-1 flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-2"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="section-title">{t("Publicações com melhor desempenho")}</h3><p className="text-xs font-medium text-slate-500">{t("Ranking pelas interações disponíveis · últimos 30 dias")}</p></div><Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">{t("Ver analytics")} <ArrowUpRight size={14}/></Link></div>{postsQuery.isLoading ? <p role="status" className="py-8 text-center text-sm text-slate-500">{t("Carregando publicações…")}</p> : postsQuery.isError ? <p role="alert" className="py-8 text-sm text-rose-700">{t("Não foi possível carregar o ranking.")} <button onClick={() => postsQuery.refetch()} className="underline">{t("Tentar novamente")}</button></p> : topPosts.length ? <div className="grid grid-cols-2 content-start items-start gap-3 sm:grid-cols-3">{topPosts.slice(0, 3).map((post) => { const insight = post.metrics || post.insights?.[0]; return <a key={post.id} href={post.igPermalink || "#"} target={post.igPermalink ? "_blank" : undefined} rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:shadow-md"><div className="relative aspect-square overflow-hidden bg-slate-100"><MediaPreview src={post.igMediaUrl} isVideo={post.mediaType === "REEL"} fallback={t("Sem prévia")} className="transition duration-500 group-hover:scale-105"/><span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-800">{formatType(post.mediaType)}</span></div><div className="flex items-center justify-between bg-white p-3 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><Heart size={13} className="text-rose-500"/>{reportFormat(insight?.likes)}</span><span className="inline-flex items-center gap-1"><MessageCircle size={13} className="text-indigo-500"/>{reportFormat(insight?.comments)}</span><span className="inline-flex items-center gap-1"><Bookmark size={13} className="text-amber-500"/>{reportFormat(insight?.saves)}</span></div></a>})}</div> : <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{t("Não há publicações com contadores disponíveis nos últimos 30 dias. Sincronize a conta ou amplie o período nos relatórios.")}</div>}</Card>
      <Card className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs"><div className="mb-5 flex items-center justify-between"><div><h3 className="section-title">{t("Fila de agendamento")}</h3><p className="text-xs font-medium text-slate-500">{t("Somente posts reais da conta")}</p></div><Link href="/calendar" aria-label={t("Abrir calendário")} className="text-indigo-600"><Calendar size={16}/></Link></div>{scheduledQuery.isLoading ? <p role="status" className="py-8 text-center text-sm text-slate-500">{t("Carregando agendamentos…")}</p> : scheduledQuery.isError ? <p role="alert" className="py-8 text-sm text-rose-700">{t("Não foi possível carregar os agendamentos.")} <button onClick={() => scheduledQuery.refetch()} className="underline">{t("Tentar novamente")}</button></p> : upcomingPosts.length ? <div className="space-y-2.5">{upcomingPosts.map((post) => <ScheduledItem key={post.id} post={post}/>)}</div> : <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">{t("Nenhum post agendado.")}<Link href="/composer" className="ml-1 font-semibold text-indigo-600">{t("Agendar agora")}</Link></div>}</Card>
    </div>
  </div>
}

/** One queued post: thumbnail, format and caption on one line, then date and networks. */
function ScheduledItem({ post }: { post: ScheduledPost }) {
  const { locale } = useLang()
  const cover = post.thumbnailUrl || post.mediaUrls?.[0]
  return <Link href="/calendar" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 transition hover:border-indigo-200 hover:bg-indigo-50/40">
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {post.mediaType === "TEXT" ? <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400"><Type size={18} aria-hidden/></div> : <MediaPreview src={cover} isVideo={post.mediaType === "REEL"} fallback="" />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="flex min-w-0 items-center gap-1.5 text-xs"><span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-700">{formatType(post.mediaType)}</span><span className="truncate font-semibold text-slate-900">{firstLine(post.caption)}</span></p>
      <p className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-500"><span className="inline-flex items-center gap-1 text-indigo-600"><Clock size={12}/>{new Date(post.scheduledFor).toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><PlatformIcons platforms={post.platforms} size={12}/></p>
    </div>
  </Link>
}
