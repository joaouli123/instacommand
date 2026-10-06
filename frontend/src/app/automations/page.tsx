"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, Hand, History, MessageSquareText, MessagesSquare, RefreshCw, ShieldCheck, Sparkles, Zap } from "lucide-react"
import toast from "react-hot-toast"
import { api, fetchApi } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDate, NETWORKS, NetworkBadge, type Platform, type Workspace } from "@/components/automations/shared"
import { RulesPanel } from "@/components/automations/RulesPanel"
import { ConversationsPanel } from "@/components/automations/ConversationsPanel"
import { AgentPanel, HistoryPanel, TemplatesPanel } from "@/components/automations/SupportPanels"

const PLATFORMS: Platform[] = ["INSTAGRAM", "FACEBOOK", "THREADS"]

export default function AutomationsPage() {
  const { activeAccount, isLoading } = useActiveAccount()
  const [platform, setPlatform] = useState<Platform>("INSTAGRAM")
  const [threadId, setThreadId] = useState("")
  const threads = useQuery({ queryKey: ["threads-accounts"], queryFn: () => api.getThreadsAccounts() as Promise<Array<{ id: string; username: string }>> })
  const selectedThread = threads.data?.find((account) => account.id === threadId) || threads.data?.[0]
  const accountId = platform === "THREADS" ? selectedThread?.id : activeAccount?.id
  const username = platform === "THREADS" ? selectedThread?.username : platform === "FACEBOOK" ? activeAccount?.pageName || activeAccount?.igUsername : activeAccount?.igUsername

  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <header>
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Atendimento automático</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Automações</h1>
      <p className="mt-1 text-sm text-slate-500">Responda comentários e mensagens automaticamente — com respostas prontas ou com um assistente de IA — e assuma a conversa quando quiser.</p>
    </header>

    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Rede social">
      {PLATFORMS.map((item) => {
        const network = NETWORKS[item]
        const selected = platform === item
        return <button key={item} type="button" role="radio" aria-checked={selected} onClick={() => setPlatform(item)}
          className={cn("relative flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 text-center transition sm:flex-row sm:gap-3 sm:text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", selected ? "border-indigo-500 shadow-sm ring-1 ring-indigo-500" : "border-slate-200 hover:border-slate-300")}>
          <NetworkBadge platform={item} size={40} />
          <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900 sm:text-base">{network.label}</span><span className="hidden truncate text-xs text-slate-500 sm:block">{network.channel}</span></span>
          {selected && <CheckCircle2 size={18} className="absolute right-2 top-2 shrink-0 text-indigo-600 sm:static sm:ml-auto" />}
        </button>
      })}
    </div>

    {platform === "THREADS" && (threads.data?.length || 0) > 1 && <label className="block max-w-sm text-xs font-semibold text-slate-600">Conta do Threads<select className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={selectedThread?.id || ""} onChange={(event) => setThreadId(event.target.value)}>{threads.data?.map((account) => <option key={account.id} value={account.id}>@{account.username}</option>)}</select></label>}

    {(isLoading || (platform === "THREADS" && threads.isLoading)) ? <Card className="p-6 text-sm text-slate-500">Carregando contas…</Card>
      : accountId ? <AutomationWorkspace key={`${platform}:${accountId}`} accountId={accountId} username={username || "Conta conectada"} platform={platform} />
        : <Card className="flex flex-col items-center gap-3 p-8 text-center"><NetworkBadge platform={platform} size={48} /><p className="font-semibold text-slate-900">Conecte sua conta do {NETWORKS[platform].label}</p><p className="max-w-sm text-sm text-slate-500">Depois de conectar, você cria as respostas automáticas aqui.</p><Button asChild className="bg-indigo-600 text-white hover:bg-indigo-700"><Link href="/accounts">Ir para Contas</Link></Button></Card>}
  </div>
}

type Tab = "conversas" | "regras" | "respostas" | "assistente" | "historico"

