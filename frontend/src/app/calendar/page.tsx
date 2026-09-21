"use client"
import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  Clock, Video, Image as ImageIcon, Layers, Eye
} from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import toast from "react-hot-toast"

type CalendarPost = {
  id: string
  accountId: string
  mediaType: string
  caption?: string | null
  scheduledFor: string
  status: string
  errorMessage?: string | null
  platforms: string[]
  publishedPost?: {
    publishResults?: Record<string, { id?: string }> | null
    publishedAt?: string | null
  } | null
}

export default function CalendarPage() {
  const { accounts, accountId, activeAccount, isLoading: accountsLoading } = useActiveAccount()
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [posts, setPosts] = useState<CalendarPost[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const currentMonth = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (letter) => letter.toUpperCase())
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const dates = Array.from({ length: 42 }, (_, i) => i - firstDay + 1)

  useEffect(() => {
    let active = true
    if (!accountId) {
      setPosts([])
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    api.getPosts(`accountId=${encodeURIComponent(accountId)}`).then((data) => {
      if (active) setPosts(data as CalendarPost[])
    }).catch(() => {
      if (active) setPosts([])
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [accountId])

  const eventsByDay = useMemo(() => {
    const result: Record<number, Array<{ title: string; time: string; type: string; status: 'published' | 'scheduled' | 'draft' | 'failed'; post: CalendarPost }>> = {}
    posts.forEach((post) => {
      const date = new Date(post.scheduledFor)
      if (date.getFullYear() !== monthDate.getFullYear() || date.getMonth() !== monthDate.getMonth()) return
      const status = post.status === 'PUBLISHED' ? 'published' : post.status === 'SCHEDULED' ? 'scheduled' : post.status === 'FAILED' ? 'failed' : 'draft'
      const type = post.mediaType === 'CAROUSEL' ? 'Carrossel' : post.mediaType === 'REEL' ? 'Reel' : post.mediaType === 'STORY' ? 'Story' : 'Feed'
      if (!result[date.getDate()]) result[date.getDate()] = []
      result[date.getDate()].push({ title: post.caption?.split('\n')[0] || 'Publicação sem legenda', time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), type, status, post })
    })
    return result
  }, [monthDate, posts])

  const deletePost = async () => {
    if (!selectedPost || !window.confirm("Excluir esta publicação do calendário?")) return
    setActionLoading(true)
    try {
      const result = await api.deletePost(selectedPost.id) as { warnings?: string[] }
      setPosts((current) => current.filter((post) => post.id !== selectedPost.id))
      setSelectedPost(null)
      if (result.warnings?.length) result.warnings.forEach((warning) => toast.error(warning))
      else toast.success("Publicação removida do calendário.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a publicação.")
    } finally {
      setActionLoading(false)
    }
  }

  const cancelSchedule = async () => {
    if (!selectedPost) return
    setActionLoading(true)
    try {
      await api.updatePost(selectedPost.id, { status: "DRAFT" })
      setPosts((current) => current.map((post) => post.id === selectedPost.id ? { ...post, status: "DRAFT" } : post))
      setSelectedPost((current) => current ? { ...current, status: "DRAFT" } : current)
    } finally {
      setActionLoading(false)
    }
  }

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
            {activeAccount && <select value={accountId} onChange={(event) => { window.localStorage.setItem("instacommand_active_account", event.target.value); window.dispatchEvent(new Event("instacommand-account-changed")) }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700" aria-label="Conta do calendário">{accounts.map((account) => <option key={account.id} value={account.id}>@{account.igUsername}</option>)}</select>}
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
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="text-slate-600">Falhou</span>
          </div>

          <Link href="/composer">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs gap-1.5 h-8">
              <Plus size={14} />
              Agendar Post
            </Button>
          </Link>
        </div>
      </div>

      <Dialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-w-md">
          {selectedPost && <div className="space-y-4">
             <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Detalhes da publicação</p><h3 className="mt-1 text-xl font-bold text-slate-900">{selectedPost.caption?.split("\n")[0] || "Publicação sem legenda"}</h3></div>
             <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Formato</p><p className="mt-1 font-semibold text-slate-800">{selectedPost.mediaType === "CAROUSEL" ? "Carrossel" : selectedPost.mediaType === "REEL" ? "Reel" : selectedPost.mediaType === "STORY" ? "Story" : "Feed"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-semibold text-slate-800">{selectedPost.status === "SCHEDULED" ? "Agendado" : selectedPost.status === "PUBLISHED" ? "Publicado" : selectedPost.status === "FAILED" ? "Falhou" : "Rascunho"}</p></div></div>
             <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Redes selecionadas</p><div className="mt-2 flex flex-wrap gap-2">{(selectedPost.platforms || []).map((platform) => <Badge key={platform} variant="secondary">{platform === "INSTAGRAM" ? "Instagram" : platform === "FACEBOOK" ? "Facebook" : "Threads"}</Badge>)}</div></div>
             {selectedPost.publishedPost?.publishResults && <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resultado real</p><div className="mt-2 space-y-1 text-xs text-slate-600">{Object.entries(selectedPost.publishedPost.publishResults).map(([platform, result]) => <p key={platform}><span className="font-semibold">{platform === "INSTAGRAM" ? "Instagram" : platform === "FACEBOOK" ? "Facebook" : "Threads"}:</span> publicado{result.id ? ` · ID ${result.id}` : ""}</p>)}</div></div>}
            <p className="text-sm text-slate-600">{new Date(selectedPost.scheduledFor).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}</p>
            {selectedPost.errorMessage && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">{selectedPost.errorMessage}</p>}
            <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setSelectedPost(null)}>Fechar</Button>{selectedPost.status === "SCHEDULED" && <Button variant="outline" onClick={cancelSchedule} disabled={actionLoading}>Cancelar agendamento</Button>}<Button variant="danger" onClick={deletePost} disabled={actionLoading}>Excluir</Button></div>
          </div>}
        </DialogContent>
      </Dialog>

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
                      onClick={() => setSelectedPost(event.post)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") setSelectedPost(event.post) }}
                      className={`p-1.5 rounded-lg border text-[11px] font-semibold flex flex-col gap-0.5 truncate cursor-pointer transition-all ${
                        event.status === 'published'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/70'
                          : event.status === 'scheduled'
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200/80 hover:bg-indigo-100/70'
                          : event.status === 'failed'
                          ? 'bg-rose-50 text-rose-800 border-rose-200/80 hover:bg-rose-100/70'
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
