"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, FileText, List, MapPin, MessageCircle, MousePointerClick, PencilLine, Send, X as CloseIcon } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { AvatarImage } from "@/components/ui/avatar-image"
import { PlatformIcons, platformBackground, platformLabel } from "@/components/ui/platform-icons"
import { PostPreviewPanel } from "@/components/calendar/PostPreviewPanel"
import { BACKEND_ORIGIN } from "@/lib/config"
import { isVideoUrl } from "@/lib/media"
import { captionAsPublished } from "@/lib/caption"
import { cn } from "@/lib/utils"
import { formatCommentTime, type ClientComment } from "./ClientCommentsPanel"

type PublicAccount = { key: string; igUsername: string; name: string; pageName: string | null; igProfilePicUrl: string | null }
type PublicPost = {
  id: string
  accountKey: string
  mediaType: string
  mediaUrls: string[]
  thumbnailUrl: string | null
  caption: string
  hashtags: string[]
  platforms: string[]
  scheduledAt: string
  status: "SCHEDULED" | "PUBLISHED" | "DRAFT"
  threadsAccount: { username: string } | null
  xAccount: { username: string; name: string | null; profilePicUrl: string | null } | null
}
type Payload = { link: { name: string; includeDrafts: boolean; expiresAt: string | null }; accounts: PublicAccount[]; posts: PublicPost[]; comments: ClientComment[] }
type PendingPin = { mediaIndex: number; x: number; y: number }

