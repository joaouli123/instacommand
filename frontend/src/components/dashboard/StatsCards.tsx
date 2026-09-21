"use client"

import { Card } from "@/components/ui/card"
import { Users, Eye, Heart, Calendar, TrendingUp, Minus, Activity } from "lucide-react"

type DashboardStats = {
  followers: number
  followerGrowth: number
  reach: number
  impressions: number
  interactions: number
  pendingPosts: number
  engagementRate: number
}

const formatNumber = (value: number) => value ? value.toLocaleString("pt-BR") : "—"

export function StatsCards({ stats, loading }: { stats?: DashboardStats; loading?: boolean }) {
  const cards = [
    { title: "Seguidores", value: stats ? formatNumber(stats.followers) : "—", trend: stats?.followerGrowth ? `${stats.followerGrowth > 0 ? "+" : ""}${formatNumber(stats.followerGrowth)} desde a coleta anterior` : "Sem histórico anterior", icon: Users, iconBg: "bg-indigo-50 text-indigo-600 border border-indigo-100" },
    { title: "Alcance", value: stats ? formatNumber(stats.reach) : "—", trend: stats?.reach ? "Última coleta da Meta" : "Insights não liberados", icon: Eye, iconBg: "bg-sky-50 text-sky-600 border border-sky-100" },
    { title: "Interações", value: stats?.interactions ? stats.interactions.toLocaleString("pt-BR") : "—", trend: stats?.interactions ? "Likes, comentários e salvos reais" : "Nenhuma métrica importada", icon: Activity, iconBg: "bg-pink-50 text-pink-600 border border-pink-100" },
    { title: "Posts agendados", value: stats ? formatNumber(stats.pendingPosts) : "—", trend: stats?.pendingPosts ? "Na fila de publicação" : "Nenhum agendamento", icon: Calendar, iconBg: "bg-amber-50 text-amber-600 border border-amber-100" },
  ]

  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
    {cards.map((stat) => <Card key={stat.title} className="rounded-2xl border border-slate-200/80 bg-white p-5 transition-all hover:border-indigo-200 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3"><div className={`rounded-xl p-2.5 ${stat.iconBg}`}><stat.icon size={20} strokeWidth={2.2} /></div><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{stats?.followerGrowth || stats?.reach || stats?.interactions || stats?.engagementRate || stats?.pendingPosts ? <TrendingUp size={12} /> : <Minus size={12} />}{stat.trend}</span></div>
      <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">{loading ? "..." : stat.value}</h3><p className="mt-1 text-xs font-medium text-slate-500">{stat.title}</p>
    </Card>)}
  </div>
}
