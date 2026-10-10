"use client"

import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Ban, Bot, Brain, Hand, MessageCircle, Send, UserRound } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { contactName, formatDate, inputClass, NETWORKS, type Conversation, type ConversationState, type Execution, type Platform, type Workspace } from "./shared"

type Run = (operation: () => Promise<unknown>, success: string) => Promise<void>

export const STATE_CHIPS: Record<ConversationState, { label: string; tone: string; Icon: typeof Bot }> = {
  BOT: { label: "Robô atendendo", tone: "bg-emerald-50 text-emerald-700", Icon: Bot },
  HUMAN: { label: "Com você", tone: "bg-amber-50 text-amber-800", Icon: UserRound },
  STOPPED: { label: "Não responder", tone: "bg-slate-100 text-slate-600", Icon: Ban },
}

function StateChip({ state }: { state: ConversationState }) {
  const t = useT()
  const chip = STATE_CHIPS[state]
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.tone}`}><chip.Icon size={11} />{t(chip.label)}</span>
}

function Avatar({ name }: { name: string }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">{(name.replace(/^@/, "")[0] || "?").toUpperCase()}</span>
}

/** Text box to review an AI suggestion and send it (used here and in the history). */
export function ReviewEditor({ item, platform, accountId, busy, run, disabled = false }: { item: Execution; platform: Platform; accountId: string; busy: boolean; run: Run; disabled?: boolean }) {
  const t = useT()
  const [text, setText] = useState(item.responseText ?? "")
  const maxLength = platform === "X" ? 280 : platform === "THREADS" ? 500 : 1000
  return <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
    <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900"><Hand size={13} />{t("Sugestão aguardando sua revisão")}</p>
    <textarea aria-label={t("Resposta para revisão")} className={inputClass} rows={3} maxLength={maxLength} value={text} onChange={(event) => setText(event.target.value)} />
    <div className="mt-2 flex justify-end"><Button size="sm" disabled={busy || disabled || !text.trim()} onClick={() => void run(() => api.sendReviewedAutomationReply(accountId, item.id, text.trim(), platform), t("Resposta enviada."))} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Send size={14} />{t("Enviar resposta")}</Button></div>
  </div>
}

export function ConversationsPanel({ platform, accountId, workspace, busy, run }: { platform: Platform; accountId: string; workspace: Workspace; busy: boolean; run: Run }) {
  const t = useT()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const open = (id: string) => {
    setConversationId(id)
    // On phones the chat sits below the list; bring it into view.
    if (window.matchMedia("(max-width: 767px)").matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  const detail = useQuery({
    queryKey: ["automation-conversation", platform, accountId, conversationId],
    queryFn: ({ signal }) => api.getAutomationConversation(accountId, conversationId!, platform, signal) as Promise<Conversation>,
    enabled: Boolean(conversationId),
    refetchInterval: 10_000,
  })
  const conversation = detail.data
  const network = NETWORKS[platform]
  const sorted = [...workspace.conversations].sort((a, b) => Number(b.state === "HUMAN") - Number(a.state === "HUMAN"))

  const resume = (item: Conversation) => {
    const consent = item.state === "STOPPED" ? window.confirm(t("A pessoa autorizou receber novas respostas automáticas? Confirme somente se ela autorizou.")) : false
    if (item.state === "STOPPED" && !consent) return
    void run(() => api.setAutomationConversationState(accountId, item.id, platform, "BOT", consent), t("O robô volta a responder as próximas mensagens."))
  }

  return <div className="grid items-start gap-4 md:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.25fr)]">
    <Card className="overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-slate-100 p-4 text-sm font-bold text-slate-900"><MessageCircle size={16} className="text-indigo-600" />{t("Conversas recentes")}</h2>
      <div className="max-h-[36vh] overflow-y-auto md:max-h-[65vh]">
        {sorted.map((item) => <button key={item.id} type="button" onClick={() => open(item.id)} className={`flex w-full items-start gap-3 border-b border-slate-100 p-3 text-left transition ${conversationId === item.id ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}>
          <Avatar name={contactName(item)} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-900">{contactName(item)}</span><span className="shrink-0 text-[10px] text-slate-400">{item.kind === "PUBLIC" ? t("Comentário") : t("Mensagem")}</span></span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">{item.executions[0]?.eventText || t("Sem texto")}</span>
            <span className="mt-1.5 block"><StateChip state={item.state} /></span>
          </span>
        </button>)}
        {!workspace.conversations.length && <div className="p-6 text-center"><network.Icon size={22} className="mx-auto text-slate-300" /><p className="mt-2 text-sm leading-6 text-slate-500">{t("As conversas aparecem aqui quando alguém comentar ou mandar mensagem e uma regra responder.")}</p></div>}
      </div>
    </Card>

    <Card ref={detailRef} className="min-w-0 scroll-mt-20 p-4">
      {!conversationId ? <div className="py-16 text-center text-slate-500"><MessageCircle size={28} className="mx-auto mb-3 text-slate-300" /><p className="text-sm">{t("Escolha uma conversa para acompanhar ou responder você mesmo.")}</p></div>
        : detail.isLoading ? <p className="text-sm text-slate-500">{t("Carregando conversa…")}</p>
        : detail.isError || !conversation ? <p className="text-sm text-rose-600">{t("Não foi possível abrir esta conversa.")}</p>
        : <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3"><Avatar name={contactName(conversation)} /><div><h2 className="font-bold text-slate-900">{contactName(conversation)}</h2><div className="mt-1"><StateChip state={conversation.state} /></div></div></div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || conversation.state === "HUMAN" || conversation.state === "STOPPED"} onClick={() => void run(() => api.setAutomationConversationState(accountId, conversation.id, platform, "HUMAN"), t("Você assumiu a conversa. O robô está pausado aqui."))}><UserRound size={14} />{t("Assumir conversa")}</Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || conversation.state === "BOT"} onClick={() => resume(conversation)}><Bot size={14} />{t("Devolver ao robô")}</Button>
            </div>
          </div>
          {conversation.stateReason && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{conversation.stateReason}</p>}
          <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">{[...conversation.executions].reverse().map((item) => <div key={item.id}>
            <div className="mr-8 rounded-2xl rounded-tl-sm bg-slate-100 p-3"><p className="whitespace-pre-wrap break-words text-sm text-slate-800">{item.eventText || t("Mensagem sem texto")}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(item.eventAt)}</p></div>
            {item.responseText && (item.publicReplySent || item.privateReplySent) && <div className="ml-8 mt-2 rounded-2xl rounded-tr-sm bg-indigo-600 p-3 text-white"><p className="whitespace-pre-wrap break-words text-sm">{item.responseText}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-indigo-100">{item.humanReply ? <><UserRound size={10} />{t("Você respondeu")}</> : <><Bot size={10} />{t("Resposta automática")}</>}</p></div>}
            {item.status === "NEEDS_REVIEW" && item.id === conversation.executions[0]?.id && <ReviewEditor item={item} platform={platform} accountId={accountId} busy={busy} run={run} disabled={conversation.state === "STOPPED"} />}
            {item.error && <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.error}</p>}
          </div>)}</div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <Button size="sm" variant="ghost" className="gap-1.5 text-slate-600" disabled={busy} onClick={() => { if (window.confirm(t("A IA vai esquecer o que foi conversado até aqui (o histórico continua visível). Continuar?"))) void run(() => api.forgetAutomationConversation(accountId, conversation.id, platform), t("Memória da conversa reiniciada.")) }}><Brain size={14} />{t("Reiniciar memória da IA")}</Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-slate-600" disabled={busy || conversation.state === "STOPPED"} onClick={() => void run(() => api.setAutomationConversationState(accountId, conversation.id, platform, "STOPPED"), t("Não vamos mais responder este contato automaticamente."))}><Ban size={14} />{t("Não responder mais")}</Button>
          </div>
        </>}
    </Card>
  </div>
}
