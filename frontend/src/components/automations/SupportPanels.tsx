"use client"

import { useEffect, useState } from "react"
import { BookOpen, Bot, Clock3, Lock, MessageCircle, MessageSquareText, Save, Send, Settings2, Sparkles, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ReviewEditor } from "./ConversationsPanel"
import {
  blankAgent, ChoiceTile, contactName, EXECUTION_STATUS, Field, formatDate, inputClass, TEMPLATE_TYPE_NAMES, templateTypesFor, Tip,
  type Agent, type Platform, type TemplateType, type Workspace,
} from "./shared"

type Run = (operation: () => Promise<unknown>, success: string) => Promise<void>
type PanelProps = { platform: Platform; accountId: string; workspace: Workspace; busy: boolean; run: Run }

const TEMPLATE_ICONS: Record<TemplateType, typeof MessageCircle> = { PUBLIC_COMMENT: MessageCircle, PRIVATE_COMMENT: Lock, DIRECT_MESSAGE: Send }

export function TemplatesPanel({ platform, accountId, workspace, busy, run }: PanelProps) {
  const types = templateTypesFor(platform)
  const [template, setTemplate] = useState({ name: "", type: types[0], content: "" })
  const maxLength = platform === "X" ? 280 : platform === "THREADS" ? 500 : 1000
  return <div className="grid items-start gap-4 lg:grid-cols-2">
    <Card className="p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><MessageSquareText size={18} className="text-indigo-600" />Nova resposta pronta</h2>
      <p className="mt-1 text-xs text-slate-500">Guarde textos que você usa sempre e escolha-os ao criar uma regra. Salvar não envia nada.</p>
      <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void run(async () => { await api.createAutomationTemplate({ ...template, accountId, platform }); setTemplate({ ...template, name: "", content: "" }) }, "Resposta pronta salva.") }}>
        {types.length > 1 && <div className="grid gap-2">{types.map((type) => { const Icon = TEMPLATE_ICONS[type]; return <ChoiceTile key={type} selected={template.type === type} onClick={() => setTemplate({ ...template, type })} icon={<Icon size={16} />} title={TEMPLATE_TYPE_NAMES[type]} /> })}</div>}
        <Field title="Nome"><input required minLength={2} maxLength={100} className={inputClass} value={template.name} onChange={(event) => setTemplate({ ...template, name: event.target.value })} placeholder="Ex.: Link da loja" /></Field>
        <Field title="Texto" hint={`Até ${maxLength} caracteres.`}><textarea required rows={5} maxLength={maxLength} className={inputClass} value={template.content} onChange={(event) => setTemplate({ ...template, content: event.target.value })} /></Field>
        <Button disabled={busy} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={15} />Salvar resposta</Button>
      </form>
    </Card>
    <div className="space-y-3">
      {workspace.templates.map((item) => { const Icon = TEMPLATE_ICONS[item.type]; return <Card key={item.id} className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={16} /></span>
          <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{item.name}</h3><p className="text-[11px] font-medium text-indigo-600">{TEMPLATE_TYPE_NAMES[item.type]}</p><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">{item.content}</p></div>
          <Button size="icon" variant="ghost" disabled={busy} aria-label={`Excluir ${item.name}`} className="text-rose-600 hover:bg-rose-50" onClick={() => { if (window.confirm(`Excluir a resposta “${item.name}”?`)) void run(() => api.deleteAutomationTemplate(accountId, item.id, platform), "Resposta excluída.") }}><Trash2 size={15} /></Button>
        </div>
      </Card> })}
      {!workspace.templates.length && <Card className="p-8 text-center text-sm text-slate-500">Nenhuma resposta salva nesta rede.</Card>}
    </div>
  </div>
}

