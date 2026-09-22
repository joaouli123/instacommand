"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, Calendar, Clock, Heart, MessageCircle, Bookmark, Sparkles, RefreshCw } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatsCards } from "@/components/dashboard/StatsCards"
import { GrowthChart } from "@/components/dashboard/GrowthChart"
import { EngagementChart } from "@/components/dashboard/EngagementChart"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"

type DashboardStats = { followers: number | null; followerGrowth: number | null; hasFollowerHistory: boolean; reach: number | null; impressions: number | null; interactions: number | null; pendingPosts: number; engagementRate: number | null }
type PublishedPost = { id: string; mediaType: string; caption?: string | null; igMediaUrl?: string | null; igPermalink?: string | null; publishedAt: string; insights?: Array<{ likes: number; comments: number; saves: number; engagement: number }> }
type ScheduledPost = { id: string; mediaType: string; caption?: string | null; scheduledFor: string; status: string }

const formatType = (type: string) => type === "CAROUSEL" ? "Carrossel" : type === "REEL" ? "Reel" : type === "STORY" ? "Story" : "Feed"
const firstLine = (caption?: string | null) => caption?.split("\n")[0] || "Publicação sem legenda"

export default function DashboardPage() {
  const { activeAccount, accountId, isLoading: accountsLoading } = useActiveAccount()
  const dashboardQuery = useQuery({ queryKey: ["dashboard", accountId], queryFn: () => api.getDashboard(accountId), enabled: !!accountId })
  const growthQuery = useQuery({ queryKey: ["dashboard-growth", accountId], queryFn: () => api.getGrowth(accountId, 30), enabled: !!accountId })
  const engagementQuery = useQuery({ queryKey: ["dashboard-engagement", accountId], queryFn: () => api.getEngagement(accountId, 30), enabled: !!accountId })
  const postsQuery = useQuery({ queryKey: ["dashboard-posts", accountId], queryFn: () => api.getAnalyticsPosts(accountId, 1, 6), enabled: !!accountId })
  const scheduledQuery = useQuery({ queryKey: ["dashboard-scheduled", accountId], queryFn: () => api.getPosts(`accountId=${encodeURIComponent(accountId)}&status=SCHEDULED`), enabled: !!accountId })
  const bestTimesQuery = useQuery({ queryKey: ["dashboard-best-time", accountId], queryFn: () => api.getBestTimes(accountId), enabled: !!accountId })

  const stats = dashboardQuery.data as DashboardStats | undefined
  const growth = (growthQuery.data || []) as Array<{ date: string; followers: number }>
  const engagement = (engagementQuery.data || []) as Array<{ date: string; engagement: number; interactions: number }>
  const postPayload = postsQuery.data as { data?: PublishedPost[] } | undefined
  const topPosts = postPayload?.data || []
  const upcomingPosts = ((scheduledQuery.data || []) as ScheduledPost[]).slice(0, 4)
  const bestTime = (bestTimesQuery.data as Array<{ day: string; hour: number }> | undefined)?.[0]

  if (!accountsLoading && !activeAccount) return <Card className="mx-auto max-w-xl p-10 text-center"><Sparkles className="mx-auto mb-3 text-indigo-600" size={28}/><h2 className="text-xl font-bold text-slate-900">Conecte sua primeira conta</h2><p className="mt-2 text-sm text-slate-500">O dashboard deixa de usar demonstrações e passa a mostrar somente dados reais depois da conexão com a Meta.</p><Link href="/accounts"><Button className="mt-5 bg-indigo-600 text-white">Conectar conta</Button></Link></Card>

  return <div className="flex flex-col gap-6 animate-fade-in">
    <div className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs"><Sparkles size={20}/></div><div><h2 className="text-sm font-bold text-slate-900">Visão real de @{activeAccount?.igUsername}</h2><p className="text-xs text-slate-600">{bestTime ? `Melhor horário encontrado: ${bestTime.day} às ${String(bestTime.hour).padStart(2, "0")}h.` : "Sincronize a conta para encontrar os melhores horários."}</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching} className="gap-2"><RefreshCw size={14} className={dashboardQuery.isFetching ? "animate-spin" : ""}/>Atualizar</Button><Link href="/composer"><Button size="sm" className="bg-indigo-600 text-white">Criar publicação</Button></Link></div></div>
    <StatsCards stats={stats} loading={dashboardQuery.isLoading} error={dashboardQuery.isError} onRetry={() => dashboardQuery.refetch()}/>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><GrowthChart data={growth} loading={growthQuery.isLoading} error={growthQuery.isError} onRetry={() => growthQuery.refetch()}/><EngagementChart data={engagement} loading={engagementQuery.isLoading} error={engagementQuery.isError} onRetry={() => engagementQuery.refetch()}/></div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="col-span-1 flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-2"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-900">Publicações com melhor desempenho</h3><p className="text-xs font-medium text-slate-500">Dados importados da conta selecionada</p></div><Link href="/analytics" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">Ver analytics <ArrowUpRight size={14}/></Link></div>{topPosts.length ? <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">{topPosts.slice(0, 3).map((post) => { const insight = post.insights?.[0]; return <a key={post.id} href={post.igPermalink || "#"} target={post.igPermalink ? "_blank" : undefined} rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:shadow-md"><div className="relative aspect-square overflow-hidden bg-slate-100">{post.igMediaUrl ? <img src={post.igMediaUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/> : <div className="flex h-full items-center justify-center text-xs text-slate-400">Sem imagem</div>}<span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-800">{formatType(post.mediaType)}</span></div><div className="flex items-center justify-between bg-white p-3 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><Heart size={13} className="text-rose-500"/>{(insight?.likes || 0).toLocaleString("pt-BR")}</span><span className="inline-flex items-center gap-1"><MessageCircle size={13} className="text-indigo-500"/>{(insight?.comments || 0).toLocaleString("pt-BR")}</span><span className="inline-flex items-center gap-1"><Bookmark size={13} className="text-amber-500"/>{(insight?.saves || 0).toLocaleString("pt-BR")}</span></div></a>})}</div> : <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">Nenhuma publicação importada ainda. Abra Contas e clique em Sincronizar.</div>}</Card>
      <Card className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-900">Fila de agendamento</h3><p className="text-xs font-medium text-slate-500">Somente posts reais da conta</p></div><Link href="/calendar" className="text-indigo-600"><Calendar size={16}/></Link></div>{upcomingPosts.length ? <div className="space-y-3">{upcomingPosts.map((post) => <div key={post.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"><div className="flex items-center justify-between"><span className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">{formatType(post.mediaType)}</span><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600"><Clock size={12}/>{new Date(post.scheduledFor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div><p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-900">{firstLine(post.caption)}</p></div>)}</div> : <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">Nenhum post agendado.<Link href="/composer" className="ml-1 font-semibold text-indigo-600">Agendar agora</Link></div>}</Card>
    </div>
  </div>
}
