import type { ComponentType, ReactNode } from "react"
import { SiInstagram, SiMessenger, SiThreads, SiX } from "@icons-pack/react-simple-icons"
import { cn } from "@/lib/utils"

export type Platform = "INSTAGRAM" | "FACEBOOK" | "THREADS" | "X"
export type Trigger = "COMMENT_ANY" | "COMMENT_KEYWORD" | "MESSAGE_ANY" | "MESSAGE_KEYWORD"
export type ReplyMode = "TEMPLATE" | "AI"
export type Rule = { id: string; name: string; trigger: Trigger; keywords: string[]; replyMode: ReplyMode; enabled: boolean; continueConversation: boolean; publicCommentReply?: string | null; privateCommentReply?: string | null; directMessageReply?: string | null }
export type TemplateType = "PUBLIC_COMMENT" | "PRIVATE_COMMENT" | "DIRECT_MESSAGE"
export type Template = { id: string; name: string; type: TemplateType; content: string }
export type Agent = { id?: string; updatedAt?: string; enabled: boolean; autoSend: boolean; tone: string; instructions: string; knowledgeBase: string; fallback: string; memoryDays: number; maxRepliesPerHour: number }
export type Execution = { id: string; status: string; eventType: Trigger; eventText?: string | null; responseText?: string | null; error?: string | null; senderId?: string | null; senderUsername?: string | null; createdAt: string; eventAt: string; publicReplySent: boolean; privateReplySent: boolean; humanReply?: boolean }
export type ConversationState = "BOT" | "HUMAN" | "STOPPED"
export type Conversation = { id: string; senderId?: string | null; senderUsername?: string | null; kind: string; state: ConversationState; stateReason?: string | null; lastInboundAt: string; executions: Execution[] }
export type AutomationStatus = { webhookConfigured: boolean; canAutomateComments: boolean; canAutomateMessages: boolean; permissionCheckError?: string | null; collectionMode: string; syncError?: string | null; lastSyncAt?: string | null; activity: { lastEventProcessedAt: string | null; lastReplyAcceptedAt: string | null } }
export type Workspace = { automations: Rule[]; templates: Template[]; agent: Agent | null; executions: Execution[]; conversations: Conversation[]; status: AutomationStatus }

/** Editable rule state; keywords are chips in the UI. */
export type RuleDraft = { name: string; trigger: Trigger; keywords: string[]; replyMode: ReplyMode; publicCommentReply: string; privateCommentReply: string; directMessageReply: string; continueConversation: boolean }

type Network = { label: string; channel: string; description: string; Icon: ComponentType<{ size?: number | string; className?: string; color?: string }>; brand: string; tint: string }
export const NETWORKS: Record<Platform, Network> = {
  INSTAGRAM: { label: "Instagram", channel: "Comentários e Direct", description: "Responda comentários e mensagens do Direct.", Icon: SiInstagram, brand: "#E4405F", tint: "from-fuchsia-500 via-pink-500 to-amber-400" },
  FACEBOOK: { label: "Facebook", channel: "Messenger da Página", description: "Responda mensagens que chegam no Messenger da sua Página.", Icon: SiMessenger, brand: "#0866FF", tint: "from-sky-500 to-blue-600" },
  X: { label: "X", channel: "Respostas a menções", description: "Responda publicamente quem mencionar sua conta no X.", Icon: SiX, brand: "#000000", tint: "from-neutral-800 to-black" },
  THREADS: { label: "Threads", channel: "Respostas públicas", description: "Responda publicamente quem comentar nos seus posts.", Icon: SiThreads, brand: "#101010", tint: "from-slate-700 to-black" },
}

export function NetworkBadge({ platform, size = 34 }: { platform: Platform; size?: number }) {
  const network = NETWORKS[platform]
  return <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", network.tint)} style={{ width: size, height: size }}>
    <network.Icon size={Math.round(size * 0.52)} color="white" />
  </span>
}

export const TRIGGER_KIND = (trigger: Trigger) => (trigger.startsWith("COMMENT_") ? "COMMENT" : "MESSAGE") as "COMMENT" | "MESSAGE"
export const usesKeywords = (trigger: Trigger) => trigger.endsWith("_KEYWORD")
export const triggerFor = (kind: "COMMENT" | "MESSAGE", keywords: boolean) => `${kind}_${keywords ? "KEYWORD" : "ANY"}` as Trigger

export const allowedKinds = (platform: Platform): Array<"COMMENT" | "MESSAGE"> =>
  platform === "THREADS" || platform === "X" ? ["COMMENT"] : platform === "FACEBOOK" ? ["MESSAGE"] : ["COMMENT", "MESSAGE"]

export const templateTypesFor = (platform: Platform): TemplateType[] =>
  platform === "THREADS" || platform === "X" ? ["PUBLIC_COMMENT"] : platform === "FACEBOOK" ? ["DIRECT_MESSAGE"] : ["DIRECT_MESSAGE", "PUBLIC_COMMENT", "PRIVATE_COMMENT"]

export const TEMPLATE_TYPE_NAMES: Record<TemplateType, string> = {
  PUBLIC_COMMENT: "Resposta pública no comentário",
  PRIVATE_COMMENT: "Mensagem privada para quem comentou",
  DIRECT_MESSAGE: "Resposta a mensagem privada",
}

export const EXECUTION_STATUS: Record<string, { label: string; tone: string }> = {
  RECEIVED: { label: "Recebido", tone: "bg-slate-100 text-slate-700" },
  PROCESSING: { label: "Processando", tone: "bg-sky-50 text-sky-700" },
  SENT: { label: "Respondido", tone: "bg-emerald-50 text-emerald-700" },
  NEEDS_REVIEW: { label: "Aguardando sua revisão", tone: "bg-amber-50 text-amber-800" },
  BLOCKED: { label: "Bloqueado", tone: "bg-rose-50 text-rose-700" },
  SKIPPED: { label: "Ignorado", tone: "bg-slate-100 text-slate-600" },
  FAILED: { label: "Falhou", tone: "bg-rose-50 text-rose-700" },
}

export const blankAgent: Agent = { enabled: false, autoSend: false, tone: "Humano, cordial e direto", instructions: "", knowledgeBase: "", fallback: "Vou chamar alguém da equipe para continuar com você.", memoryDays: 7, maxRepliesPerHour: 10 }
export const blankRule = (platform: Platform): RuleDraft => ({ name: "", trigger: platform === "THREADS" || platform === "X" ? "COMMENT_KEYWORD" : "MESSAGE_KEYWORD", keywords: [], replyMode: "TEMPLATE", publicCommentReply: "", privateCommentReply: "", directMessageReply: "", continueConversation: false })

export const inputClass = "mt-1.5 w-full min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
export const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Ainda não houve"
export const contactName = (value: { id: string; senderId?: string | null; senderUsername?: string | null }) => value.senderUsername ? `@${value.senderUsername}` : `Contato ${(value.senderId || value.id).slice(-4)}`

export function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-700">{title}{children}{hint && <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">{hint}</span>}</label>
}

export function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs leading-5 text-indigo-900">{children}</p>
}

/** Big selectable tile used for the guided choices. */
export function ChoiceTile({ selected, onClick, icon, title, description, disabled }: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; description?: string; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected}
    className={cn("flex min-h-[64px] w-full items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50",
      selected ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-indigo-300")}>
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")}>{icon}</span>
    <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{title}</span>{description && <span className="mt-0.5 block text-xs leading-4 text-slate-500">{description}</span>}</span>
  </button>
}