export function AgentPanel({ platform, accountId, workspace, busy, run }: PanelProps) {
  const [agent, setAgent] = useState<Agent>(blankAgent)
  useEffect(() => { setAgent(workspace.agent ? { ...blankAgent, ...workspace.agent } : blankAgent) }, [workspace.agent?.id, workspace.agent?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const maxLength = platform === "X" ? 280 : platform === "THREADS" ? 500 : 1000
  return <Card className="mx-auto max-w-3xl p-4 sm:p-6">
    <div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Sparkles size={20} /></span><div><h2 className="font-bold text-slate-900">Assistente de IA</h2><p className="text-sm text-slate-500">Ensine o assistente sobre o seu negócio. Ele responde nas regras marcadas como “Assistente de IA”.</p></div></div>
    <form className="mt-5 space-y-5" onSubmit={(event) => { event.preventDefault(); void run(() => api.saveInstagramAgent({ ...agent, accountId, platform }), "Assistente salvo.") }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${agent.enabled ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"}`}><span><span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Bot size={15} />Assistente ligado</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Cria respostas para as mensagens desta rede.</span></span><Switch checked={agent.enabled} onCheckedChange={(checked) => setAgent({ ...agent, enabled: checked, autoSend: checked ? agent.autoSend : false })} aria-label="Ligar assistente" /></label>
        <label className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${agent.autoSend ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"} ${!agent.enabled ? "opacity-60" : ""}`}><span><span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Send size={15} />Enviar sozinho</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Desligado: você revisa cada resposta antes de enviar.</span></span><Switch checked={agent.autoSend} disabled={!agent.enabled} onCheckedChange={(checked) => setAgent({ ...agent, autoSend: checked })} aria-label="Enviar automaticamente" /></label>
      </div>
      <Field title="Jeito de falar" hint="Ex.: simpático e direto, com emojis; formal; descontraído."><input required minLength={2} maxLength={200} className={inputClass} value={agent.tone} onChange={(event) => setAgent({ ...agent, tone: event.target.value })} /></Field>
      <Field title="Informações da empresa" hint="Serviços, preços, horários, endereço, links e perguntas frequentes. O assistente não inventa o que não estiver aqui. Não coloque senhas."><textarea rows={7} maxLength={8000} className={inputClass} value={agent.knowledgeBase} onChange={(event) => setAgent({ ...agent, knowledgeBase: event.target.value })} placeholder="Ex.: Atendemos de segunda a sábado, das 9h às 18h. O cadastro é feito pelo link…" /></Field>
      <Field title="Como deve atender" hint="Regras de atendimento: o que pode oferecer, quando passar para a equipe, o que nunca dizer."><textarea rows={4} maxLength={2000} className={inputClass} value={agent.instructions} onChange={(event) => setAgent({ ...agent, instructions: event.target.value })} /></Field>
      <Field title="Mensagem ao chamar a equipe" hint="Usada quando o assistente não tem certeza ou a pessoa pede um atendente."><textarea required rows={2} maxLength={maxLength} className={inputClass} value={agent.fallback} onChange={(event) => setAgent({ ...agent, fallback: event.target.value })} /></Field>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><Settings2 size={15} />Configurações avançadas</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field title="Lembrar conversas dos últimos (dias)" hint="0 desliga a memória."><input type="number" min={0} max={30} required className={inputClass} value={agent.memoryDays} onChange={(event) => setAgent({ ...agent, memoryDays: Number(event.target.value) })} /></Field>
          <Field title="Máximo de respostas por conversa a cada hora"><input type="number" min={1} max={30} required className={inputClass} value={agent.maxRepliesPerHour} onChange={(event) => setAgent({ ...agent, maxRepliesPerHour: Number(event.target.value) })} /></Field>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">O assistente considera até 20 interações recentes de cada conversa. Conversas públicas e privadas não compartilham memória.</p>
      </details>
      <Tip><BookOpen size={13} className="mr-1 inline" />Para o assistente responder, crie também uma regra com <b>Assistente de IA</b> na aba Regras e ative-a.</Tip>
      <Button disabled={busy} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Save size={15} />Salvar assistente</Button>
    </form>
  </Card>
}

export function HistoryPanel({ platform, accountId, workspace, busy, run }: PanelProps) {
  if (!workspace.executions.length) return <Card className="p-8 text-center text-sm text-slate-500">Nada por aqui ainda. Cada comentário ou mensagem tratado pelas automações aparece nesta lista.</Card>
  return <div className="space-y-3">{workspace.executions.map((item) => {
    const status = EXECUTION_STATUS[item.status] || { label: item.status, tone: "bg-slate-100 text-slate-600" }
    return <Card key={item.id} className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">{item.eventType.startsWith("COMMENT_") ? <MessageCircle size={14} className="text-indigo-600" /> : <Send size={14} className="text-indigo-600" />}{contactName(item)}<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span></p>
        <span className="flex items-center gap-1 text-[11px] text-slate-500"><Clock3 size={12} />{formatDate(item.createdAt)}</span>
      </div>
      {item.eventText && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{item.eventText}</p>}
      {item.responseText && item.status !== "NEEDS_REVIEW" && <p className="mt-2 flex gap-2 whitespace-pre-wrap break-words rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950"><Bot size={14} className="mt-0.5 shrink-0 text-indigo-500" />{item.responseText}</p>}
      {item.error && <p className="mt-2 text-xs leading-5 text-amber-800">{item.error}</p>}
      {item.status === "NEEDS_REVIEW" && <ReviewEditor item={item} platform={platform} accountId={accountId} busy={busy} run={run} />}
    </Card>
  })}</div>
}