const STATUS = {
  SCHEDULED: { label: "Agendado", Icon: Clock, className: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  PUBLISHED: { label: "Publicado", Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  DRAFT: { label: "Rascunho", Icon: PencilLine, className: "bg-slate-100 text-slate-600 ring-slate-200" },
} as const
const NETWORKS = ["INSTAGRAM", "FACEBOOK", "THREADS", "X"]
const FORMAT_LABEL: Record<string, string> = { CAROUSEL: "Carrossel", REEL: "Reel", STORY: "Story", TEXT: "Texto", IMAGE: "Feed" }
const NAME_KEY = "instacommand_share_author"
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const timeOf = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
const capitalize = (value: string) => value.replace(/^./, (letter) => letter.toUpperCase())

const readName = () => { try { return window.localStorage.getItem(NAME_KEY) || "" } catch { return "" } }
const saveName = (name: string) => { try { window.localStorage.setItem(NAME_KEY, name) } catch { /* storage may be blocked */ } }

async function publicFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${BACKEND_ORIGIN}/api/public/share/${path}`, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data?.error || data?.message || "Não foi possível carregar."), { status: response.status })
  return data
}

function StatusBadge({ status, className }: { status: PublicPost["status"]; className?: string }) {
  const meta = STATUS[status] || STATUS.SCHEDULED
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", meta.className, className)}><meta.Icon size={11} aria-hidden />{meta.label}</span>
}

function Thumb({ post, className }: { post: PublicPost; className?: string }) {
  const src = post.thumbnailUrl || post.mediaUrls[0]
  if (!src) return <div className={cn("flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400", className)}><FileText size={20} /></div>
  if (isVideoUrl(src)) return <video src={`${src}#t=0.5`} muted playsInline preload="metadata" className={cn("object-cover", className)} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" decoding="async" className={cn("object-cover", className)} />
}

export function PublicShareView({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<{ message: string; status?: number } | null>(null)
  const [view, setView] = useState<"list" | "month">("list")
  const [networks, setNetworks] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!token) return
    publicFetch(encodeURIComponent(token)).then((payload: Payload) => { setData(payload); setError(null) })
      .catch((reason: Error & { status?: number }) => setError({ message: reason.message, status: reason.status }))
  }, [token])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    try { const saved = window.localStorage.getItem("instacommand_share_view"); if (saved === "month" || saved === "list") setView(saved) } catch { /* ignore */ }
  }, [])
  const changeView = (next: "list" | "month") => { setView(next); try { window.localStorage.setItem("instacommand_share_view", next) } catch { /* ignore */ } }

  const accounts = useMemo(() => new Map((data?.accounts || []).map((account) => [account.key, account])), [data])
  const availableNetworks = useMemo(() => NETWORKS.filter((network) => data?.posts.some((post) => post.platforms.includes(network))), [data])
  const posts = useMemo(() => (data?.posts || []).filter((post) => !networks.length || post.platforms.some((platform) => networks.includes(platform))), [data, networks])
  const commentsByPost = useMemo(() => {
    const map = new Map<string, ClientComment[]>()
    data?.comments.forEach((comment) => map.set(comment.postId, [...(map.get(comment.postId) || []), comment]))
    return map
  }, [data])
  const selected = data?.posts.find((post) => post.id === selectedId) || null

  const addComment = (comment: ClientComment) => setData((current) => current ? { ...current, comments: [...current.comments, comment] } : current)

  if (error) return <CenteredMessage title={error.status === 404 ? "Link indisponível" : "Algo deu errado"} text={error.status === 404 ? "Este link expirou ou foi revogado. Peça um novo link a quem compartilhou o calendário." : error.message} onRetry={error.status === 404 ? undefined : load} />
  if (!data) return <LoadingSkeleton />

  const brand = data.accounts[0]
  const counts = { SCHEDULED: posts.filter((post) => post.status === "SCHEDULED").length, PUBLISHED: posts.filter((post) => post.status === "PUBLISHED").length, DRAFT: posts.filter((post) => post.status === "DRAFT").length }

  return <div className="min-h-dvh bg-[#f6f7fb] pb-[calc(2rem+env(safe-area-inset-bottom))]">
    <header className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white">
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-8 pt-6 sm:px-6 sm:pt-10">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-3">
            {(data.accounts.length ? data.accounts.slice(0, 3) : [null]).map((account, index) => <span key={account?.key || index} className="h-12 w-12 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/80 sm:h-14 sm:w-14">
              {account ? <AvatarImage src={account.igProfilePicUrl} alt={account.name} fallback={<span className="flex h-full w-full items-center justify-center text-lg font-bold">{(account.name || "?").slice(0, 1).toUpperCase()}</span>} /> : <span className="flex h-full w-full items-center justify-center"><CalendarDays size={22} /></span>}
            </span>)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold sm:text-2xl">{brand ? brand.name : data.link.name}</p>
            {brand && <p className="truncate text-sm text-white/80">@{brand.igUsername}{data.accounts.length > 1 ? ` e mais ${data.accounts.length - 1}` : ""}</p>}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Calendário de conteúdo</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{data.link.name}</h1>
          <p className="mt-1 max-w-xl text-sm text-white/80">Veja tudo o que será publicado. Toque em um post para ver a prévia e deixar suas observações.</p>
        </div>
      </div>
    </header>

    <main className="mx-auto mt-5 max-w-5xl space-y-4 px-4 sm:px-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {(["SCHEDULED", "PUBLISHED", "DRAFT"] as const).filter((status) => status !== "DRAFT" || data.link.includeDrafts).map((status) => {
          const meta = STATUS[status]
          return <div key={status} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 sm:p-4">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 sm:text-xs"><meta.Icon size={12} />{meta.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{counts[status]}</p>
          </div>
        })}
      </div>

      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 bg-[#f6f7fb]/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:px-0">
        <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition", view === "list" ? "bg-indigo-600 text-white shadow" : "text-slate-600")}><List size={14} />Linha do tempo</button>
          <button type="button" aria-pressed={view === "month"} onClick={() => changeView("month")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition", view === "month" ? "bg-indigo-600 text-white shadow" : "text-slate-600")}><CalendarDays size={14} />Mês</button>
        </div>
        {availableNetworks.length > 1 && <div className="flex gap-1.5 overflow-x-auto" aria-label="Filtrar por rede">
          {availableNetworks.map((network) => {
            const active = networks.includes(network)
            return <button key={network} type="button" aria-pressed={active} onClick={() => setNetworks((current) => active ? current.filter((item) => item !== network) : [...current, network])}
              className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition", active ? "text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200")}
              style={active ? { background: platformBackground([network]) } : undefined}>
              <PlatformIcons platforms={[network]} size={12} color={active ? "white" : undefined} />{platformLabel(network)}
            </button>
          })}
        </div>}
      </div>

      {view === "list" ? <Timeline posts={posts} accounts={accounts} commentsByPost={commentsByPost} onOpen={setSelectedId} />
        : <MonthGrid posts={posts} monthDate={monthDate} setMonthDate={setMonthDate} selectedDay={selectedDay} setSelectedDay={setSelectedDay} accounts={accounts} commentsByPost={commentsByPost} onOpen={setSelectedId} />}

      <p className="pt-4 text-center text-[11px] text-slate-400">Link somente leitura{data.link.expiresAt ? ` · válido até ${new Date(data.link.expiresAt).toLocaleDateString("pt-BR")}` : ""} · InstaCommand</p>
    </main>

    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
      <DialogContent aria-label="Publicação" className="bottom-0 top-auto max-h-[92dvh] w-full max-w-5xl translate-y-0 overflow-hidden rounded-b-none p-0 sm:bottom-auto sm:top-[50%] sm:w-[calc(100%-2rem)] sm:translate-y-[-50%] sm:rounded-2xl sm:p-0">
        {selected && <PostDetail key={selected.id} token={token} post={selected} account={accounts.get(selected.accountKey)} comments={commentsByPost.get(selected.id) || []} onComment={addComment} />}
      </DialogContent>
    </Dialog>
  </div>
}

function PostCard({ post, account, commentCount, onOpen }: { post: PublicPost; account?: PublicAccount; commentCount: number; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="group flex w-full min-w-0 gap-3 rounded-2xl bg-white p-2.5 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:p-3">
    <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-24">
      <Thumb post={post} className="h-full w-full" />
      {post.mediaUrls.length > 1 && <span className="absolute right-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">1/{post.mediaUrls.length}</span>}
    </div>
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-bold text-slate-900">{timeOf(post.scheduledAt)}</span>
        <StatusBadge status={post.status} />
      </div>
      <p className="mt-1 line-clamp-2 break-words text-sm text-slate-700">{post.caption || <span className="text-slate-400">Sem legenda</span>}</p>
      <div className="mt-auto flex items-center gap-2 pt-2 text-[11px] text-slate-500">
        <span className="flex h-5 items-center gap-1 rounded-md px-1.5 text-white" style={{ background: platformBackground(post.platforms) }}><PlatformIcons platforms={post.platforms} size={10} color="white" /></span>
        <span>{FORMAT_LABEL[post.mediaType] || "Feed"}</span>
        {account && <span className="hidden truncate sm:inline">· @{account.igUsername}</span>}
        {commentCount > 0 && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800"><MessageCircle size={11} />{commentCount}</span>}
        <span className={cn("inline-flex items-center gap-1 font-semibold text-indigo-600 opacity-0 transition group-hover:opacity-100", commentCount > 0 ? "" : "ml-auto")}><Eye size={12} />Ver</span>
      </div>
    </div>
  </button>
}

type ListProps = { posts: PublicPost[]; accounts: Map<string, PublicAccount>; commentsByPost: Map<string, ClientComment[]>; onOpen: (id: string) => void }

function Timeline({ posts, accounts, commentsByPost, onOpen }: ListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => {
    const result: Array<{ key: string; date: Date; posts: PublicPost[] }> = []
    posts.forEach((post) => {
      const date = new Date(post.scheduledAt)
      const key = dayKey(date)
      const last = result[result.length - 1]
      if (last?.key === key) last.posts.push(post)
      else result.push({ key, date, posts: [post] })
    })
    return result
  }, [posts])
  const todayKey = dayKey(new Date())

  useEffect(() => {
    // Open close to today: the past is above, what is next is right in view.
    const target = groups.find((group) => group.key >= todayKey)
    if (target) listRef.current?.querySelector(`[data-day="${target.key}"]`)?.scrollIntoView({ block: "start" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length])

  if (!groups.length) return <EmptyState />
  return <div ref={listRef} className="space-y-5">
    {groups.map((group) => {
      const isToday = group.key === todayKey
      return <section key={group.key} data-day={group.key} className="scroll-mt-16">
        <h2 className="mb-2 flex items-center gap-2 px-1">
          <span className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none", isToday ? "bg-indigo-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200")}>
            <span className="text-base font-bold">{group.date.getDate()}</span>
            <span className={cn("text-[9px] font-semibold uppercase", isToday ? "text-white/80" : "text-slate-500")}>{group.date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
          </span>
          <span className="text-sm font-semibold text-slate-700">{capitalize(group.date.toLocaleDateString("pt-BR", { weekday: "long" }))}{isToday && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">Hoje</span>}</span>
          <span className="ml-auto text-xs text-slate-400">{group.posts.length} {group.posts.length === 1 ? "post" : "posts"}</span>
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {group.posts.map((post) => <PostCard key={post.id} post={post} account={accounts.get(post.accountKey)} commentCount={(commentsByPost.get(post.id) || []).filter((comment) => !comment.parentId).length} onOpen={() => onOpen(post.id)} />)}
        </div>
      </section>
    })}
  </div>
}

function MonthGrid({ posts, monthDate, setMonthDate, selectedDay, setSelectedDay, accounts, commentsByPost, onOpen }: ListProps & { monthDate: Date; setMonthDate: (date: Date) => void; selectedDay: string | null; setSelectedDay: (day: string | null) => void }) {
  const byDay = useMemo(() => {
    const map = new Map<string, PublicPost[]>()
    posts.forEach((post) => { const key = dayKey(new Date(post.scheduledAt)); map.set(key, [...(map.get(key) || []), post]) })
    return map
  }, [posts])
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const cells = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index - first.getDay() + 1))
  const todayKey = dayKey(new Date())
  const dayPosts = selectedDay ? byDay.get(selectedDay) || [] : []

  return <div className="space-y-3">
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between border-b border-slate-100 px-2 py-2">
        <button type="button" aria-label="Mês anterior" onClick={() => { setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)); setSelectedDay(null) }} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><ChevronLeft size={18} /></button>
        <p className="text-sm font-bold text-slate-900 sm:text-base">{capitalize(monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }))}</p>
        <button type="button" aria-label="Próximo mês" onClick={() => { setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)); setSelectedDay(null) }} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 bg-slate-50 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">{WEEKDAYS.map((day) => <div key={day} className="py-2">{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-px bg-slate-100">
        {cells.map((date) => {
          const key = dayKey(date)
          const inMonth = date.getMonth() === monthDate.getMonth()
          const items = byDay.get(key) || []
          const active = selectedDay === key
          return <button key={key} type="button" disabled={!items.length} onClick={() => setSelectedDay(active ? null : key)} aria-label={`${date.getDate()}: ${items.length} posts`}
            className={cn("relative flex min-h-[64px] flex-col items-stretch gap-1 bg-white p-1 text-left transition sm:min-h-[104px] sm:p-1.5", !inMonth && "bg-slate-50/70 text-slate-300", items.length && "hover:bg-indigo-50/50", active && "bg-indigo-50 ring-2 ring-inset ring-indigo-500")}>
            <span className={cn("mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold sm:mx-0", key === todayKey ? "bg-indigo-600 text-white" : inMonth ? "text-slate-700" : "")}>{date.getDate()}</span>
            {items.length > 0 && <>
              <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                {items.slice(0, 2).map((post) => <span key={post.id} className={cn("flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-semibold text-white", post.status === "DRAFT" && "opacity-70")} style={{ background: platformBackground(post.platforms) }}>
                  <PlatformIcons platforms={post.platforms.slice(0, 1)} size={9} color="white" /><span className="truncate">{timeOf(post.scheduledAt)} {post.caption.split("\n")[0]}</span>
                </span>)}
                {items.length > 2 && <span className="text-[10px] font-semibold text-slate-500">+{items.length - 2}</span>}
              </div>
              <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                {items.slice(0, 4).map((post) => <span key={post.id} className="h-1.5 w-1.5 rounded-full" style={{ background: platformBackground(post.platforms) }} />)}
              </div>
            </>}
          </button>
        })}
      </div>
    </div>
    {selectedDay && <section>
      <h3 className="mb-2 px-1 text-sm font-semibold text-slate-700">{capitalize(new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{dayPosts.map((post) => <PostCard key={post.id} post={post} account={accounts.get(post.accountKey)} commentCount={(commentsByPost.get(post.id) || []).filter((comment) => !comment.parentId).length} onOpen={() => onOpen(post.id)} />)}</div>
    </section>}
    {!selectedDay && <p className="px-1 text-center text-xs text-slate-500">Toque em um dia com posts para ver os detalhes.</p>}
  </div>
}

function PostDetail({ token, post, account, comments, onComment }: { token: string; post: PublicPost; account?: PublicAccount; comments: ClientComment[]; onComment: (comment: ClientComment) => void }) {
  const hasMedia = post.mediaUrls.length > 0
  const [tab, setTab] = useState<"preview" | "annotate">("preview")
  const [mediaIndex, setMediaIndex] = useState(0)
  const [pending, setPending] = useState<PendingPin | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const roots = comments.filter((comment) => !comment.parentId)
  const pinned = roots.filter((comment) => comment.x !== null)
  const pinNumbers = new Map(pinned.map((comment, index) => [comment.id, index + 1]))

  const focusPin = (comment: ClientComment) => {
    if (comment.x === null) return
    setTab("annotate")
    setMediaIndex(comment.mediaIndex ?? 0)
    setHighlight(comment.id)
  }

  // Phone: one scroll for preview, caption and comments, with the form pinned at the bottom. Desktop: two columns, each scrolling.
  return <div className="max-h-[92dvh] overflow-y-auto overscroll-contain md:grid md:max-h-[90dvh] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:overflow-hidden">
    <div className="relative z-0 min-w-0 overflow-hidden border-b border-slate-100 bg-slate-50/60 p-3 sm:p-5 md:max-h-[90dvh] md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
      <div className="mb-3 flex flex-wrap items-center gap-2 pr-10">
        <StatusBadge status={post.status} />
        <span className="text-xs font-medium text-slate-600">{capitalize(new Date(post.scheduledAt).toLocaleString("pt-BR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span>
      </div>
      {hasMedia && <div className="mb-3 inline-flex rounded-xl bg-white p-1 ring-1 ring-slate-200" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold", tab === "preview" ? "bg-slate-900 text-white" : "text-slate-600")}><Eye size={13} />Prévia na rede</button>
        <button type="button" role="tab" aria-selected={tab === "annotate"} onClick={() => setTab("annotate")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold", tab === "annotate" ? "bg-slate-900 text-white" : "text-slate-600")}><MapPin size={13} />Marcar na mídia{pinned.length ? ` (${pinned.length})` : ""}</button>
      </div>}
      {tab === "preview" || !hasMedia
        ? <div className="mx-auto max-w-[300px] md:max-w-none"><PostPreviewPanel post={post} account={account ? { igUsername: account.igUsername, pageName: account.pageName, igProfilePicUrl: account.igProfilePicUrl } : undefined} threadsAccount={post.threadsAccount || undefined} xAccount={post.xAccount || undefined} /></div>
        : <Annotator post={post} mediaIndex={mediaIndex} setMediaIndex={(index) => { setMediaIndex(index); setPending(null) }} pins={pinned} pinNumbers={pinNumbers} pending={pending} setPending={setPending} highlight={highlight} setHighlight={setHighlight} />}
    </div>
    <div className="relative z-10 flex min-w-0 flex-col bg-white md:max-h-[90dvh] md:min-h-0">
      <div className="p-4 sm:p-5 md:min-h-0 md:flex-1 md:overflow-y-auto">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">{FORMAT_LABEL[post.mediaType] || "Feed"} · {post.platforms.map(platformLabel).join(", ")}</p>
        <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-200">{captionAsPublished(post.caption, post.hashtags) || <span className="text-slate-400">Sem legenda.</span>}</p>
        <h3 className="mt-5 flex items-center gap-1.5 text-sm font-bold text-slate-900"><MessageCircle size={15} />Observações {roots.length ? `(${roots.length})` : ""}</h3>
        {!roots.length && <p className="mt-2 rounded-xl border border-dashed border-slate-200 p-3 text-xs leading-5 text-slate-500">Nenhuma observação ainda. Escreva abaixo{hasMedia ? " ou toque em “Marcar na mídia” para apontar um detalhe exato da imagem" : ""}.</p>}
        <ul className="mt-2 space-y-2">
          {roots.map((comment) => <li key={comment.id} onMouseEnter={() => setHighlight(comment.id)} onMouseLeave={() => setHighlight(null)}
            className={cn("rounded-xl border p-3 transition", highlight === comment.id ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white", comment.resolved && "opacity-60")}>
            <div className="flex items-start gap-2">
              {pinNumbers.has(comment.id) && <button type="button" onClick={() => focusPin(comment)} aria-label="Ver marcador" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white shadow">{pinNumbers.get(comment.id)}</button>}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500"><span className="font-semibold text-slate-800">{comment.authorName}</span> · {formatCommentTime(comment.createdAt)}{comment.resolved && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Resolvido</span>}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{comment.body}</p>
                {comments.filter((item) => item.parentId === comment.id).map((item) => <div key={item.id} className="mt-2 border-l-2 border-indigo-200 pl-2">
                  <p className="text-[11px] text-slate-500"><span className={cn("font-semibold", item.fromOwner ? "text-indigo-700" : "text-slate-800")}>{item.authorName}{item.fromOwner ? " · equipe" : ""}</span> · {formatCommentTime(item.createdAt)}</p>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.body}</p>
                </div>)}
              </div>
            </div>
          </li>)}
        </ul>
      </div>
      <CommentForm token={token} postId={post.id} pending={pending} clearPending={() => setPending(null)} onComment={onComment} hasMedia={hasMedia} startPin={() => setTab("annotate")} />
    </div>
  </div>
}

function Annotator({ post, mediaIndex, setMediaIndex, pins, pinNumbers, pending, setPending, highlight, setHighlight }: { post: PublicPost; mediaIndex: number; setMediaIndex: (index: number) => void; pins: ClientComment[]; pinNumbers: Map<string, number>; pending: PendingPin | null; setPending: (pin: PendingPin | null) => void; highlight: string | null; setHighlight: (id: string | null) => void }) {
  const src = post.mediaUrls[Math.min(mediaIndex, post.mediaUrls.length - 1)]
  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    setPending({ mediaIndex, x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) })
  }
  return <div>
    <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-600"><MousePointerClick size={13} />Toque no ponto da imagem que quer comentar.</p>
    <div className="flex justify-center rounded-2xl bg-slate-900/90 p-2">
      <div className="relative inline-block max-w-full cursor-crosshair select-none" onClick={place}>
        {isVideoUrl(src)
          ? <video src={src} muted playsInline loop autoPlay className="block max-h-[45dvh] max-w-full rounded-lg md:max-h-[60dvh]" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={src} alt={`Mídia ${mediaIndex + 1}`} draggable={false} className="block max-h-[45dvh] max-w-full rounded-lg md:max-h-[60dvh]" />}
        {pins.filter((pin) => (pin.mediaIndex ?? 0) === mediaIndex).map((pin) => <button key={pin.id} type="button" onClick={(event) => { event.stopPropagation(); setHighlight(highlight === pin.id ? null : pin.id) }}
          className={cn("absolute flex h-7 w-7 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none text-xs font-bold text-white shadow-lg ring-2 ring-white transition", highlight === pin.id ? "scale-125 bg-amber-500" : pin.resolved ? "bg-slate-400" : "bg-amber-500/90")}
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, transformOrigin: "bottom left" }} aria-label={`Observação ${pinNumbers.get(pin.id)}`}>{pinNumbers.get(pin.id)}</button>)}
        {pending && pending.mediaIndex === mediaIndex && <span className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-full animate-bounce items-center justify-center rounded-full rounded-bl-none bg-indigo-600 text-white shadow-lg ring-2 ring-white" style={{ left: `${pending.x}%`, top: `${pending.y}%` }}><MapPin size={14} /></span>}
        {highlight && (() => { const pin = pins.find((item) => item.id === highlight && (item.mediaIndex ?? 0) === mediaIndex); return pin ? <span className="pointer-events-none absolute z-10 w-48 -translate-x-1/2 translate-y-2 rounded-lg bg-white p-2 text-xs text-slate-700 shadow-xl" style={{ left: `${Math.min(80, Math.max(20, pin.x ?? 0))}%`, top: `${pin.y}%` }}><b>{pin.authorName}:</b> {pin.body.slice(0, 140)}</span> : null })()}
      </div>
    </div>
    {post.mediaUrls.length > 1 && <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
      {post.mediaUrls.map((url, index) => <button key={url + index} type="button" onClick={() => setMediaIndex(index)} aria-label={`Mídia ${index + 1}`} className={cn("relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2", index === mediaIndex ? "ring-indigo-600" : "ring-transparent opacity-70")}>
        {isVideoUrl(url) ? <video src={`${url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
        {pins.some((pin) => (pin.mediaIndex ?? 0) === index) && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-1 ring-white" />}
      </button>)}
    </div>}
  </div>
}

function CommentForm({ token, postId, pending, clearPending, onComment, hasMedia, startPin }: { token: string; postId: string; pending: PendingPin | null; clearPending: () => void; onComment: (comment: ClientComment) => void; hasMedia: boolean; startPin: () => void }) {
  const [name, setName] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setName(readName()) }, [])
  useEffect(() => { if (pending) textRef.current?.focus() }, [pending])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (name.trim().length < 2) { setError("Informe seu nome."); return }
    if (!body.trim()) return
    setSending(true)
    setError("")
    try {
      const comment = await publicFetch(`${encodeURIComponent(token)}/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        body: JSON.stringify({ authorName: name.trim(), body: body.trim(), ...(pending ? pending : {}) }),
      })
      saveName(name.trim())
      onComment(comment as ClientComment)
      setBody("")
      clearPending()
      setSent(true)
      window.setTimeout(() => setSent(false), 2500)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar.")
    } finally {
      setSending(false)
    }
  }

  return <form onSubmit={submit} className="sticky bottom-0 z-20 border-t border-slate-100 bg-white p-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4">
    {pending && <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-700"><MapPin size={12} />Marcador na mídia {pending.mediaIndex + 1}<button type="button" onClick={clearPending} className="ml-auto flex h-5 w-5 items-center justify-center rounded hover:bg-indigo-100" aria-label="Remover marcador"><CloseIcon size={12} /></button></p>}
    <div className="flex gap-2">
      {(body.trim() || name) && <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Seu nome" autoComplete="name" className="h-9 w-32 shrink-0 rounded-lg border border-slate-200 px-2 text-sm focus:border-indigo-500 focus:outline-none sm:w-40" aria-label="Seu nome" />}
      {hasMedia && !pending && <button type="button" onClick={startPin} className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"><MapPin size={13} />Marcar ponto</button>}
    </div>
    <div className="mt-2 flex items-end gap-2">
      <textarea ref={textRef} value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} rows={2} placeholder={pending ? "O que deve mudar neste ponto?" : "Deixe sua observação sobre este post…"}
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit(event) }}
        className="min-h-[2.5rem] min-w-0 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" aria-label="Observação" />
      <button type="submit" disabled={sending || !body.trim()} aria-label="Enviar observação" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"><Send size={16} /></button>
    </div>
    <div className="mt-1 flex items-center justify-between text-[11px]">
      <span className={cn(error ? "text-rose-600" : sent ? "text-emerald-600" : "text-slate-400")} role="status">{error || (sent ? "Observação enviada. Obrigado!" : "Sua observação fica visível para a equipe.")}</span>
      <span className="text-slate-400">{body.length}/1000</span>
    </div>
  </form>
}

function EmptyState() {
  return <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/70">
    <CalendarDays className="mx-auto text-slate-300" size={36} />
    <p className="mt-3 font-semibold text-slate-800">Nada por aqui ainda</p>
    <p className="mt-1 text-sm text-slate-500">Quando novos posts forem agendados, eles aparecem neste link automaticamente.</p>
  </div>
}

function LoadingSkeleton() {
  return <div className="min-h-dvh bg-[#f6f7fb]" role="status" aria-label="Carregando">
    <div className="h-56 animate-pulse bg-gradient-to-br from-indigo-500 to-fuchsia-500 opacity-80" />
    <div className="mx-auto mt-5 max-w-5xl space-y-3 px-4">
      <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-white" />)}</div>
      {[0, 1, 2].map((index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />)}
    </div>
  </div>
}

function CenteredMessage({ title, text, onRetry }: { title: string; text: string; onRetry?: () => void }) {
  return <div className="flex min-h-dvh items-center justify-center bg-[#f6f7fb] p-6">
    <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
      <CalendarDays className="mx-auto text-indigo-400" size={36} />
      <h1 className="mt-3 text-lg font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button>}
    </div>
  </div>
}
