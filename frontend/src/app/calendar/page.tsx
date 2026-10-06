"use client"
import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  Clock, Video, Image as ImageIcon, Layers, Eye
} from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import toast from "react-hot-toast"
import { useQuery } from "@tanstack/react-query"
import { PostPreviewPanel } from "@/components/calendar/PostPreviewPanel"
import { captionAsPublished } from "@/lib/caption"
import { PlatformChip, PlatformIcons, platformBackground, platformLabel } from "@/components/ui/platform-icons"

const STATUS_DOT = { published: "bg-emerald-400", scheduled: "bg-indigo-500", draft: "bg-amber-400", failed: "bg-rose-500" } as const
const STATUS_LABEL = { published: "Publicado", scheduled: "Agendado", draft: "Rascunho", failed: "Falhou" } as const

type CalendarPost = {
  id: string
  accountId: string
  mediaType: string
  caption?: string | null
  scheduledFor: string
  status: string
  errorMessage?: string | null
  platforms: string[]
  mediaUrls?: string[]
  hashtags?: string[]
  threadsAccountId?: string | null
  isAiGenerated?: boolean
  instagramAudioTitle?: string | null
  instagramAudioArtist?: string | null
  advancedSettings?: {
    altTexts?: string[]
    collaborators?: string[]
    firstComment?: string
    disableComments?: boolean
    userTags?: Array<{ username: string }>
  } | null
  publishedPost?: {
    publishResults?: Record<string, { id?: string }> | null
    publishedAt?: string | null
  } | null
}

