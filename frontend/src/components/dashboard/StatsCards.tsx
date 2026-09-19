"use client"
import { Card } from "@/components/ui/card"
import { Users, Eye, Heart, Calendar, TrendingUp, TrendingDown } from "lucide-react"

export function StatsCards() {
  const stats = [
    {
      title: "Total Seguidores",
      value: "124.5K",
      trend: "+2.4%",
      isPositive: true,
      icon: Users,
      color: "text-primary"
    },
    {
      title: "Alcance (30d)",
      value: "842.1K",
      trend: "+12.5%",
      isPositive: true,
      icon: Eye,
      color: "text-accent"
    },
    {
      title: "Taxa de Engajamento",
      value: "4.2%",
      trend: "-0.8%",
      isPositive: false,
      icon: Heart,
      color: "text-success"
    },
    {
      title: "Posts Agendados",
      value: "12",
      trend: "Para esta semana",
      isPositive: true,
      icon: Calendar,
      color: "text-warning"
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, i) => (
        <Card key={i} className="p-6 flex flex-col gap-4 hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start">
            <div className={`p-3 rounded-lg bg-surface ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${stat.isPositive ? 'text-success' : 'text-danger'}`}>
              {stat.isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {stat.trend}
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-bold text-white mb-1">{stat.value}</h3>
            <p className="text-sm text-muted">{stat.title}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}
