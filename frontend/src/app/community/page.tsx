"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Heart, HelpCircle, LayoutGrid, List, MessageCircle, Plus, RefreshCw, Search, Send, Smile, Sparkles, Trash2, Users, X, Zap } from "lucide-react"
import toast from "react-hot-toast"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AvatarImage } from "@/components/ui/avatar-image"
import { PageHeader } from "@/components/layout/PageHeader"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { currentLocale, tr, useLang, useT } from "@/lib/i18n"

type Intent = "question" | "complaint" | "praise" | "other"

type CommentItem = {
  id: string
  text: string
  username?: string
  avatarUrl?: string | null
  timestamp?: string
  like_count?: number | null
  mediaId: string
  mediaCaption?: string | null
  mediaUrl?: string | null
  permalink?: string | null
  mediaTimestamp?: string | null
  mediaLikeCount?: number | null
  mediaCommentsCount?: number | null
  replyCount?: number
  answered?: boolean
  firstReplyAt?: string | null
  intent?: Intent
}

type CommentsResponse = { available?: boolean; comments?: CommentItem[]; message?: string }

type SortKey = "recent" | "engagement" | "comments" | "unanswered"
type StatusFilter = "all" | "unanswered" | "answered"
type IntentFilter = "all" | Intent

const INTENT_PLURAL: Record<Exclude<Intent, "other">, string> = { question: "Perguntas", complaint: "Reclamações", praise: "Elogios" }
const INTENTS: Record<Intent, { label: string; className: string; icon: typeof HelpCircle }> = {
  question: { label: "Pergunta", className: "bg-sky-500", icon: HelpCircle },
  complaint: { label: "Reclamação", className: "bg-rose-500", icon: AlertTriangle },
  praise: { label: "Elogio", className: "bg-emerald-500", icon: Smile },
  other: { label: "Outro", className: "bg-slate-400", icon: MessageCircle },
}

const SORTS: Record<SortKey, string> = {
  recent: "Mais recentes",
  engagement: "Mais engajamento do post",
  comments: "Mais comentários",
  unanswered: "Não respondidos primeiro",
}

const DEFAULT_QUICK_REPLIES = [
  "Obrigado pelo carinho, {nome}! 💜",
  "Oi {nome}! Te chamamos no direct com todos os detalhes 😉",
  "Que bom que gostou, {nome}! Conta pra gente o que achou depois.",
  "Sentimos muito, {nome}. Pode nos chamar no direct para resolvermos?",
]

const time = (value?: string | null) => (value ? new Date(value).getTime() || 0 : 0)

