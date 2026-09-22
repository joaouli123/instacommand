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
  pendingPosts: number
  engagementRate: number | null
}

const formatMetric = (value: number | null | undefined) => value == null ? "Indisponível" : value.toLocaleString("pt-BR")

export function StatsCards({ stats, loading, error, onRetry }: { stats?: DashboardStats; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  const cards = [
    { title: "Seguidores", value: formatMetric(stats?.followers), trend: stats?.hasFollowerHistory ? `${stats.followerGrowth! > 0 ? "+" : ""}${stats.followerGrowth!.toLocaleString("pt-BR")} desde a coleta anterior` : "Aguardando a próxima coleta para comparar", icon: Users, iconBg: "bg-indigo-50 text-indigo-600 border border-indigo-100" },
    { title: "Alcance", value: formatMetric(stats?.reach), trend: stats?.reach == null ? "Sem dado disponível na última coleta" : "Última coleta da Meta", icon: Eye, iconBg: "bg-sky-50 text-sky-600 border border-sky-100" },
    { title: "Interações", value: formatMetric(stats?.interactions), trend: stats?.interactions == null ? "Sem métricas disponíveis" : "Likes, comentários e salvos reais", icon: Activity, iconBg: "bg-pink-50 text-pink-600 border border-pink-100" },
    { title: "Posts agendados", value: formatMetric(stats?.pendingPosts), trend: stats?.pendingPosts ? "Na fila de publicação" : "Nenhum agendamento", icon: Calendar, iconBg: "bg-amber-50 text-amber-600 border border-amber-100" },
  ]

  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
    {cards.map((stat) => <Card key={stat.title} className="rounded-2xl border border-slate-200/80 bg-white p-5 transition-all hover:border-indigo-200 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3"><div className={`rounded-xl p-2.5 ${stat.iconBg}`}><stat.icon size={20} strokeWidth={2.2} /></div><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{stat.title === "Seguidores" && stats?.hasFollowerHistory && stats.followerGrowth !== 0 ? <TrendingUp size={12} /> : <Minus size={12} />}{stat.trend}</span></div>
      <h3 className="text-xl font-extrabold tracking-tight text-slate-900">{loading ? "…" : error ? "Falha ao carregar" : stat.value}</h3><p className="mt-1 text-xs font-medium text-slate-500">{stat.title}</p>
      {error && stat.title === "Seguidores" && onRetry && <Button variant="ghost" size="sm" onClick={onRetry} className="mt-2 h-7 gap-1 px-1 text-xs text-indigo-700"><RefreshCw size={12}/> Tentar novamente</Button>}
    </Card>)}
  </div>
}