function AutomationWorkspace({ accountId, username, platform }: { accountId: string; username: string; platform: Platform }) {
  const client = useQueryClient()
  const [tab, setTab] = useState<Tab | null>(null)
  const [busy, setBusy] = useState(false)
  const queryKey = ["automation-workspace", platform, accountId]
  const query = useQuery({ queryKey, queryFn: () => api.getAutomationWorkspace(accountId, platform) as Promise<Workspace>, refetchInterval: 15_000 })
  const workspace = query.data

  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ["automation-conversation", platform, accountId] })]) }
  const run = async (operation: () => Promise<unknown>, success: string) => {
    if (busy) return
    setBusy(true)
    try { await operation(); toast.success(success); await refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente.") }
    finally { setBusy(false) }
  }
  const authorizeReplies = async () => {
    const popup = window.open("about:blank", "_blank")
    if (!popup) return toast.error("Permita pop-ups para autorizar sem sair desta página.")
    popup.opener = null
    popup.document.body.textContent = "Abrindo autorização segura do Threads…"
    try { const response = await fetchApi("/auth/threads/url?automations=1") as { url: string }; popup.location.replace(response.url) }
    catch (error) { popup.close(); toast.error(error instanceof Error ? error.message : "Não foi possível abrir a autorização.") }
  }

  if (query.isLoading) return <Card className="p-6 text-sm text-slate-500">Carregando automações…</Card>
  if (!workspace || query.isError) return <Card className="p-6"><p className="text-sm text-rose-700">Não foi possível carregar as automações.</p><Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>Tentar novamente</Button></Card>

  const status = workspace.status
  const activeRules = workspace.automations.filter((item) => item.enabled).length
  const waitingHuman = workspace.conversations.filter((item) => item.state === "HUMAN").length
  const toReview = workspace.executions.filter((item) => item.status === "NEEDS_REVIEW").length
  const needsYou = waitingHuman + toReview
  const currentTab: Tab = tab ?? (needsYou ? "conversas" : "regras")

  const permissionOk = platform === "THREADS" ? status.canAutomateComments : platform === "FACEBOOK" ? status.canAutomateMessages : status.canAutomateMessages || status.canAutomateComments
  const receivingOk = platform === "THREADS" || status.webhookConfigured
  const problem = status.permissionCheckError || status.syncError
  const ready = permissionOk && receivingOk && !problem

  const tabs: Array<{ id: Tab; label: string; Icon: typeof Zap; count?: number }> = [
    { id: "conversas", label: "Conversas", Icon: MessagesSquare, count: needsYou },
    { id: "regras", label: "Regras", Icon: Zap, count: activeRules },
    { id: "respostas", label: "Respostas prontas", Icon: MessageSquareText },
    { id: "assistente", label: "Assistente de IA", Icon: Sparkles },
    { id: "historico", label: "Histórico", Icon: History },
  ]

  return <>
    <Card className={cn("overflow-hidden p-0", ready ? "border-emerald-200" : "border-amber-200")}>
      <div className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between", ready ? "bg-emerald-50/60" : "bg-amber-50/70")}>
        <div className="flex items-start gap-3">
          {ready ? <ShieldCheck size={22} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-600" />}
          <div>
            <p className={cn("font-semibold", ready ? "text-emerald-900" : "text-amber-900")}>{ready ? `Pronto para responder em ${username}` : "Falta um passo para as automações funcionarem"}</p>
            <p className={cn("mt-0.5 text-xs leading-5", ready ? "text-emerald-800" : "text-amber-900")}>
              {ready ? (activeRules ? `${activeRules} regra(s) ativa(s). Última atividade: ${formatDate(status.activity.lastEventProcessedAt)}.` : "Crie e ative uma regra para começar a responder.")
                : problem ? problem
                : !permissionOk ? (platform === "THREADS" ? "Autorize o InstaCommand a responder comentários no Threads." : "A Meta ainda não liberou as permissões de comentários/mensagens para esta conta. Reconecte a conta em Contas depois da liberação.")
                : "Ative o recebimento de comentários e mensagens desta conta."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {platform === "THREADS"
            ? <>{!status.canAutomateComments && <Button size="sm" onClick={() => void authorizeReplies()} className="bg-indigo-600 text-white hover:bg-indigo-700">Autorizar respostas</Button>}<Button size="sm" variant="outline" disabled={busy || !status.canAutomateComments} onClick={() => void run(() => api.syncThreadsAutomation(accountId), "Comentários verificados agora.")} className="gap-1.5"><RefreshCw size={14} />Verificar agora</Button></>
            : <Button size="sm" variant={ready ? "outline" : "default"} disabled={busy || !status.webhookConfigured || !permissionOk} onClick={() => void run(() => api.subscribeInstagramAutomation(accountId, platform), "Recebimento ativado. Faça um teste comentando ou mandando mensagem.")} className={ready ? "" : "bg-indigo-600 text-white hover:bg-indigo-700"}>{ready ? "Reativar recebimento" : "Ativar recebimento"}</Button>}
          {!permissionOk && platform !== "THREADS" && <Button size="sm" variant="outline" asChild><Link href="/accounts">Ir para Contas</Link></Button>}
        </div>
      </div>
      <details className="group border-t border-slate-100 px-4 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-slate-500">Detalhes técnicos<ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
        <div className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
          <p>{platform === "THREADS" ? `Respostas públicas: ${status.canAutomateComments ? "permissão detectada" : "autorização pendente"}. Verificamos a cada 2 minutos as 100 publicações mais recentes dos últimos 30 dias, só comentários feitos depois da ativação da regra.` : `Recebimento no servidor: ${status.webhookConfigured ? "configurado" : "pendente"}. Mensagens: ${status.canAutomateMessages ? "permissão detectada" : "autorização pendente"}.${platform === "INSTAGRAM" ? ` Comentários: ${status.canAutomateComments ? "permissão detectada" : "autorização pendente"}.` : ""}`}</p>
          <dl className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-2.5"><dt className="text-slate-500">Último evento processado</dt><dd className="font-medium text-slate-800">{formatDate(status.activity.lastEventProcessedAt)}</dd></div><div className="rounded-lg bg-slate-50 p-2.5"><dt className="text-slate-500">Última resposta aceita pela Meta</dt><dd className="font-medium text-slate-800">{formatDate(status.activity.lastReplyAcceptedAt)}</dd></div></dl>
          <p className="text-[11px] text-slate-500">Permissão não garante recebimento, e envio aceito não garante leitura. Contas de clientes dependem da aprovação da Meta. {platform === "THREADS" ? "Mensagens privadas do Threads não estão disponíveis." : "Respostas privadas só podem ser enviadas até 24 horas depois da mensagem recebida."}</p>
        </div>
      </details>
    </Card>

    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Stat icon={<Zap size={16} />} label="Regras ativas" value={String(activeRules)} tone="text-indigo-600 bg-indigo-50" />
      <Stat icon={<Hand size={16} />} label="Precisam de você" value={String(needsYou)} tone={needsYou ? "text-amber-700 bg-amber-50" : "text-slate-500 bg-slate-100"} />
      <Stat icon={<Clock3 size={16} />} label="Última atividade" value={status.activity.lastEventProcessedAt ? new Date(status.activity.lastEventProcessedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"} tone="text-sky-700 bg-sky-50" />
    </div>

    <div className="flex items-center justify-between gap-2">
      <nav aria-label="Seções das automações" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((item) => <button key={item.id} type="button" aria-current={currentTab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}
          className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition sm:text-sm", currentTab === item.id ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
          <item.Icon size={15} />{item.label}{item.count ? <span className={cn("rounded-full px-1.5 text-[10px] font-bold", item.id === "conversas" ? "bg-amber-500 text-white" : "bg-indigo-600 text-white")}>{item.count}</span> : null}
        </button>)}
      </nav>
      <Button size="icon" variant="ghost" aria-label="Atualizar" disabled={query.isFetching} onClick={() => void refresh()}><RefreshCw size={15} className={query.isFetching ? "animate-spin" : ""} /></Button>
    </div>

    {currentTab === "conversas" && <ConversationsPanel platform={platform} accountId={accountId} workspace={workspace} busy={busy} run={run} />}
    {currentTab === "regras" && <RulesPanel platform={platform} accountId={accountId} workspace={workspace} busy={busy} run={run} />}
    {currentTab === "respostas" && <TemplatesPanel platform={platform} accountId={accountId} workspace={workspace} busy={busy} run={run} />}
    {currentTab === "assistente" && <AgentPanel platform={platform} accountId={accountId} workspace={workspace} busy={busy} run={run} />}
    {currentTab === "historico" && <HistoryPanel platform={platform} accountId={accountId} workspace={workspace} busy={busy} run={run} />}

    <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Respondemos apenas comentários e mensagens recebidos pelas integrações oficiais. Curtidas e novos seguidores não disparam mensagens, e não fazemos disparos em massa.</p>
  </>
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return <Card className="flex min-w-0 flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-2.5"><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span><span className="min-w-0"><span className="block text-[11px] leading-tight text-slate-500 sm:text-xs">{label}</span><span className="block text-lg font-bold leading-tight text-slate-900">{value}</span></span></Card>
}
