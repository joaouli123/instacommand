"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Bot, CheckCircle2, Clock3, FileText, MessageCircle, Plus, RefreshCw, Send, Settings2, Trash2, Zap } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type Trigger = "COMMENT_ANY" | "COMMENT_KEYWORD" | "MESSAGE_ANY" | "MESSAGE_KEYWORD"
type ReplyMode = "TEMPLATE" | "AI"
type AutomationRule = {
  id: string; name: string; trigger: Trigger; keywords: string[]; replyMode: ReplyMode; enabled: boolean
  publicCommentReply?: string | null; privateCommentReply?: string | null; directMessageReply?: string | null
}
type Template = { id: string; name: string; type: "PUBLIC_COMMENT" | "PRIVATE_COMMENT" | "DIRECT_MESSAGE"; content: string }
type Execution = { id: string; eventType: Trigger; status: string; senderUsername?: string | null; eventText?: string | null; responseText?: string | null; error?: string | null; createdAt: string }
type Agent = { id?: string; updatedAt?: string; enabled: boolean; autoSend: boolean; tone: string; instructions: string; knowledgeBase: string; fallback: string }
type Workspace = {
  automations: AutomationRule[]; templates: Template[]; agent: Agent | null; executions: Execution[]
  status: { webhookConfigured: boolean; callbackUrl: string; grantedPermissions: string[]; permissionCheckError?: string | null; canAutomateComments: boolean; canAutomateMessages: boolean }
}

const blankRule = { name: "", trigger: "COMMENT_KEYWORD" as Trigger, keywords: "", replyMode: "TEMPLATE" as ReplyMode, publicCommentReply: "", privateCommentReply: "", directMessageReply: "" }
const blankAgent: Agent = { enabled: false, autoSend: false, tone: "Humano, cordial e direto", instructions: "", knowledgeBase: "", fallback: "Vou chamar alguém da equipe para continuar com você." }
const tabs = ["Regras", "Respostas prontas", "Agente de IA", "Histórico"] as const
type Tab = typeof tabs[number]

const triggerLabel = (trigger: Trigger) => ({ COMMENT_ANY: "Todo comentário novo", COMMENT_KEYWORD: "Comentário com palavra-chave", MESSAGE_ANY: "Toda mensagem recebida", MESSAGE_KEYWORD: "Mensagem com palavra-chave" })[trigger]
const statusLabel = (status: string) => ({ RECEIVED: "Recebido", PROCESSING: "Processando", SENT: "Enviado", NEEDS_REVIEW: "Revisão humana", BLOCKED: "Bloqueado", SKIPPED: "Ignorado", FAILED: "Falhou" }[status] || status)
const inputClass = "mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
const labelClass = "block text-xs font-semibold text-slate-600"

export default function AutomationsPage() {
  const { activeAccount, isLoading } = useActiveAccount()
  if (isLoading) return <Card className="p-8 text-center text-sm text-slate-500">Carregando contas...</Card>
  if (!activeAccount) return <Card className="mx-auto max-w-xl p-8 text-center"><Zap className="mx-auto mb-3 text-indigo-600"/><h2 className="font-bold text-slate-900">Conecte uma conta profissional</h2><p className="mt-2 text-sm text-slate-500">As automações funcionam por conta do Instagram selecionada.</p></Card>
  return <AutomationWorkspace key={activeAccount.id} accountId={activeAccount.id} username={activeAccount.igUsername}/>
}