export default function CalendarPage() {
  const { accounts, accountId, activeAccount, isLoading: accountsLoading } = useActiveAccount()
  const threadsQuery = useQuery({ queryKey: ["threads-accounts"], queryFn: api.getThreadsAccounts, staleTime: 5 * 60_000 })
  const threadsAccounts = (threadsQuery.data || []) as Array<{ id: string; username: string }>
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [posts, setPosts] = useState<CalendarPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [view, setView] = useState<'month' | 'list'>('month')
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
    setError("")
    setSelectedPost(null)
    api.getPosts(`accountId=${encodeURIComponent(accountId)}`).then((data) => {
      if (active) setPosts(data as CalendarPost[])
    }).catch(() => {
      if (active) { setPosts([]); setError("Não foi possível carregar o calendário. Tente novamente.") }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [accountId, refresh])

  const eventsByDay = useMemo(() => {
    const result: Record<number, Array<{ title: string; time: string; type: string; status: 'published' | 'scheduled' | 'draft' | 'failed'; post: CalendarPost }>> = {}
    Array.from(posts).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).forEach((post) => {
      const date = new Date(post.scheduledFor)
      if (date.getFullYear() !== monthDate.getFullYear() || date.getMonth() !== monthDate.getMonth()) return
      const status = post.status === 'PUBLISHED' ? 'published' : post.status === 'SCHEDULED' ? 'scheduled' : post.status === 'FAILED' ? 'failed' : 'draft'
      const type = post.mediaType === 'CAROUSEL' ? 'Carrossel' : post.mediaType === 'REEL' ? 'Reel' : post.mediaType === 'STORY' ? 'Story' : post.mediaType === 'TEXT' ? 'Texto' : 'Feed'
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
      toast.success("Agendamento cancelado. O conteúdo foi mantido como rascunho.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cancelar o agendamento.")
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 animate-fade-in sm:gap-6">
      {/* Calendar Header Controls */}
      <div className="flex min-w-0 flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs sm:flex-row sm:items-center sm:gap-4 sm:p-5">
          <div className="flex min-w-0 w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          <div className="hidden rounded-xl border border-indigo-100 bg-indigo-50 p-2.5 text-indigo-600 sm:block">
            <CalendarIcon size={20} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 sm:text-xl">{currentMonth}</h2>
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
              <Button aria-label="Mês anterior" variant="ghost" size="icon" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="h-10 w-10 rounded-md text-slate-600 hover:text-slate-900">
                <ChevronLeft size={16} />
              </Button>
              <Button aria-label="Próximo mês" variant="ghost" size="icon" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="h-10 w-10 rounded-md text-slate-600 hover:text-slate-900">
                <ChevronRight size={16} />
              </Button>
            </div>
            {activeAccount && <select value={accountId} onChange={(event) => { window.localStorage.setItem("instacommand_active_account", event.target.value); window.dispatchEvent(new Event("instacommand-account-changed")) }} className="h-9 max-w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 sm:w-auto" aria-label="Conta do calendário">{accounts.map((account) => <option key={account.id} value={account.id}>@{account.igUsername}</option>)}</select>}
          </div>
        </div>

        {/* Status Legend & Quick Action */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-semibold sm:gap-4 sm:text-xs" aria-label="Legenda: a cor do card é a rede social; a bolinha é o status">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600">Publicado</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
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
          <span className="hidden items-center gap-1.5 font-medium text-slate-400 lg:inline-flex">· cor do card = rede<span className="inline-flex gap-0.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: platformBackground(["INSTAGRAM"]) }} /><span className="h-2.5 w-2.5 rounded-sm" style={{ background: platformBackground(["FACEBOOK"]) }} /><span className="h-2.5 w-2.5 rounded-sm" style={{ background: platformBackground(["THREADS"]) }} /></span></span>

            <Button asChild size="sm" className="ml-auto h-10 gap-1.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700"><Link href="/composer">
              <Plus size={14} />
              Agendar Post
            </Link></Button>
        </div>
      </div>

      <Dialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-w-4xl" aria-label="Detalhes da publicação">
          {selectedPost && <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
           <PostPreviewPanel
             post={selectedPost}
             account={accounts.find((account) => account.id === selectedPost.accountId)}
             threadsAccount={threadsAccounts.find((account) => account.id === selectedPost.threadsAccountId)}
           />
           <div className="min-w-0 space-y-4">
             <div className="pr-8"><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Detalhes da publicação</p><h3 className="mt-1 break-words text-xl font-bold text-slate-900">{selectedPost.caption?.split("\n")[0] || "Publicação sem legenda"}</h3></div>
             <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Formato</p><p className="mt-1 font-semibold text-slate-800">{selectedPost.mediaType === "CAROUSEL" ? "Carrossel" : selectedPost.mediaType === "REEL" ? "Reel" : selectedPost.mediaType === "STORY" ? "Story" : selectedPost.mediaType === "TEXT" ? "Texto" : "Feed"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-semibold text-slate-800">{selectedPost.status === "SCHEDULED" ? "Agendado" : selectedPost.status === "PUBLISHED" ? "Publicado" : selectedPost.status === "FAILED" ? "Falhou" : "Rascunho"}</p></div></div>
             <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Redes selecionadas</p><div className="mt-2 flex flex-wrap gap-2">{(selectedPost.platforms || []).map((platform) => <PlatformChip key={platform} platform={platform} />)}</div></div>
             {selectedPost.publishedPost?.publishResults && <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resultado real</p><div className="mt-2 space-y-1 text-xs text-slate-600">{Object.entries(selectedPost.publishedPost.publishResults).map(([platform, result]) => <p key={platform} className="flex items-center gap-1.5"><PlatformIcons platforms={[platform]} size={12} /><span className="font-semibold">{platformLabel(platform)}:</span> publicado{result.id ? ` · ID ${result.id}` : ""}</p>)}</div></div>}
            <p className="text-sm text-slate-600">{new Date(selectedPost.scheduledFor).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}</p>
            <PostContentDetails post={selectedPost} />
            {selectedPost.errorMessage && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">{selectedPost.errorMessage}</p>}
            {selectedPost.status === "PUBLISHED" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Excluir aqui remove o registro do InstaCommand. A API não consegue apagar do Instagram uma mídia que já foi publicada; remova-a diretamente no Instagram. No Facebook/Threads, o app tenta excluir também e avisa se a Meta recusar.</p>}
            {['DRAFT', 'FAILED'].includes(selectedPost.status) && <Link href={`/composer?draft=${encodeURIComponent(selectedPost.id)}`} className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Editar rascunho e adicionar mídias</Link>}
            <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setSelectedPost(null)}>Fechar</Button>{selectedPost.status === "SCHEDULED" && <Button variant="outline" onClick={cancelSchedule} disabled={actionLoading}>Cancelar agendamento</Button>}<Button variant="danger" onClick={deletePost} disabled={actionLoading}>{actionLoading ? "Excluindo…" : selectedPost.status === "PUBLISHED" ? "Excluir registro" : "Excluir"}</Button></div>
           </div>
          </div>}
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center justify-between gap-2"><div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Visualização do calendário"><button className="report-toggle aria-pressed:bg-white aria-pressed:shadow-sm" aria-pressed={view === 'month'} onClick={() => setView('month')}>Mês</button><button className="report-toggle aria-pressed:bg-white aria-pressed:shadow-sm" aria-pressed={view === 'list'} onClick={() => setView('list')}>Lista</button></div><Button variant="outline" size="sm" onClick={() => setMonthDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Mês atual</Button></div>
      {error && <Card className="border-rose-200 p-4 text-sm text-rose-700"><p role="alert">{error}</p><Button className="mt-2" variant="outline" onClick={() => setRefresh(value => value + 1)}>Tentar novamente</Button></Card>}
      {!accountsLoading && !accountId && <p className="text-sm text-slate-600">Conecte uma conta para acompanhar suas publicações.</p>}
      {view === 'list' && <Card className="divide-y divide-slate-100 overflow-hidden">{loading ? <p className="p-5 text-sm" role="status">Carregando publicações…</p> : !error && Object.keys(eventsByDay).length === 0 ? <p className="p-5 text-sm text-slate-600">Nenhuma publicação neste mês.</p> : Object.entries(eventsByDay).map(([day, events]) => <section key={day} className="p-3 sm:p-4"><h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{day} de {monthDate.toLocaleDateString('pt-BR', { month: 'long' })}</h3><div className="space-y-2">{events.map(event => <button key={event.post.id} onClick={() => setSelectedPost(event.post)} className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: platformBackground(event.post.platforms) }}><PlatformIcons platforms={event.post.platforms?.slice(0, 1)} size={16} color="white" /></span><span className="shrink-0 pt-2 text-sm font-bold text-indigo-700">{event.time}</span><span className="min-w-0 flex-1"><span className="block line-clamp-2 break-words text-sm font-semibold">{event.title}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><PlatformIcons platforms={event.post.platforms} size={13} />{event.type} · <span className={`h-2 w-2 rounded-full ${STATUS_DOT[event.status]}`} aria-hidden />{STATUS_LABEL[event.status]}</span></span></button>)}</div></section>)}</Card>}
      {view === 'month' && <Card className="flex-1 overflow-hidden flex flex-col border border-slate-200/80 bg-white rounded-2xl shadow-xs">
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
              className={`group relative flex min-h-[72px] flex-col justify-between p-1 transition-colors hover:bg-indigo-50/20 sm:min-h-[110px] sm:p-2 ${
                  !isCurrentMonth ? 'bg-slate-50/60 opacity-40' : 'bg-white'
                } ${isToday ? 'bg-indigo-50/30' : ''}`}
              >
                {/* Date Header */}
                <div className="mb-1 flex items-center justify-center sm:mb-1.5 sm:justify-between">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold sm:h-6 sm:w-6 sm:text-xs ${
                    isToday 
                      ? 'bg-indigo-600 text-white shadow-xs' 
                      : isCurrentMonth ? 'text-slate-800' : 'text-slate-400'
                  }`}>
                    {isCurrentMonth ? date : ''}
                  </span>

                  {isCurrentMonth && (
                    <Link href="/composer" aria-label="Criar publicação" className="hidden opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-indigo-600 sm:block">
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
                      onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); setSelectedPost(event.post) } }}
                      aria-label={`${event.type} (${(event.post.platforms || []).map(platformLabel).join(", ")}), ${event.time}: ${event.title}`}
                      title={`${event.type} · ${event.time} · ${event.title}`}
                      style={{ background: platformBackground(event.post.platforms) }}
                      className={`relative mx-auto flex min-h-8 min-w-8 w-fit cursor-pointer items-center justify-center rounded-lg p-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 sm:mx-0 sm:w-full sm:flex-col sm:items-stretch sm:gap-0.5 sm:p-1.5 ${event.status === 'draft' ? 'opacity-75' : ''} ${event.status === 'failed' ? 'ring-2 ring-rose-500 ring-offset-1' : ''}`}
                    >
                      <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white sm:hidden ${STATUS_DOT[event.status]}`} aria-hidden />
                      {event.post.platforms?.length ? <PlatformIcons platforms={event.post.platforms.slice(0, 1)} size={14} color="white" className="sm:hidden" /> : <span className="mx-auto block h-2 w-2 rounded-full bg-white sm:hidden" />}
                      <div className="hidden min-w-0 items-center justify-between gap-1 sm:flex">
                        <span className="flex min-w-0 items-center gap-1"><PlatformIcons platforms={event.post.platforms} size={11} color="white" /><span className="truncate font-bold">{event.type}</span></span>
                        <span className="flex shrink-0 items-center gap-1 text-[9px] text-white/90">{event.time}<span className={`h-2 w-2 rounded-full ring-1 ring-white ${STATUS_DOT[event.status]}`} title={STATUS_LABEL[event.status]} aria-hidden /></span>
                      </div>
                      <span className="hidden truncate text-[10px] font-normal text-white/90 sm:block">{event.title}</span>
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
      </Card>}
    </div>
  )
}

/** Full text and Instagram options exactly as they will be sent. */
function PostContentDetails({ post }: { post: CalendarPost }) {
  const caption = captionAsPublished(post.caption, post.hashtags)
  const settings = post.advancedSettings || {}
  const extras = [
    settings.firstComment?.trim() ? { label: "Primeiro comentário", value: settings.firstComment.trim() } : null,
    settings.collaborators?.length ? { label: "Colaboradores", value: settings.collaborators.map((user) => `@${user}`).join(", ") } : null,
    settings.userTags?.length ? { label: "Pessoas marcadas", value: Array.from(new Set(settings.userTags.map((tag) => `@${tag.username}`))).join(", ") } : null,
    settings.altTexts?.some((text) => text?.trim()) ? { label: "Texto alternativo", value: settings.altTexts.map((text, index) => text?.trim() ? `${index + 1}. ${text.trim()}` : null).filter(Boolean).join("\n") } : null,
    settings.disableComments ? { label: "Comentários", value: "Desativados no Instagram" } : null,
    post.instagramAudioTitle ? { label: "Música", value: [post.instagramAudioTitle, post.instagramAudioArtist].filter(Boolean).join(" — ") } : null,
    post.isAiGenerated ? { label: "Rótulo", value: "Conteúdo gerado por IA" } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  return <div className="space-y-3">
    <div>
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Legenda que será publicada</p><span className="text-[11px] text-slate-400">{caption.length} caracteres</span></div>
      <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{caption || <span className="text-slate-400">Sem legenda.</span>}</p>
    </div>
    <p className="text-xs text-slate-500">{post.mediaUrls?.length ? `${post.mediaUrls.length} mídia(s) anexada(s).` : post.mediaType === "TEXT" ? "Post só de texto." : "Nenhuma mídia anexada ainda."}</p>
    {extras.length > 0 && <dl className="space-y-2 rounded-xl border border-slate-200 p-3">
      {extras.map((item) => <div key={item.label}><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">{item.value}</dd></div>)}
    </dl>}
  </div>
}
