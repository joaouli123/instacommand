"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowRight, Bot, Lightbulb, MessageCircle, MessageSquareText, Pencil, Plus, Send, Sparkles, Tag, Trash2, X, Zap } from "lucide-react"
import { api } from "@/lib/api"
import { useT, type Translate } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  allowedKinds, blankRule, ChoiceTile, Field, inputClass, Tip, TRIGGER_KIND, triggerFor, usesKeywords,
  type Platform, type Rule, type RuleDraft, type Template, type TemplateType, type Workspace,
} from "./shared"

type Run = (operation: () => Promise<unknown>, success: string) => Promise<void>

type Preset = { title: string; description: string; draft: Partial<RuleDraft> }
const PRESETS: Record<Platform, Preset[]> = {
  INSTAGRAM: [
    { title: "Link no Direct para quem comentar", description: "Quem comentar a palavra recebe o link por mensagem privada.", draft: { name: "Link por Direct", trigger: "COMMENT_KEYWORD", keywords: ["EU QUERO"], replyMode: "TEMPLATE", publicCommentReply: "Te mandei no Direct! 📩", privateCommentReply: "Oi! Aqui está o link que você pediu: " } },
    { title: "Boas-vindas no Direct", description: "Toda mensagem recebe uma resposta automática de recebimento.", draft: { name: "Boas-vindas no Direct", trigger: "MESSAGE_ANY", replyMode: "TEMPLATE", directMessageReply: "Oi! Obrigado pela mensagem 😊 Já já a nossa equipe te responde." } },
    { title: "Atendimento com IA no Direct", description: "O assistente de IA conversa usando as informações da sua empresa.", draft: { name: "Atendimento com IA", trigger: "MESSAGE_ANY", replyMode: "AI", continueConversation: true } },
  ],
  FACEBOOK: [
    { title: "Boas-vindas no Messenger", description: "Toda mensagem recebe uma resposta automática de recebimento.", draft: { name: "Boas-vindas no Messenger", trigger: "MESSAGE_ANY", replyMode: "TEMPLATE", directMessageReply: "Oi! Obrigado pela mensagem 😊 Já já a nossa equipe te responde." } },
    { title: "Preço por palavra-chave", description: "Quem perguntar sobre preço recebe a tabela.", draft: { name: "Tabela de preços", trigger: "MESSAGE_KEYWORD", keywords: ["preço", "valor"], replyMode: "TEMPLATE", directMessageReply: "Nossa tabela de preços: " } },
    { title: "Atendimento com IA no Messenger", description: "O assistente de IA conversa usando as informações da sua empresa.", draft: { name: "Atendimento com IA", trigger: "MESSAGE_ANY", replyMode: "AI", continueConversation: true } },
  ],
  X: [
    { title: "Agradecer menções", description: "Uma resposta pública curta para quem mencionar sua conta.", draft: { name: "Agradecimento", trigger: "COMMENT_ANY", replyMode: "TEMPLATE", publicCommentReply: "Valeu pela menção! 💜" } },
    { title: "Responder dúvidas de preço", description: "Quem mencionar preço ou valor recebe a resposta pública.", draft: { name: "Dúvidas de preço", trigger: "COMMENT_KEYWORD", keywords: ["preço", "valor"], replyMode: "TEMPLATE", publicCommentReply: "Os valores estão no link da bio! 😉" } },
  ],
  THREADS: [
    { title: "Agradecer quem comentar", description: "Uma resposta pública de agradecimento em cada comentário.", draft: { name: "Agradecimento", trigger: "COMMENT_ANY", replyMode: "TEMPLATE", publicCommentReply: "Obrigado pelo comentário! 💜" } },
    { title: "Responder dúvidas de preço", description: "Quem comentar preço ou valor recebe a resposta pública.", draft: { name: "Dúvidas de preço", trigger: "COMMENT_KEYWORD", keywords: ["preço", "valor"], replyMode: "TEMPLATE", publicCommentReply: "Os valores estão no link da bio! 😉" } },
  ],
}

const kindText = { COMMENT: "Quando alguém comentar", MESSAGE: "Quando alguém enviar uma mensagem" }

/** Preset prefill text follows the UI language; the user can still edit it before saving. */
const localizeDraft = (draft: Partial<RuleDraft>, t: Translate): Partial<RuleDraft> => {
  const next = { ...draft }
  for (const field of ["name", "publicCommentReply", "privateCommentReply", "directMessageReply"] as const) {
    const value = draft[field]
    if (value) next[field] = t(value)
  }
  if (draft.keywords) next.keywords = draft.keywords.map((word) => t(word))
  return next
}