function timeAgo(value?: string | null) {
  if (!value) return ""
  const minutes = Math.max(0, Math.round((Date.now() - time(value)) / 60000))
  if (minutes < 1) return tr("agora")
  if (minutes < 60) return tr("há {count} min", { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return tr("há {count} h", { count: hours })
  const days = Math.round(hours / 24)
  if (days < 30) return tr("há {count} d", { count: days })
  return new Date(value).toLocaleDateString(currentLocale())
}

function formatDuration(minutes: number | null) {
  if (minutes === null) return "—"
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  const fixed = hours.toFixed(hours < 10 ? 1 : 0)
  if (hours < 48) return `${currentLocale() === "pt-BR" ? fixed.replace(".", ",") : fixed} h`
  return `${Math.round(hours / 24)} d`
}

const formatNumber = (value?: number | null) => (typeof value === "number" ? value.toLocaleString(currentLocale()) : "—")

/** Fills the `{nome}` (or English `{name}`) placeholder of a quick-reply template. */
const fillName = (template: string, handle: string) => template.replaceAll("{nome}", handle).replaceAll("{name}", handle)

/** Same math as the backend summary, recomputed locally so optimistic changes show up at once. */
function summarize(comments: CommentItem[], fallbackName = "usuário") {
  const total = comments.length
  const answered = comments.filter((comment) => comment.answered).length
  const delays = comments
    .filter((comment) => comment.answered && comment.firstReplyAt && comment.timestamp)
    .map((comment) => (time(comment.firstReplyAt) - time(comment.timestamp)) / 60000)
    .filter((delay) => Number.isFinite(delay) && delay >= 0)
  const intents: Record<Intent, number> = { question: 0, complaint: 0, praise: 0, other: 0 }
  const fans = new Map<string, { username: string; comments: number; unanswered: number; avatarUrl?: string | null }>()
  for (const comment of comments) {
    intents[comment.intent || "other"] += 1
    const username = comment.username || fallbackName
    const fan = fans.get(username) || { username, comments: 0, unanswered: 0 }
    fan.comments += 1
    if (!fan.avatarUrl && comment.avatarUrl) fan.avatarUrl = comment.avatarUrl
    if (!comment.answered) fan.unanswered += 1
    fans.set(username, fan)
  }
  return {
    total,
    answered,
    unanswered: total - answered,
    responseRate: total ? Math.round((answered / total) * 100) : null,
    avgResponseMinutes: delays.length ? Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length) : null,
    intents,
    topFans: Array.from(fans.values()).sort((left, right) => right.comments - left.comments).slice(0, 8),
  }
}

function useQuickReplies(accountId: string) {
  const key = `community-quick-replies:${accountId}`
  const t = useT()
  // null = untouched defaults, shown in the current language.
  const [stored, setStored] = useState<string[] | null>(null)
  const replies = stored ?? DEFAULT_QUICK_REPLIES.map((reply) => t(reply))
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key)
      const parsed = stored ? JSON.parse(stored) : null
      if (Array.isArray(parsed)) setStored(parsed.filter((item) => typeof item === "string").slice(0, 20))
    } catch { /* storage may be unavailable */ }
  }, [key])
  const save = (next: string[]) => {
    setStored(next)
    try { window.localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
  }
  return { replies, add: (text: string) => save([...replies, text].slice(0, 20)), remove: (index: number) => save(replies.filter((_, position) => position !== index)) }
}

export default function CommunityPage() {
  const { accountId, activeAccount, isLoading: accountLoading } = useActiveAccount()
  const t = useT()
  if (accountLoading) return <CommunitySkeleton />
  if (!activeAccount) return <Card className="mx-auto max-w-xl p-10 text-center"><Users className="mx-auto mb-3 text-indigo-600" size={28}/><h2 className="text-xl font-bold text-slate-900">{t("Conecte uma conta para abrir a comunidade")}</h2><p className="mt-2 text-sm text-slate-500">{t("Os comentários são carregados diretamente da conta profissional selecionada.")}</p></Card>
  return <AccountCommunity key={accountId} accountId={accountId} username={activeAccount.igUsername} />
}

function CommunitySkeleton() {
  return <div className="space-y-6">
    <Skeleton className="h-16 w-full max-w-md"/>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24"/>)}</div>
    <Skeleton className="h-12"/>
    <div className="space-y-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-48"/>)}</div>
  </div>
}

