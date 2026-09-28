"use client"

import { Card } from "@/components/ui/card"
import { Users, Eye, Calendar, TrendingUp, Minus, Activity, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type DashboardStats = {
  followers: number | null
  followerGrowth: number | null
  hasFollowerHistory: boolean
  reach: number | null
  impressions: number | null
  interactions: number | null
  interactionsPartial?: boolean
  pendingPosts: number
  engagementRate: number | null
}

const formatMetric = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("pt-BR")

export function StatsCards({ stats, loading, error, onRetry }: { stats?: DashboardStats; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  const cards = [
    { title: "Seguidores", value: formatMetric(stats?.followers), trend: stats?.hasFollowerHistory && stats.followerGrowth != null ? `${stats.followerGrowth > 0 ? "+" : ""}${stats.followerGrowth.toLocaleString("pt-BR")} desde a coleta anterior` : "Aguardando a próxima coleta para comparar", icon: Users, iconBg: "bg-indigo-50 text-indigo-600 border border-indigo-100" },
    { title: "Alcance", value: formatMetric(stats?.reach), trend: stats?.reach == null ? "Sem dado disponível na última coleta" : "Última coleta da Meta", icon: Eye, iconBg: "bg-sky-50 text-sky-600 border border-sky-100" },
    { title: "Interações", value: formatMetric(stats?.interactions), trend: stats?.interactions == null ? "Sem métricas disponíveis" : stats?.interactionsPartial ? "Contadores disponíveis; soma parcial" : "Contadores acumulados dos posts", icon: Activity, iconBg: "bg-pink-50 text-pink-600 border border-pink-100" },
    { title: "Posts agendados", value: formatMetric(stats?.pendingPosts), trend: stats?.pendingPosts ? "Na fila de publicação" : "Nenhum agendamento", icon: Calendar, iconBg: "bg-amber-50 text-amber-600 border border-amber-100" },
  ]

  return <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
    {cards.map((stat) => <Card key={stat.title} className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3.5 transition-all hover:border-indigo-200 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-slate-600 sm:text-sm">{stat.title}</p><stat.icon size={17} className="shrink-0 text-indigo-500"/></div>
      <h3 className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900">{loading ? "…" : error ? "—" : stat.value}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500 sm:text-xs">{error ? "Falha ao carregar" : stat.trend}</p>
      {error && stat.title === "Seguidores" && onRetry && <Button variant="ghost" size="sm" onClick={onRetry} className="mt-2 h-7 gap-1 px-1 text-xs text-indigo-700"><RefreshCw size={12}/> Tentar novamente</Button>}
    </Card>)}
  </div>
}
