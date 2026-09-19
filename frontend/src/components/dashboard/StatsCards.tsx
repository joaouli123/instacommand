"use client"
import { Card } from "@/components/ui/card"
import { Users, Eye, Heart, Calendar, TrendingUp, TrendingDown } from "lucide-react"

export function StatsCards() {
  const stats = [
    {
      title: "Total de Seguidores",
      value: "124.5K",
      trend: "+2.4% este mês",
      isPositive: true,
      icon: Users,
      iconBg: "bg-indigo-50 text-indigo-600 border border-indigo-100",
    },
    {
      title: "Alcance das Publicações",
      value: "842.1K",
      trend: "+12.5% vs anterior",
      isPositive: true,
      icon: Eye,
      iconBg: "bg-sky-50 text-sky-600 border border-sky-100",
    },
    {
      title: "Taxa Média de Engajamento",
      value: "4.2%",
      trend: "-0.8% vs média",
      isPositive: false,
      icon: Heart,
      iconBg: "bg-pink-50 text-pink-600 border border-pink-100",
    },
    {
      title: "Publicações Agendadas",
      value: "12",
      trend: "Próximos 7 dias",
      isPositive: true,
      icon: Calendar,
      iconBg: "bg-amber-50 text-amber-600 border border-amber-100",
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {stats.map((stat, i) => (
        <Card key={i} className="p-5 border border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-md transition-all duration-200 rounded-2xl group">
          <div className="flex justify-between items-start mb-3">
            <div className={`p-2.5 rounded-xl ${stat.iconBg} transition-transform group-hover:scale-105`}>
              <stat.icon size={20} strokeWidth={2.2} />
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              stat.isPositive 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {stat.isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {stat.trend}
            </span>
          </div>
          <div>
            <h3 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight mb-1">
              {stat.value}
            </h3>
            <p className="text-xs font-medium text-slate-500">
              {stat.title}
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}