function AutomationWorkspace({ accountId, username }: { accountId: string; username: string }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>("Regras")
  const [ruleForm, setRuleForm] = useState(blankRule)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState({ name: "", type: "DIRECT_MESSAGE" as Template["type"], content: "" })
  const [agentForm, setAgentForm] = useState<Agent>(blankAgent)
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({})
  const [sendingExecutionId, setSendingExecutionId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const workspaceQuery = useQuery({ queryKey: ["automation-workspace", accountId], queryFn: () => api.getAutomationWorkspace(accountId) as Promise<Workspace>, refetchInterval: 15_000 })
  const workspace = workspaceQuery.data
  const activeRules = useMemo(() => workspace?.automations.filter((rule) => rule.enabled).length || 0, [workspace?.automations])

  useEffect(() => {
    if (!workspace) return
    const agent = workspace.agent
    setAgentForm(agent ? { enabled: agent.enabled, autoSend: agent.autoSend, tone: agent.tone, instructions: agent.instructions, knowledgeBase: agent.knowledgeBase, fallback: agent.fallback } : blankAgent)
  }, [workspace?.agent?.updatedAt, accountId, workspace?.agent?.id])

  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["automation-workspace", accountId] })
  const submitRule = async (event: React.FormEvent) => {
    event.preventDefault()
    const data = {
      accountId, name: ruleForm.name.trim(), trigger: ruleForm.trigger,
      keywords: ruleForm.keywords.split(",").map((item) => item.trim()).filter(Boolean), replyMode: ruleForm.replyMode,
      publicCommentReply: ruleForm.publicCommentReply.trim(), privateCommentReply: ruleForm.privateCommentReply.trim(),
      directMessageReply: ruleForm.directMessageReply.trim(), enabled: editingId ? workspace?.automations.find((rule) => rule.id === editingId)?.enabled || false : false,
    }
    setSaving(true)
    try {
      if (editingId) await api.updateAutomation(editingId, data)
      else await api.createAutomation(data)
      toast.success(editingId ? "Regra atualizada." : "Regra criada e salva desligada.")
      setRuleForm(blankRule); setEditingId(null); await refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a regra.") }
    finally { setSaving(false) }
  }

  const editRule = (rule: AutomationRule) => {
    setEditingId(rule.id)
    setRuleForm({ name: rule.name, trigger: rule.trigger, keywords: rule.keywords.join(", "), replyMode: rule.replyMode, publicCommentReply: rule.publicCommentReply || "", privateCommentReply: rule.privateCommentReply || "", directMessageReply: rule.directMessageReply || "" })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const toggleRule = async (rule: AutomationRule) => {
    try {
      await api.updateAutomation(rule.id, { ...rule, accountId, enabled: !rule.enabled })
      toast.success(rule.enabled ? "Regra pausada." : "Regra ativada.")
      await refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível alterar a regra.") }
  }

  const removeRule = async (rule: AutomationRule) => {
    if (!window.confirm(`Excluir a regra “${rule.name}”?`)) return
    try { await api.deleteAutomation(accountId, rule.id); toast.success("Regra excluída."); await refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir a regra.") }
  }

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try { await api.createAutomationTemplate({ ...templateForm, accountId }); setTemplateForm({ name: "", type: "DIRECT_MESSAGE", content: "" }); toast.success("Resposta pronta salva."); await refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a resposta.") }
    finally { setSaving(false) }
  }

  const saveAgent = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try { await api.saveInstagramAgent({ ...agentForm, accountId }); toast.success("Configuração do agente salva."); await refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o agente.") }
    finally { setSaving(false) }
  }

  const subscribe = async () => {
    setSaving(true)
    try { await api.subscribeInstagramAutomation(accountId); toast.success("Conta inscrita nos eventos da Meta."); await refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível inscrever a conta.") }
    finally { setSaving(false) }
  }

  const sendReviewedReply = async (execution: Execution) => {
    const message = (reviewDrafts[execution.id] ?? execution.responseText ?? "").trim()
    if (!message) return toast.error("Escreva uma resposta antes de enviar.")
    setSendingExecutionId(execution.id)
    try {
      await api.sendReviewedAutomationReply(accountId, execution.id, message)
      toast.success("Resposta enviada pela Meta.")
      await refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar a resposta.") }
    finally { setSendingExecutionId(null) }
  }

  const templatePicker = (type: Template["type"], onPick: (content: string) => void) => <label className={labelClass}>Preencher com uma resposta pronta<select defaultValue="" onChange={(event) => { const template = workspace?.templates.find((item) => item.id === event.target.value); if (template) onPick(template.content); event.currentTarget.selectedIndex = 0 }} className={`${inputClass} min-h-9 py-1.5`}><option value="" disabled>Escolha um modelo salvo…</option>{workspace?.templates.filter((template) => template.type === type).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>

  if (workspaceQuery.isLoading) return <Card className="p-8 text-center text-sm text-slate-500">Carregando automações de @{username}…</Card>
  if (workspaceQuery.isError || !workspace) return <Card className="p-8 text-center"><p className="text-sm text-rose-700">Não foi possível carregar as automações.</p><Button variant="outline" onClick={() => void workspaceQuery.refetch()} className="mt-3 gap-2"><RefreshCw size={15}/>Tentar novamente</Button></Card>

  const commentReady = workspace.status.webhookConfigured && workspace.status.canAutomateComments
  const messageReady = workspace.status.webhookConfigured && workspace.status.canAutomateMessages

  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Relacionamento com a audiência</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Automações do Instagram</h2><p className="mt-1 text-sm text-slate-500">Conta ativa: <span className="font-semibold text-slate-700">@{username}</span> · {activeRules} {activeRules === 1 ? "regra ativa" : "regras ativas"}</p></div><Button variant="outline" onClick={() => void workspaceQuery.refetch()} disabled={workspaceQuery.isFetching} className="gap-2"><RefreshCw size={15} className={workspaceQuery.isFetching ? "animate-spin" : ""}/>Atualizar</Button></div>

    <Card className={`p-4 sm:p-5 ${commentReady || messageReady ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/70"}`}>
      <div className="flex items-start gap-3"><div className={`mt-0.5 rounded-xl p-2 ${commentReady || messageReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{commentReady || messageReady ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}</div><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">{commentReady || messageReady ? "Conexão com a Meta parcialmente pronta" : "A Meta ainda precisa habilitar esta integração"}</h3><p className="mt-1 text-sm leading-6 text-slate-600">Webhook do servidor: {workspace.status.webhookConfigured ? "configurado" : "aguardando configuração"}. Comentários: {workspace.status.canAutomateComments ? "permissão concedida" : "permissão não detectada"}. Mensagens: {workspace.status.canAutomateMessages ? "permissão concedida" : "permissão não detectada"}.</p>
      {workspace.status.permissionCheckError && <p className="mt-1 text-xs text-amber-800">{workspace.status.permissionCheckError}</p>}
      {!workspace.status.webhookConfigured && <p className="mt-2 break-all rounded-lg bg-white/80 p-2 font-mono text-[11px] text-slate-600">Callback para configurar no Meta for Developers: {workspace.status.callbackUrl}</p>}
      <p className="mt-2 text-xs leading-5 text-slate-500">É necessário configurar os eventos <code>comments</code> e <code>messages</code> no app da Meta e solicitar as permissões aprovadas para sua conta. Enquanto isso, eventos ficarão bloqueados e registrados — nenhum envio é simulado. Curtidas e novos seguidores não são gatilhos disponíveis nesta integração.</p>
      {workspace.status.webhookConfigured && (workspace.status.canAutomateComments || workspace.status.canAutomateMessages) && <Button size="sm" onClick={() => void subscribe()} disabled={saving} className="mt-3 gap-2"><Zap size={14}/>Conectar eventos desta conta</Button>}
      </div></div>
    </Card>

    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${tab === item ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{item}</button>)}</div>

    {tab === "Regras" && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-indigo-600"/><h3 className="font-bold text-slate-900">{editingId ? "Editar regra" : "Criar regra"}</h3></div>
        <form onSubmit={submitRule} className="space-y-3.5">
          <label className={labelClass}>Nome da regra<input required maxLength={100} value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="Ex.: Responder dúvidas sobre preço" className={inputClass}/></label>
          <label className={labelClass}>Quando acontecer<select value={ruleForm.trigger} onChange={(e) => setRuleForm({ ...ruleForm, trigger: e.target.value as Trigger })} className={inputClass}><option value="COMMENT_ANY">Todo comentário novo</option><option value="COMMENT_KEYWORD">Comentário com palavra-chave</option><option value="MESSAGE_ANY">Toda mensagem recebida</option><option value="MESSAGE_KEYWORD">Mensagem com palavra-chave</option></select></label>
          {ruleForm.trigger.endsWith("_KEYWORD") && <label className={labelClass}>Palavras-chave separadas por vírgula<input required value={ruleForm.keywords} onChange={(e) => setRuleForm({ ...ruleForm, keywords: e.target.value })} placeholder="preço, valor, orçamento" className={inputClass}/></label>}
          <label className={labelClass}>Tipo de resposta<select value={ruleForm.replyMode} onChange={(e) => setRuleForm({ ...ruleForm, replyMode: e.target.value as ReplyMode })} className={inputClass}><option value="TEMPLATE">Resposta pronta</option><option value="AI">Agente de IA</option></select></label>
          {ruleForm.replyMode === "AI" ? <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs leading-5 text-indigo-900">A resposta da IA vai para revisão humana por padrão. O envio automático só ocorre se você habilitar no agente e a IA considerar a resposta segura.</div> : ruleForm.trigger.startsWith("COMMENT_") ? <>
            {templatePicker("PUBLIC_COMMENT", (content) => setRuleForm({ ...ruleForm, publicCommentReply: content }))}
            <label className={labelClass}>Resposta pública ao comentário<textarea value={ruleForm.publicCommentReply} onChange={(e) => setRuleForm({ ...ruleForm, publicCommentReply: e.target.value })} maxLength={1000} rows={3} placeholder="Obrigado por comentar!" className={inputClass}/></label>
            {templatePicker("PRIVATE_COMMENT", (content) => setRuleForm({ ...ruleForm, privateCommentReply: content }))}
            <label className={labelClass}>Mensagem privada opcional<textarea value={ruleForm.privateCommentReply} onChange={(e) => setRuleForm({ ...ruleForm, privateCommentReply: e.target.value })} maxLength={1000} rows={3} placeholder="Oi! Vi seu comentário. Como posso ajudar?" className={inputClass}/><span className="mt-1 block font-normal text-slate-500">A Meta limita a uma mensagem privada por comentário; a pessoa precisa responder para continuar a conversa.</span></label>
          </> : <>{templatePicker("DIRECT_MESSAGE", (content) => setRuleForm({ ...ruleForm, directMessageReply: content }))}<label className={labelClass}>Resposta à mensagem<textarea required value={ruleForm.directMessageReply} onChange={(e) => setRuleForm({ ...ruleForm, directMessageReply: e.target.value })} maxLength={1000} rows={4} placeholder="Olá! Obrigado por chamar. Como posso ajudar?" className={inputClass}/></label></>}
          <div className="flex flex-wrap gap-2 pt-1"><Button type="submit" disabled={saving} className="gap-2"><Plus size={15}/>{saving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar regra"}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setRuleForm(blankRule) }}>Cancelar edição</Button>}</div>
        </form>
      </Card>
      <div className="space-y-3">{!workspace.automations.length && <Card className="p-9 text-center"><Zap className="mx-auto mb-3 text-slate-300" size={28}/><h3 className="font-bold text-slate-800">Nenhuma regra ainda</h3><p className="mt-1 text-sm text-slate-500">Crie uma resposta para comentários ou mensagens recebidas.</p></Card>}{workspace.automations.map((rule) => <Card key={rule.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{rule.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${rule.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{rule.enabled ? "ATIVA" : "PAUSADA"}</span></div><p className="mt-1 text-xs text-slate-500">{triggerLabel(rule.trigger)} · {rule.replyMode === "AI" ? "Agente de IA" : "Resposta pronta"}</p>{rule.keywords.length > 0 && <p className="mt-2 text-xs text-slate-600">Palavras: {rule.keywords.join(", ")}</p>}<p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{rule.directMessageReply || rule.publicCommentReply || rule.privateCommentReply || (rule.replyMode === "AI" ? "Resposta elaborada pelo agente" : "Sem resposta configurada")}</p></div><div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" onClick={() => editRule(rule)}>Editar</Button><Button size="sm" variant="outline" onClick={() => void toggleRule(rule)}>{rule.enabled ? "Pausar" : "Ativar"}</Button><Button size="icon" variant="ghost" aria-label="Excluir regra" onClick={() => void removeRule(rule)}><Trash2 size={15} className="text-rose-500"/></Button></div></div></Card>)}</div>
    </div>}

    {tab === "Respostas prontas" && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><Card className="p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><FileText size={18} className="text-indigo-600"/><h3 className="font-bold">Nova resposta pronta</h3></div><form className="space-y-3" onSubmit={saveTemplate}><label className={labelClass}>Nome<input required value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="Boas-vindas" className={inputClass}/></label><label className={labelClass}>Usar em<select value={templateForm.type} onChange={(e) => setTemplateForm({ ...templateForm, type: e.target.value as Template["type"] })} className={inputClass}><option value="DIRECT_MESSAGE">Mensagem privada</option><option value="PUBLIC_COMMENT">Comentário público</option><option value="PRIVATE_COMMENT">Mensagem privada por comentário</option></select></label><label className={labelClass}>Texto<textarea required rows={5} maxLength={1000} value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} placeholder="Escreva uma resposta reutilizável..." className={inputClass}/></label><Button disabled={saving} className="gap-2"><Plus size={15}/>Salvar resposta</Button></form><p className="mt-3 text-xs leading-5 text-slate-500">Os modelos são guardados para consulta; copie-os para a regra desejada. Não disparam mensagens por conta própria.</p></Card><div className="space-y-3">{!workspace.templates.length && <Card className="p-8 text-center text-sm text-slate-500">Suas respostas prontas aparecerão aqui.</Card>}{workspace.templates.map((item) => <Card key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.name}</p><p className="mt-1 text-[11px] font-medium text-indigo-600">{{ DIRECT_MESSAGE: "Mensagem privada", PUBLIC_COMMENT: "Comentário público", PRIVATE_COMMENT: "Mensagem privada por comentário" }[item.type]}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{item.content}</p></div><Button size="icon" variant="ghost" aria-label="Excluir modelo" onClick={async () => { try { await api.deleteAutomationTemplate(accountId, item.id); await refresh(); toast.success("Resposta excluída.") } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao excluir.") } }}><Trash2 size={15} className="text-rose-500"/></Button></div></Card>)}</div></div>}

    {tab === "Agente de IA" && <Card className="mx-auto max-w-3xl p-4 sm:p-6"><div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><Bot size={20}/></div><div><h3 className="font-bold text-slate-900">Treine o agente com contexto do seu negócio</h3><p className="mt-1 text-sm leading-5 text-slate-500">Defina tom, instruções e respostas confiáveis. Isso configura o contexto do modelo; não treina um modelo proprietário.</p></div></div><form onSubmit={saveAgent} className="space-y-4"><label className={labelClass}>Tom de voz<input value={agentForm.tone} onChange={(e) => setAgentForm({ ...agentForm, tone: e.target.value })} maxLength={200} className={inputClass}/></label><label className={labelClass}>Instruções do agente<textarea rows={4} value={agentForm.instructions} onChange={(e) => setAgentForm({ ...agentForm, instructions: e.target.value })} maxLength={2000} placeholder="Explique o que sua empresa faz, como deve responder e o que deve evitar." className={inputClass}/></label><label className={labelClass}>Informações confiáveis (FAQ, serviços, preços e políticas)<textarea rows={7} value={agentForm.knowledgeBase} onChange={(e) => setAgentForm({ ...agentForm, knowledgeBase: e.target.value })} maxLength={8000} placeholder="Inclua apenas informações atuais que a IA pode usar. Se algo não estiver aqui, ela deve pedir revisão." className={inputClass}/><span className="mt-1 block font-normal text-slate-500">Não inclua senhas, dados sensíveis nem informações privadas de clientes.</span></label><label className={labelClass}>Resposta sugerida quando precisar de uma pessoa<textarea rows={2} value={agentForm.fallback} onChange={(e) => setAgentForm({ ...agentForm, fallback: e.target.value })} maxLength={1000} className={inputClass}/></label><div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700"><input type="checkbox" checked={agentForm.enabled} onChange={(e) => setAgentForm({ ...agentForm, enabled: e.target.checked, autoSend: e.target.checked ? agentForm.autoSend : false })} className="mt-0.5 accent-indigo-600"/><span><b>Ativar agente</b><span className="mt-0.5 block text-xs text-slate-500">As regras configuradas poderão gerar respostas sugeridas.</span></span></label><label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700"><input type="checkbox" checked={agentForm.autoSend} disabled={!agentForm.enabled} onChange={(e) => setAgentForm({ ...agentForm, autoSend: e.target.checked })} className="mt-0.5 accent-indigo-600"/><span><b>Permitir envio automático quando a IA não sinalizar risco</b><span className="mt-0.5 block text-xs leading-5 text-slate-500">Reclamações, assuntos sensíveis, dúvidas sem resposta e casos incertos ficam sempre para revisão humana. Você ainda precisa ativar a regra e obter as permissões da Meta.</span></span></label></div><Button disabled={saving} className="gap-2"><Settings2 size={15}/>Salvar agente</Button></form></Card>}

    {tab === "Histórico" && <div className="space-y-3">{workspace.executions.map((item) => <Card key={item.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{item.senderUsername ? `@${item.senderUsername}` : "Pessoa"}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.status === "SENT" ? "bg-emerald-100 text-emerald-700" : item.status === "FAILED" || item.status === "BLOCKED" ? "bg-rose-100 text-rose-700" : item.status === "NEEDS_REVIEW" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{statusLabel(item.status)}</span><span className="text-xs text-slate-400">{triggerLabel(item.eventType)}</span></div><p className="mt-2 text-sm text-slate-700">{item.eventText || "Evento sem texto"}</p>{item.responseText && item.status !== "NEEDS_REVIEW" && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600"><span className="font-semibold">Resposta:</span> {item.responseText}</p>}{item.error && <p className="mt-2 text-xs leading-5 text-amber-800">{item.error}</p>}{item.status === "NEEDS_REVIEW" && <div className="mt-3 space-y-2"><textarea value={reviewDrafts[item.id] ?? item.responseText ?? ""} onChange={(event) => setReviewDrafts({ ...reviewDrafts, [item.id]: event.target.value })} maxLength={1000} rows={3} aria-label="Editar resposta antes de enviar" className={inputClass}/><Button size="sm" disabled={sendingExecutionId === item.id} onClick={() => void sendReviewedReply(item)} className="gap-2"><Send size={14}/>{sendingExecutionId === item.id ? "Enviando…" : "Revisar e enviar"}</Button></div>}</div><span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400"><Clock3 size={13}/>{new Date(item.createdAt).toLocaleString("pt-BR")}</span></div></Card>)}{!workspace.executions.length && <Card className="p-10 text-center"><MessageCircle className="mx-auto mb-3 text-slate-300" size={28}/><p className="font-semibold text-slate-800">Ainda não há eventos</p><p className="mt-1 text-sm text-slate-500">Quando chegar comentário ou mensagem pelo webhook, o histórico aparecerá aqui.</p></Card>}</div>}

    <p className="flex items-start gap-2 px-1 text-xs leading-5 text-slate-500"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>A plataforma só responde a comentários e mensagens recebidos pela API oficial. Gatilhos de curtida ou novo seguidor não são suportados; não faremos coleta por scraping ou disparos em massa.</p>
  </div>
}
