"use client"
import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  Clock, Video, Image as ImageIcon, Layers, Eye
} from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

type CalendarPost = {
  id: string
  mediaType: string
  caption?: string | null
  scheduledFor: string
  status: string
}

export default function CalendarPage() {
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [posts, setPosts] = useState<CalendarPost[]>([])
  const [loading, setLoading] = useState(true)
  const currentMonth = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (letter) => letter.toUpperCase())
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const dates = Array.from({ length: 42 }, (_, i) => i - firstDay + 1)

  useEffect(() => {
    let active = true
    api.getPosts().then((data) => {
      if (active) setPosts(data as CalendarPost[])
    }).catch(() => {
      if (active) setPosts([])
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const eventsByDay = useMemo(() => {
    const result: Record<number, Array<{ title: string; time: string; type: string; status: 'published' | 'scheduled' | 'draft' }>> = {}
    posts.forEach((post) => {
      const date = new Date(post.scheduledFor)
      if (date.getFullYear() !== monthDate.getFullYear() || date.getMonth() !== monthDate.getMonth()) return
      const status = post.status === 'PUBLISHED' ? 'published' : post.status === 'SCHEDULED' ? 'scheduled' : 'draft'
      const type = post.mediaType === 'CAROUSEL' ? 'Carrossel' : post.mediaType === 'REEL' ? 'Reel' : post.mediaType === 'STORY' ? 'Story' : 'Feed'
      if (!result[date.getDate()]) result[date.getDate()] = []
      result[date.getDate()].push({ title: post.caption?.split('\n')[0] || 'Publicação sem legenda', time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), type, status })
    })
    return result
  }, [monthDate, posts])

  return (
    <div className="h-full flex flex-col gap-6 animate-fade-in">
      {/* Calendar Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
            <CalendarIcon size={20} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{currentMonth}</h2>
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
              <Button aria-label="Mês anterior" variant="ghost" size="icon" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="h-7 w-7 rounded-md text-slate-600 hover:text-slate-900">
                <ChevronLeft size={16} />
              </Button>
              <Button aria-label="Próximo mês" variant="ghost" size="icon" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="h-7 w-7 rounded-md text-slate-600 hover:text-slate-900">
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* Status Legend & Quick Action */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600">Publicado</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <span className="text-slate-600">Agendado</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-600">Rascunho</span>
          </div>

          <Link href="/composer">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs gap-1.5 h-8">
              <Plus size={14} />
              Agendar Post
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Calendar Grid */}
      <Card className="flex-1 overflow-hidden flex flex-col border border-slate-200/80 bg-white rounded-2xl shadow-xs">
        {/* Day Name Headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {days.map((day, idx) => (
            <div 
              key={day} 
              className={`py-3 text-center text-xs font-bold uppercase tracking-wider ${
                idx === 0 || idx === 6 ? 'text-slate-400' : 'text-slate-700'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7 flex-1 auto-rows-fr divide-x divide-y divide-slate-100 bg-slate-50/20">
          {dates.map((date, i) => {
            const isCurrentMonth = date > 0 && date <= daysInMonth
            const now = new Date()
            const isToday = isCurrentMonth && date === now.getDate() && monthDate.getMonth() === now.getMonth() && monthDate.getFullYear() === now.getFullYear()
            const dayEvents = isCurrentMonth ? eventsByDay[date] : undefined

            return (
              <div 
                key={i} 
                className={`p-2 min-h-[110px] flex flex-col justify-between transition-colors relative group hover:bg-indigo-50/20 ${
                  !isCurrentMonth ? 'bg-slate-50/60 opacity-40' : 'bg-white'
                } ${isToday ? 'bg-indigo-50/30' : ''}`}
              >
                {/* Date Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`inline-flex items-center justify-center text-xs font-bold w-6 h-6 rounded-full ${
                    isToday 
                      ? 'bg-indigo-600 text-white shadow-xs' 
                      : isCurrentMonth ? 'text-slate-800' : 'text-slate-400'
                  }`}>
                    {isCurrentMonth ? date : ''}
                  </span>

                  {isCurrentMonth && (
                    <Link href="/composer" className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-indigo-600">
                      <Plus size={14} />
                    </Link>
                  )}
                </div>

                {/* Event Pills */}
                <div className="space-y-1.5 overflow-hidden">
                  {dayEvents?.map((event, idx) => (
                    <div 
                      key={idx}
                      className={`p-1.5 rounded-lg border text-[11px] font-semibold flex flex-col gap-0.5 truncate cursor-pointer transition-all ${
                        event.status === 'published'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/70'
                          : event.status === 'scheduled'
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200/80 hover:bg-indigo-100/70'
                          : 'bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100/70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate">{event.type}</span>
                        <span className="text-[9px] opacity-75">{event.time}</span>
                      </div>
                      <span className="truncate font-normal text-[10px]">{event.title}</span>
                    </div>
                  ))}
                </div>

                {/* Empty spacer */}
                <div />
              </div>
            )
          })}
        </div>
        {loading && <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Carregando publicações reais...</div>}
      </Card>
    </div>
  )
}