/** "When someone comments "EU QUERO" → ready reply" in plain words. */
function RuleSentence({ rule }: { rule: Rule }) {
  const t = useT()
  const kind = TRIGGER_KIND(rule.trigger)
  return <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-700">
    <span className="inline-flex items-center gap-1 font-medium">{kind === "COMMENT" ? <MessageCircle size={14} className="text-indigo-600" /> : <Send size={14} className="text-indigo-600" />}{t(kindText[kind])}</span>
    {usesKeywords(rule.trigger) ? <>{t("com")}{rule.keywords.map((word) => <span key={word} className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">{word}</span>)}</> : <span className="text-slate-500">{t("(qualquer texto)")}</span>}
    <ArrowRight size={14} className="text-slate-400" />
    <span className="inline-flex items-center gap-1 font-medium">{rule.replyMode === "AI" ? <><Sparkles size={14} className="text-violet-600" />{t("o assistente de IA responde")}</> : <><MessageSquareText size={14} className="text-emerald-600" />{t("envia a resposta pronta")}</>}</span>
  </p>
}

function KeywordInput({ value, onChange }: { value: string[]; onChange: (keywords: string[]) => void }) {
  const t = useT()
  const [text, setText] = useState("")
  const add = (raw: string) => {
    const words = raw.split(",").map((word) => word.trim()).filter((word) => word && word.length <= 80)
    const next = [...value]
    for (const word of words) if (!next.some((item) => item.toLowerCase() === word.toLowerCase()) && next.length < 20) next.push(word)
    onChange(next)
    setText("")
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Enter" || event.key === ",") && text.trim()) { event.preventDefault(); add(text) }
    if (event.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
  }
  return <div className="mt-1.5 flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
    {value.map((word) => <span key={word} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700"><Tag size={11} />{word}<button type="button" aria-label={t("Remover {word}", { word })} onClick={() => onChange(value.filter((item) => item !== word))} className="rounded hover:bg-indigo-100"><X size={12} /></button></span>)}
    <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} onBlur={() => text.trim() && add(text)} placeholder={value.length ? t("Adicionar outra…") : t("Digite e aperte Enter")} className="min-w-[140px] flex-1 bg-transparent px-1 text-sm outline-none" aria-label={t("Palavras-chave")} />
  </div>
}

export function RulesPanel({ platform, accountId, workspace, busy, run }: { platform: Platform; accountId: string; workspace: Workspace; busy: boolean; run: Run }) {
  const t = useT()
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const kinds = allowedKinds(platform)
  const maxLength = platform === "X" ? 280 : platform === "THREADS" ? 500 : 1000

  const open = (base?: Partial<RuleDraft>, id: string | null = null) => { setEditing(id); setDraft({ ...blankRule(platform), ...base }) }
  const close = () => { setDraft(null); setEditing(null) }

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const kind = TRIGGER_KIND(draft.trigger)
    if (usesKeywords(draft.trigger) && !draft.keywords.length) return
    const ai = draft.replyMode === "AI"
    // Only the replies that belong to the chosen event and network are sent.
    const payload = {
      name: draft.name.trim() || (usesKeywords(draft.trigger) ? `${kind === "COMMENT" ? t("Comentário") : t("Mensagem")}: ${draft.keywords.join(", ")}`.slice(0, 100) : kind === "COMMENT" ? t("Todo comentário") : t("Toda mensagem")),
      trigger: draft.trigger,
      keywords: usesKeywords(draft.trigger) ? draft.keywords : [],
      replyMode: draft.replyMode,
      publicCommentReply: !ai && kind === "COMMENT" ? draft.publicCommentReply : "",
      privateCommentReply: !ai && kind === "COMMENT" && platform === "INSTAGRAM" ? draft.privateCommentReply : "",
      directMessageReply: !ai && kind === "MESSAGE" ? draft.directMessageReply : "",
      continueConversation: ai && kind === "MESSAGE" ? draft.continueConversation : false,
      accountId, platform,
      enabled: editing ? workspace.automations.find((item) => item.id === editing)?.enabled || false : false,
    }
    void run(async () => {
      if (editing) await api.updateAutomation(editing, payload); else await api.createAutomation(payload)
      close()
    }, editing ? t("Regra atualizada.") : t("Regra criada. Ela começa pausada: ative quando quiser."))
  }

  const toggle = (item: Rule) => {
    if (!item.enabled && item.trigger.endsWith("_ANY") && !window.confirm(t("Esta regra vai responder a TODA nova interação deste tipo. Ativar mesmo assim?"))) return
    void run(() => api.updateAutomation(item.id, { ...item, accountId, platform, enabled: !item.enabled }), item.enabled ? t("Regra pausada.") : t("Regra ativada."))
  }

  const templatePicker = (type: TemplateType, field: "publicCommentReply" | "privateCommentReply" | "directMessageReply") => {
    const options = workspace.templates.filter((item: Template) => item.type === type)
    if (!options.length || !draft) return null
    return <select className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600" value="" onChange={(event) => { const chosen = options.find((item) => item.id === event.target.value); if (chosen) setDraft({ ...draft, [field]: chosen.content }) }} aria-label={t("Usar uma resposta salva")}>
      <option value="">{t("Usar uma resposta salva…")}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
  }

  if (draft) {
    const kind = TRIGGER_KIND(draft.trigger)
    const keywordMode = usesKeywords(draft.trigger)
    return <Card className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-2"><h2 className="text-lg font-bold text-slate-900">{editing ? t("Editar regra") : t("Nova regra")}</h2><Button type="button" variant="ghost" size="sm" onClick={close} className="gap-1"><X size={15} />{t("Cancelar")}</Button></div>
      <form onSubmit={save} className="space-y-6">
        <section>
          <p className="mb-2 text-sm font-bold text-slate-900"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">1</span>{t("Quando a automação deve agir?")}</p>
          <div className={`grid gap-2 ${kinds.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {kinds.includes("COMMENT") && <ChoiceTile selected={kind === "COMMENT"} onClick={() => setDraft({ ...draft, trigger: triggerFor("COMMENT", keywordMode), continueConversation: false })} icon={<MessageCircle size={18} />} title={t("Quando alguém comentar")} description={t("Em uma das suas publicações")} />}
            {kinds.includes("MESSAGE") && <ChoiceTile selected={kind === "MESSAGE"} onClick={() => setDraft({ ...draft, trigger: triggerFor("MESSAGE", keywordMode) })} icon={<Send size={18} />} title={t("Quando alguém mandar mensagem")} description={platform === "FACEBOOK" ? t("No Messenger da sua Página") : t("No Direct")} />}
          </div>
          <div className="mt-3 inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold" role="group" aria-label={t("Filtrar por palavras")}>
            <button type="button" aria-pressed={!keywordMode} onClick={() => setDraft({ ...draft, trigger: triggerFor(kind, false) })} className={`rounded-lg px-3 py-2 ${!keywordMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}>{t("Com qualquer texto")}</button>
            <button type="button" aria-pressed={keywordMode} onClick={() => setDraft({ ...draft, trigger: triggerFor(kind, true) })} className={`rounded-lg px-3 py-2 ${keywordMode ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}>{t("Só com palavras-chave")}</button>
          </div>
          {keywordMode && <div className="mt-3"><Field title={t("Palavras-chave")} hint={t("Ex.: EU QUERO, preço, link. A regra responde quando o texto contém uma delas.")}><KeywordInput value={draft.keywords} onChange={(keywords) => setDraft({ ...draft, keywords })} /></Field>{!draft.keywords.length && <p className="mt-1 text-[11px] text-amber-700">{t("Adicione pelo menos uma palavra.")}</p>}</div>}
        </section>

        <section>
          <p className="mb-2 text-sm font-bold text-slate-900"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">2</span>{t("Como responder?")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceTile selected={draft.replyMode === "TEMPLATE"} onClick={() => setDraft({ ...draft, replyMode: "TEMPLATE", continueConversation: false })} icon={<MessageSquareText size={18} />} title={t("Resposta pronta")} description={t("Você escreve o texto. Não usa IA.")} />
            <ChoiceTile selected={draft.replyMode === "AI"} onClick={() => setDraft({ ...draft, replyMode: "AI" })} icon={<Sparkles size={18} />} title={t("Assistente de IA")} description={t("Responde com as informações da sua empresa.")} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-bold text-slate-900"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">3</span>{draft.replyMode === "AI" ? t("Ajustes do assistente") : t("O que responder")}</p>
          {draft.replyMode === "AI" ? <>
            <Tip>{t("O assistente usa as informações cadastradas na aba")} <b>{t("Assistente de IA")}</b>. {t("Quando não tiver certeza, ele chama você para revisar.")}</Tip>
            {kind === "MESSAGE" && <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"><span><span className="font-semibold text-slate-900">{t("Continuar a conversa")}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{t("A pessoa não precisa repetir a palavra-chave. Se pedir para parar ou falar com alguém, o robô pausa.")}</span></span><Switch checked={draft.continueConversation} onCheckedChange={(checked) => setDraft({ ...draft, continueConversation: checked })} aria-label={t("Continuar a conversa")} /></label>}
          </> : kind === "COMMENT" ? <>
            <Field title={t("Resposta pública no comentário")} hint={t("Todos verão esta resposta. Até {max} caracteres.", { max: maxLength })}><textarea rows={3} maxLength={maxLength} className={inputClass} value={draft.publicCommentReply} onChange={(event) => setDraft({ ...draft, publicCommentReply: event.target.value })} placeholder={t("Ex.: Te mandei no Direct! 📩")} />{templatePicker("PUBLIC_COMMENT", "publicCommentReply")}</Field>
            {platform === "INSTAGRAM" && <Field title={t("Mensagem privada para quem comentou (opcional)")} hint={t("Enviada uma vez por comentário. A pessoa precisa responder para a conversa continuar.")}><textarea rows={3} maxLength={1000} className={inputClass} value={draft.privateCommentReply} onChange={(event) => setDraft({ ...draft, privateCommentReply: event.target.value })} placeholder={t("Ex.: Oi! Aqui está o link que você pediu…")} />{templatePicker("PRIVATE_COMMENT", "privateCommentReply")}</Field>}
            {!draft.publicCommentReply.trim() && !draft.privateCommentReply.trim() && <p className="text-[11px] text-amber-700">{t("Escreva pelo menos uma resposta.")}</p>}
          </> : <Field title={t("Resposta enviada na mensagem")} hint={t("Até 1.000 caracteres.")}><textarea required rows={4} maxLength={1000} className={inputClass} value={draft.directMessageReply} onChange={(event) => setDraft({ ...draft, directMessageReply: event.target.value })} placeholder={t("Ex.: Oi! Obrigado pela mensagem 😊")} />{templatePicker("DIRECT_MESSAGE", "directMessageReply")}</Field>}
          <Field title={t("Nome da regra (opcional)")} hint={t("Só para você identificar. Se deixar em branco, criamos um nome.")}><input maxLength={100} className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t("Ex.: Link da promoção")} /></Field>
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{editing ? t("Salvar não muda se a regra está ativa ou pausada.") : t("A regra começa pausada. Você ativa quando quiser.")}</p>
          <Button disabled={busy || (keywordMode && !draft.keywords.length)} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Zap size={15} />{editing ? t("Salvar alterações") : t("Criar regra")}</Button>
        </div>
      </form>
    </Card>
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-bold text-slate-900">{t("Suas regras")}</h2><p className="text-xs text-slate-500">{t("Cada rede tem as próprias regras. Regras com palavra-chave têm prioridade.")}</p></div>
      <Button onClick={() => open()} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Plus size={16} />{t("Nova regra")}</Button>
    </div>

    {workspace.automations.length ? <div className="space-y-3">{workspace.automations.map((item) => <Card key={item.id} className={`p-4 transition ${item.enabled ? "border-emerald-200" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.replyMode === "AI" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"}`}>{item.replyMode === "AI" ? <Bot size={18} /> : <Zap size={18} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold text-slate-900">{item.name}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.enabled ? t("Ativa") : t("Pausada")}</span>{item.continueConversation && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{t("Conversa contínua")}</span>}</div>
          <div className="mt-1.5"><RuleSentence rule={item} /></div>
        </div>
        <Switch checked={item.enabled} disabled={busy} onCheckedChange={() => toggle(item)} aria-label={item.enabled ? t("Pausar {name}", { name: item.name }) : t("Ativar {name}", { name: item.name })} />
      </div>
      <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2">
        <Button size="sm" variant="ghost" className="gap-1.5 text-slate-600" onClick={() => open({ ...item, keywords: item.keywords, publicCommentReply: item.publicCommentReply || "", privateCommentReply: item.privateCommentReply || "", directMessageReply: item.directMessageReply || "" }, item.id)}><Pencil size={14} />{t("Editar")}</Button>
        <Button size="sm" variant="ghost" className="gap-1.5 text-rose-600 hover:bg-rose-50" disabled={busy} onClick={() => { if (window.confirm(t("Excluir a regra “{name}”?", { name: item.name }))) void run(() => api.deleteAutomation(accountId, item.id, platform), t("Regra excluída.")) }}><Trash2 size={14} />{t("Excluir")}</Button>
      </div>
    </Card>)}</div> : <Card className="flex flex-col items-center gap-2 p-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Zap size={22} /></span><p className="font-semibold text-slate-900">{t("Nenhuma regra nesta rede ainda")}</p><p className="max-w-sm text-sm text-slate-500">{t("Comece por uma das ideias abaixo ou crie a sua do zero.")}</p></Card>}

    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><Lightbulb size={16} className="text-amber-500" />{t("Ideias prontas")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{PRESETS[platform].map((preset) => <button key={preset.title} type="button" onClick={() => open(localizeDraft(preset.draft, t))} className="group rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:shadow-sm">
        <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">{t(preset.title)}<ArrowRight size={14} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" /></span>
        <span className="mt-1 block text-xs leading-4 text-slate-500">{t(preset.description)}</span>
      </button>)}</div>
      <p className="mt-2 text-[11px] text-slate-500">{t("Escolher uma ideia só preenche o formulário. Nada é enviado até você criar e ativar a regra.")}</p>
    </div>
  </div>
}