function AccountCommunity({ accountId, username }: { accountId: string; username: string }) {
  const queryClient = useQueryClient()
  const t = useT()
  const queryKey = useMemo(() => ["community-comments", accountId], [accountId])
  const query = useQuery({
    queryKey,
    queryFn: () => api.getComments(accountId) as Promise<CommentsResponse>,
    staleTime: 60_000,
    retry: 1,
  })
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [intent, setIntent] = useState<IntentFilter>("all")
  const [sort, setSort] = useState<SortKey>("unanswered")
  const [view, setView] = useState<"posts" | "list">("posts")
  const quick = useQuickReplies(accountId)

  const comments = useMemo(() => query.data?.comments || [], [query.data])
  const summary = useMemo(() => summarize(comments, t("usuário")), [comments, t])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase().replace(/^@/, "")
    return comments.filter((comment) => {
      if (status === "answered" && !comment.answered) return false
      if (status === "unanswered" && comment.answered) return false
      if (intent !== "all" && (comment.intent || "other") !== intent) return false
      if (term && !`${comment.username || ""} ${comment.text} ${comment.mediaCaption || ""}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [comments, search, status, intent])

  const sortComments = (items: CommentItem[]) => [...items].sort((left, right) => {
    if (sort === "unanswered" && Boolean(left.answered) !== Boolean(right.answered)) return left.answered ? 1 : -1
    return time(right.timestamp) - time(left.timestamp)
  })

  const groups = useMemo(() => {
    const byMedia = new Map<string, CommentItem[]>()
    for (const comment of filtered) byMedia.set(comment.mediaId, [...(byMedia.get(comment.mediaId) || []), comment])
    const list = Array.from(byMedia.entries()).map(([mediaId, items]) => {
      const first = items[0]
      const engagement = (first.mediaLikeCount || 0) + (first.mediaCommentsCount || 0)
      return { mediaId, first, items, engagement, unanswered: items.filter((item) => !item.answered).length, latest: Math.max(...items.map((item) => time(item.timestamp))) }
    })
    return list.sort((left, right) => {
      if (sort === "engagement") return right.engagement - left.engagement || right.latest - left.latest
      if (sort === "comments") return right.items.length - left.items.length || right.latest - left.latest
      if (sort === "unanswered") return right.unanswered - left.unanswered || right.latest - left.latest
      return right.latest - left.latest
    })
  }, [filtered, sort])

  const setComments = (updater: (items: CommentItem[]) => CommentItem[]) => {
    queryClient.setQueryData<CommentsResponse>(queryKey, (current) => current ? { ...current, comments: updater(current.comments || []) } : current)
  }

  const replyMutation = useMutation({
    mutationFn: ({ comment, message }: { comment: CommentItem; message: string }) => api.replyComment({ accountId, mediaId: comment.mediaId, commentId: comment.id, message }),
    onMutate: async ({ comment }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<CommentsResponse>(queryKey)
      const now = new Date().toISOString()
      setComments((items) => items.map((item) => item.id === comment.id ? { ...item, answered: true, firstReplyAt: item.firstReplyAt || now, replyCount: (item.replyCount || 0) + 1 } : item))
      return { previous }
    },
    onError: (error, _values, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      toast.error(error instanceof Error ? error.message : t("Não foi possível responder este comentário."))
    },
    onSuccess: () => toast.success(t("Resposta publicada no Instagram.")),
  })

  const deleteMutation = useMutation({
    mutationFn: (comment: CommentItem) => api.deleteComment({ accountId, mediaId: comment.mediaId, commentId: comment.id }),
    onMutate: async (comment) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<CommentsResponse>(queryKey)
      setComments((items) => items.filter((item) => item.id !== comment.id))
      return { previous }
    },
    onError: (error, _comment, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      toast.error(error instanceof Error ? error.message : t("Não foi possível excluir o comentário."))
    },
    onSuccess: () => toast.success(t("Comentário excluído.")),
  })

  const reply = async (comment: CommentItem, message: string) => {
    try { await replyMutation.mutateAsync({ comment, message }); return true } catch { return false }
  }
  const remove = (comment: CommentItem) => {
    if (window.confirm(t("Excluir o comentário de @{name} no Instagram? Essa ação não pode ser desfeita.", { name: comment.username || t("usuário") }))) deleteMutation.mutate(comment)
  }

  const available = !query.isError && query.data?.available !== false
  const errorMessage = query.error instanceof Error ? query.error.message : query.data?.message
  const hasFilters = Boolean(search.trim()) || status !== "all" || intent !== "all"
  const clearFilters = () => { setSearch(""); setStatus("all"); setIntent("all") }

  return <div className="space-y-6 animate-fade-in">
    <PageHeader
      eyebrow={t("Relacionamento")}
      title={t("Comunidade")}
      description={<>{t("Comentários das publicações recentes de")} <strong className="font-semibold text-slate-700">@{username}</strong> {t("no Instagram, organizados por post e prioridade.")}</>}
      actions={<Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching} className="gap-2"><RefreshCw size={15} className={query.isFetching ? "animate-spin" : ""}/>{t("Atualizar")}</Button>}
    />

    {query.isLoading ? <CommunitySkeleton /> : !available ? (
      <Card className="border-amber-200 bg-amber-50/80 p-5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-600"/><div className="min-w-0"><h3 className="font-bold text-amber-900">{t("Não foi possível carregar os comentários")}</h3><p className="mt-1 text-sm leading-6 text-amber-800">{errorMessage || t("Tente atualizar novamente. Se o erro persistir, confira a conexão e as permissões da conta.")}</p><Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => void query.refetch()}><RefreshCw size={14}/>{t("Tentar de novo")}</Button></div></div></Card>
    ) : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={MessageCircle} tone="indigo" label={t("Comentários")} value={formatNumber(summary.total)} hint={t("nas publicações recentes")}/>
        <Kpi icon={Clock} tone="amber" label={t("Sem resposta")} value={formatNumber(summary.unanswered)} hint={summary.unanswered ? t("aguardando você") : t("tudo em dia")} onClick={() => setStatus("unanswered")}/>
        <Kpi icon={CheckCircle2} tone="emerald" label={t("Taxa de resposta")} value={summary.responseRate === null ? "—" : `${summary.responseRate}%`} hint={t("{count} respondidos", { count: formatNumber(summary.answered) })} progress={summary.responseRate}/>
        <Kpi icon={Zap} tone="sky" label={t("Tempo médio")} value={formatDuration(summary.avgResponseMinutes)} hint={t("até a sua 1ª resposta")}/>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <Card className="space-y-3 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Buscar por texto, @usuário ou legenda")} className="pl-9" aria-label={t("Buscar comentários")}/></div>
              <div className="flex gap-2">
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label={t("Ordenar")} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:flex-none">
                  {(Object.keys(SORTS) as SortKey[]).map((key) => <option key={key} value={key}>{t(SORTS[key])}</option>)}
                </select>
                <div className="flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                  <button type="button" onClick={() => setView("posts")} aria-pressed={view === "posts"} title={t("Agrupar por post")} className={`rounded-md px-2.5 ${view === "posts" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}><LayoutGrid size={16}/></button>
                  <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} title={t("Lista única")} className={`rounded-md px-2.5 ${view === "list" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}><List size={16}/></button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto px-px py-1">
              {([["all", "Todos", summary.total], ["unanswered", "Sem resposta", summary.unanswered], ["answered", "Respondidos", summary.answered]] as const).map(([key, label, count]) => <Chip key={key} active={status === key} onClick={() => setStatus(key)}>{t(label)} <span className="opacity-60">{count}</span></Chip>)}
              <span className="mx-1 w-px shrink-0 bg-slate-200"/>
              {(Object.keys(INTENTS) as Intent[]).filter((key) => key !== "other").map((key) => { const Icon = INTENTS[key].icon; return <Chip key={key} active={intent === key} onClick={() => setIntent(intent === key ? "all" : key)}><Icon size={13}/>{t(INTENT_PLURAL[key])} <span className="opacity-60">{summary.intents[key]}</span></Chip> })}
            </div>
          </Card>

          {!comments.length ? (
            <Card className="p-12 text-center"><MessageCircle className="mx-auto mb-3 text-slate-300" size={34}/><h3 className="section-title">{t("Nenhum comentário ainda")}</h3><p className="mt-1 text-sm text-slate-500">{t("A Meta não retornou comentários nas publicações recentes desta conta.")}</p></Card>
          ) : !filtered.length ? (
            <Card className="p-10 text-center"><Search className="mx-auto mb-3 text-slate-300" size={30}/><h3 className="section-title">{t("Nada encontrado com esses filtros")}</h3>{hasFilters && <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>{t("Limpar filtros")}</Button>}</Card>
          ) : view === "posts" ? (
            groups.map((group) => <PostGroup key={group.mediaId} group={group} comments={sortComments(group.items)} quickReplies={quick.replies} accountId={accountId} onReply={reply} onDelete={remove}/>)
          ) : (
            <Card className="divide-y divide-slate-100 overflow-hidden">{sortComments(filtered).map((comment) => <CommentRow key={comment.id} comment={comment} showPost quickReplies={quick.replies} accountId={accountId} onReply={reply} onDelete={remove}/>)}</Card>
          )}
        </div>

        <aside className="space-y-4">
          <IntentBreakdown intents={summary.intents} total={summary.total} active={intent} onSelect={setIntent}/>
          <TopFans fans={summary.topFans} onSelect={(name) => { setSearch(`@${name}`); setStatus("all") }}/>
          <QuickRepliesManager replies={quick.replies} onAdd={quick.add} onRemove={quick.remove}/>
        </aside>
      </div>
    </>}
  </div>
}

const TONES = {
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-slate-100 text-slate-500",
  emerald: "bg-slate-100 text-slate-500",
  sky: "bg-slate-100 text-slate-500",
}

function Kpi({ icon: Icon, tone, label, value, hint, progress, onClick }: { icon: typeof MessageCircle; tone: keyof typeof TONES; label: string; value: string; hint: string; progress?: number | null; onClick?: () => void }) {
  const body = <>
    <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium text-slate-500">{label}</p><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}><Icon size={15}/></span></div>
    <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
    {typeof progress === "number" ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, progress)}%` }}/></div> : <p className="mt-1 truncate text-xs text-slate-400">{hint}</p>}
  </>
  return <Card className="p-4">{onClick ? <button type="button" onClick={onClick} className="w-full text-left">{body}</button> : body}</Card>
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${active ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>{children}</button>
}

function IntentBadge({ intent }: { intent?: Intent }) {
  const t = useT()
  const meta = INTENTS[intent || "other"]
  if (!intent || intent === "other") return null
  const Icon = meta.icon
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"><span className={`h-1.5 w-1.5 rounded-full ${meta.className}`}/><Icon size={11} className="text-slate-400"/>{t(meta.label)}</span>
}

type Group = { mediaId: string; first: CommentItem; items: CommentItem[]; unanswered: number }
type RowActions = { quickReplies: string[]; accountId: string; onReply: (comment: CommentItem, message: string) => Promise<boolean>; onDelete: (comment: CommentItem) => void }

function PostGroup({ group, comments, ...actions }: { group: Group; comments: CommentItem[] } & RowActions) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()
  const hidden = comments.length - 3
  const visible = expanded ? comments : comments.slice(0, 3)
  const { first } = group
  return <Card className="overflow-hidden">
    <div className="flex gap-3 border-b border-slate-100 bg-slate-50/60 p-3 sm:p-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-200 sm:h-20 sm:w-20"><AvatarImage src={first.mediaUrl} fallback={<div className="flex h-full w-full items-center justify-center text-slate-400"><MessageCircle size={20}/></div>}/></div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-800">{first.mediaCaption || t("Publicação sem legenda")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Heart size={12}/>{formatNumber(first.mediaLikeCount)}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle size={12}/>{formatNumber(first.mediaCommentsCount ?? group.items.length)}</span>
          {first.mediaTimestamp && <span>{timeAgo(first.mediaTimestamp)}</span>}
          {group.unanswered > 0 ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{t("{count} sem resposta", { count: group.unanswered })}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">{t("Tudo respondido")}</span>}
          {first.permalink && <a href={first.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">{t("Abrir")} <ExternalLink size={11}/></a>}
        </div>
      </div>
    </div>
    <div className="divide-y divide-slate-100">{visible.map((comment) => <CommentRow key={comment.id} comment={comment} {...actions}/>)}</div>
    {comments.length > 3 && <button type="button" onClick={() => setExpanded(!expanded)} className="w-full border-t border-slate-100 py-2.5 text-xs font-semibold text-indigo-600 hover:bg-slate-50">{expanded ? t("Mostrar menos") : hidden === 1 ? t("Ver mais 1 comentário(s)") : t("Ver mais {count} comentário(s)", { count: hidden })}</button>}
  </Card>
}

function CommentRow({ comment, showPost, quickReplies, accountId, onReply, onDelete }: { comment: CommentItem; showPost?: boolean } & RowActions) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const t = useT()
  const { locale } = useLang()
  const name = comment.username || t("usuário")

  const suggest = async () => {
    setAiLoading(true)
    try {
      const result = await api.generateAi({ mode: "reply", accountId, comment: comment.text }) as { result?: { response?: string } }
      const response = result.result?.response || ""
      if (response) { setDraft(response); toast.success(t("Resposta sugerida pela IA.")) }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível gerar a resposta."))
    } finally { setAiLoading(false) }
  }

  const send = async () => {
    const text = draft.trim()
    if (!text) return toast.error(t("Escreva ou escolha uma resposta antes de enviar."))
    setSending(true)
    const ok = await onReply(comment, text)
    setSending(false)
    if (ok) { setDraft(""); setOpen(false) }
  }

  return <div className={`p-3 sm:p-4 ${comment.answered ? "" : "border-l-2 border-amber-300"}`}>
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-semibold text-slate-600"><AvatarImage src={comment.avatarUrl} alt={`@${name}`} fallback={name[0].toUpperCase()}/></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-bold text-slate-900">@{name}</p>
          <span className="text-xs text-slate-400">{timeAgo(comment.timestamp)}</span>
          <IntentBadge intent={comment.intent}/>
          {comment.answered ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={12}/>{t("Respondido")}</span> : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"><Clock size={12}/>{t("comentário::Aguardando")}</span>}
        </div>
        <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{comment.text}</p>
        {showPost && <p className="mt-1 truncate text-xs text-slate-400">{t("em: {caption}", { caption: comment.mediaCaption || t("publicação sem legenda") })}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {typeof comment.like_count === "number" && <span className="mr-2 inline-flex items-center gap-1 text-xs text-slate-500"><Heart size={12}/>{comment.like_count.toLocaleString(locale)}</span>}
          {!!comment.replyCount && <span className="mr-2 text-xs text-slate-500">{comment.replyCount === 1 ? t("1 resposta(s)") : t("{count} resposta(s)", { count: comment.replyCount })}</span>}
          <Button type="button" size="sm" variant={open ? "secondary" : "ghost"} onClick={() => setOpen(!open)} className="h-8 gap-1.5 text-indigo-700"><Send size={13}/>{t("Responder")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(comment)} className="h-8 gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={13}/>{t("Excluir")}</Button>
          {comment.permalink && showPost && <a href={comment.permalink} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 px-2 text-xs font-semibold text-slate-500 hover:text-indigo-600">{t("Post")} <ExternalLink size={11}/></a>}
        </div>
        {open && <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
          {quickReplies.length > 0 && <div className="flex gap-1.5 overflow-x-auto px-px py-1">{quickReplies.map((template, index) => <button key={index} type="button" onClick={() => setDraft(fillName(template, `@${name}`))} className="max-w-[220px] shrink-0 truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700" title={template}>{fillName(template, `@${name}`)}</button>)}</div>}
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void send() }} maxLength={1000} autoFocus placeholder={t("Responder @{name}...", { name })} className="min-h-20 w-full resize-y rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"/>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">{draft.length}/1000 · {t("Ctrl+Enter envia")}</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void suggest()} disabled={aiLoading} className="gap-1.5 text-indigo-700"><Sparkles size={13}/>{aiLoading ? t("Gerando...") : t("IA")}</Button>
              <Button type="button" size="sm" onClick={() => void send()} disabled={sending || !draft.trim()} className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"><Send size={13}/>{sending ? t("Enviando...") : t("Enviar")}</Button>
            </div>
          </div>
        </div>}
      </div>
    </div>
  </div>
}

function IntentBreakdown({ intents, total, active, onSelect }: { intents: Record<Intent, number>; total: number; active: IntentFilter; onSelect: (intent: IntentFilter) => void }) {
  const t = useT()
  return <Card className="p-4">
    <h3 className="section-title">{t("Tipos de interação")}</h3>
    <p className="mt-0.5 text-xs text-slate-400">{t("Estimativa por palavras-chave")}</p>
    <div className="mt-3 space-y-2.5">{(Object.keys(INTENTS) as Intent[]).map((key) => {
      const pct = total ? Math.round((intents[key] / total) * 100) : 0
      return <button key={key} type="button" onClick={() => onSelect(active === key ? "all" : key)} className={`block w-full rounded-lg p-1.5 text-left transition-colors ${active === key ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
        <div className="flex items-center justify-between text-xs"><span className="inline-flex items-center gap-1.5 font-medium text-slate-700"><span className={`h-1.5 w-1.5 rounded-full ${INTENTS[key].className}`}/>{t(INTENTS[key].label)}</span><span className="text-slate-500">{intents[key]} · {pct}%</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${key === "complaint" ? "bg-rose-400" : "bg-slate-400"}`} style={{ width: `${pct}%` }}/></div>
      </button>
    })}</div>
  </Card>
}

function TopFans({ fans, onSelect }: { fans: Array<{ username: string; comments: number; unanswered: number; avatarUrl?: string | null }>; onSelect: (username: string) => void }) {
  const t = useT()
  return <Card className="p-4">
    <h3 className="section-title">{t("Fãs mais ativos")}</h3>
    {!fans.length ? <p className="mt-2 text-sm text-slate-500">{t("Ainda sem comentários.")}</p> : <ol className="mt-3 space-y-1">{fans.map((fan, index) => <li key={fan.username}><button type="button" onClick={() => onSelect(fan.username)} className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-slate-50">
      <span className="w-4 text-xs font-semibold text-slate-400">{index + 1}</span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-600"><AvatarImage src={fan.avatarUrl} fallback={fan.username[0]?.toUpperCase()}/></span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">@{fan.username}</span>
      <span className="text-xs text-slate-500">{fan.comments}</span>
      {fan.unanswered > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" title={t("{count} sem resposta", { count: fan.unanswered })}/>}
    </button></li>)}</ol>}
  </Card>
}

function QuickRepliesManager({ replies, onAdd, onRemove }: { replies: string[]; onAdd: (text: string) => void; onRemove: (index: number) => void }) {
  const [text, setText] = useState("")
  const t = useT()
  const add = () => { const value = text.trim(); if (!value) return; onAdd(value); setText("") }
  return <Card className="p-4">
    <h3 className="section-title">{t("Respostas rápidas")}</h3>
    <p className="mt-0.5 text-xs text-slate-400">{t("Use {nome} para inserir o @ do fã. Salvas neste navegador.")}</p>
    <ul className="mt-3 space-y-1.5">{replies.map((reply, index) => <li key={index} className="group flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"><span className="min-w-0 flex-1 break-words">{reply}</span><button type="button" onClick={() => onRemove(index)} aria-label={t("Remover resposta rápida")} className="text-slate-400 hover:text-rose-600"><X size={13}/></button></li>)}</ul>
    <div className="mt-2 flex gap-2"><Input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add() }} maxLength={300} placeholder={t("Nova resposta...")} className="h-9 text-xs"/><Button type="button" size="sm" variant="outline" onClick={add} className="h-9 shrink-0" aria-label={t("Adicionar resposta rápida")}><Plus size={14}/></Button></div>
  </Card>
}
