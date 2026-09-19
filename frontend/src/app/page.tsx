"use client"
import { StatsCards } from "@/components/dashboard/StatsCards"
import { GrowthChart } from "@/components/dashboard/GrowthChart"
import { EngagementChart } from "@/components/dashboard/EngagementChart"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Heart, MessageCircle, Bookmark, Calendar, ArrowUpRight, Sparkles, Clock } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const topPosts = [
    { 
      id: 1, 
      img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80', 
      type: 'Reel',
      likes: '1.240', 
      comments: '340', 
      saves: '150', 
      er: '5.2%',
      date: 'Há 2 dias'
    },
    { 
      id: 2, 
      img: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?w=500&q=80', 
      type: 'Carrossel',
      likes: '980', 
      comments: '210', 
      saves: '89', 
      er: '4.8%',
      date: 'Há 4 dias'
    },
    { 
      id: 3, 
      img: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=500&q=80', 
      type: 'Imagem',
      likes: '850', 
      comments: '120', 
      saves: '45', 
      er: '4.1%',
      date: 'Há 6 dias'
    },
  ]

  const upcomingPosts = [
    {
      id: 1,
      title: "Lançamento da nova linha de serviços",
      account: "@joaolucas.design",
      date: "Hoje às 18:30",
      type: "Reel",
      countdown: "Em 4h"
    },
    {
      id: 2,
      title: "5 erros fatais no marketing digital",
      account: "@joaolucas.design",
      date: "Amanhã às 11:00",
      type: "Carrossel",
      countdown: "Em 21h"
    },
    {
      id: 3,
      title: "Bastidores e novidades da semana",
      account: "@uxcode.oficial",
      date: "Quinta às 15:00",
      type: "Story",
      countdown: "Em 2 dias"
    }
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Top Banner Alert / Action */}
      <div className="rounded-2xl p-4 md:p-5 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Otimização de Horários Detectada
            </h2>
            <p className="text-xs text-slate-600">
              Sua audiência tem pico de engajamento às quartas e quintas entre 18h e 20h. Agende seu próximo post para este horário!
            </p>
          </div>
        </div>
        <Link href="/composer">
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs shrink-0 text-xs font-semibold">
            Criar Publicação Agora
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <StatsCards />

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GrowthChart />
        <EngagementChart />
      </div>

      {/* Bottom Row: Top Posts & Upcoming Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Posts */}
        <Card className="p-6 col-span-1 lg:col-span-2 border border-slate-200/80 bg-white rounded-2xl shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Publicações em Alta na Semana</h3>
              <p className="text-xs text-slate-500 font-medium">Classificados por taxa de engajamento e retenção</p>
            </div>
            <Link href="/analytics" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
              Ver todos <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            {topPosts.map(post => (
              <div key={post.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex flex-col shadow-xs hover:shadow-md transition-all">
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  <img 
                    src={post.img} 
                    alt="Post" 
                    className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" 
                  />
                  <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-xs text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200/60 shadow-xs">
                    {post.type}
                  </div>
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                    {post.er}
                  </div>
                </div>
                <div className="p-3 bg-white flex items-center justify-between text-xs text-slate-600 border-t border-slate-100">
                  <div className="flex items-center gap-1 font-medium">
                    <Heart size={13} className="text-rose-500 fill-rose-500/20" /> {post.likes}
                  </div>
                  <div className="flex items-center gap-1 font-medium">
                    <MessageCircle size={13} className="text-indigo-500" /> {post.comments}
                  </div>
                  <div className="flex items-center gap-1 font-medium">
                    <Bookmark size={13} className="text-amber-500 fill-amber-500/20" /> {post.saves}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming Posts */}
        <Card className="p-6 border border-slate-200/80 bg-white rounded-2xl shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Fila de Agendamento</h3>
              <p className="text-xs text-slate-500 font-medium">Próximos disparos automáticos</p>
            </div>
            <Link href="/calendar" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
              Calendário <Calendar size={14} />
            </Link>
          </div>

          <div className="space-y-3 flex-1">
            {upcomingPosts.map(post => (
              <div 
                key={post.id} 
                className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                    {post.type}
                  </span>
                  <span className="text-[11px] font-semibold text-indigo-600 inline-flex items-center gap-1">
                    <Clock size={12} />
                    {post.countdown}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-900 line-clamp-1">
                  {post.title}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/40">
                  <span>{post.account}</span>
                  <span className="font-medium text-slate-700">{post.date}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
