"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { BookOpen, CheckCircle2, ChevronDown, Download, KeyRound, Lock, MessageSquare, ShieldCheck, Sparkles, Terminal, Wrench } from "lucide-react"
import { api } from "@/lib/api"
import { BACKEND_ORIGIN } from "@/lib/config"
import { buildClientGuides, CLI_EXAMPLES, cliInstallSteps, PROMPT_EXAMPLES, type ClientGuide } from "@/lib/mcp-setup"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CodeBlock, CopyButton } from "@/components/integrations/CodeBlock"
import { TokenManager } from "@/components/integrations/TokenManager"
import { ToolCatalog } from "@/components/integrations/ToolCatalog"
import { AiBrandTile } from "@/components/integrations/ai-brands"
import type { IntegrationsCatalog } from "@/components/integrations/types"
import { cn } from "@/lib/utils"

const fallbackUrls = {
  mcp: `${BACKEND_ORIGIN}/mcp`,
  api: `${BACKEND_ORIGIN}/api`,
  cliDownload: `${BACKEND_ORIGIN}/downloads/instacommand.cjs`,
  authorizationServerMetadata: `${BACKEND_ORIGIN}/.well-known/oauth-authorization-server`,
  protectedResourceMetadata: `${BACKEND_ORIGIN}/.well-known/oauth-protected-resource/mcp`,
}

const CLI_REFERENCE = [
  ["login / logout / status / config", "Salva o token, mostra o workspace e as permissões, troca de perfil ou URL."],
  ["accounts [sync|connect|pending|select|disconnect]", "Lista contas, sincroniza, gera link de conexão (Meta/Threads) e ativa contas pendentes."],
  ["media upload | media import", "Envia arquivos locais ou importa URLs públicas e mostra as URLs prontas para posts."],
  ["posts [list|get|create|update|schedule|unschedule|publish|duplicate|delete]", "Ciclo completo das publicações: rascunho, agendamento, publicação imediata e exclusão."],
  ["calendar", "Agenda dos próximos 7 dias agrupada por dia."],
  ["analytics <relatório>", "Relatórios do Instagram e, com facebook/threads, das outras redes."],
  ["comments [list|reply|delete]", "Lê e responde comentários do Instagram."],
  ["ai <caption|plan|daily|audit|reply>", "Gera conteúdo com a IA configurada no workspace."],
  ["automations", "Mostra regras, agente de IA, execuções e conversas."],
  ["tools | call <ferramenta> chave=valor", "Lista e executa qualquer uma das ferramentas MCP."],
  ["mcp", "Ponte MCP via stdio para Claude Desktop, Cursor, Codex e outros, com envio de arquivos locais."],
]

type Choice = "chatgpt" | "claude" | "others"
type Section = "access" | "cli" | "tools" | "security"

const CHOICES: Array<{ id: Choice; name: string; hint: string }> = [
  { id: "chatgpt", name: "ChatGPT", hint: "Login em 1 clique, sem token" },
  { id: "claude", name: "Claude", hint: "Site, computador e celular" },
  { id: "others", name: "Outras IAs", hint: "Cursor, VS Code, Gemini, terminal…" },
]

export default function IntegrationsPage() {
  const catalogQuery = useQuery<IntegrationsCatalog>({ queryKey: ["integrations-catalog"], queryFn: api.getIntegrationsCatalog, staleTime: 5 * 60_000 })
  const catalog = catalogQuery.data
  const urls = catalog?.urls ?? fallbackUrls
  const [secret, setSecret] = useState("")
  const [choice, setChoice] = useState<Choice>("chatgpt")
  const [otherId, setOtherId] = useState("claude-code")
  const [openSections, setOpenSections] = useState<Section[]>([])
  const accessRef = useRef<HTMLDivElement>(null)
  const guides = useMemo(() => buildClientGuides({ mcpUrl: urls.mcp, cliUrl: urls.cliDownload, apiOrigin: urls.api.replace(/\/api$/, "") }, secret), [urls, secret])
  const otherGuides = guides.filter((item) => item.id !== "chatgpt" && item.id !== "claude")
  const guide = choice === "others" ? otherGuides.find((item) => item.id === otherId) ?? otherGuides[0] : guides.find((item) => item.id === choice) ?? guides[0]
  const install = cliInstallSteps(urls.cliDownload)

  const toggle = (section: Section) => setOpenSections((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section])
  const openTokens = () => {
    setOpenSections((current) => current.includes("access") ? current : [...current, "access"])
    requestAnimationFrame(() => accessRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  const loadingCard = (error: string) => <p className="text-sm text-slate-500">{catalogQuery.isError ? error : "Carregando…"}</p>

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Integrações de IA</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">MCP e CLI</h2><p className="mt-1 text-sm text-slate-500">Conecte o ChatGPT, o Claude ou outra IA e peça tudo na conversa. A IA sempre pede sua confirmação antes de publicar ou excluir.</p></div>

      <section aria-labelledby="pick-ai">
        <h3 id="pick-ai" className="mb-3 text-sm font-semibold text-slate-700">Qual IA você usa?</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Escolha a IA">
          {CHOICES.map((item) => {
            const selected = choice === item.id
            return <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => setChoice(item.id)}
              className={cn("relative flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:flex-row sm:gap-3 sm:p-4 sm:text-left", selected ? "border-indigo-500 shadow-sm ring-1 ring-indigo-500" : "border-slate-200 hover:border-slate-300")}>
              <AiBrandTile id={item.id} size={44} />
              <span className="min-w-0"><span className="block text-sm font-bold text-slate-900 sm:text-base">{item.name}</span><span className="hidden text-xs leading-4 text-slate-500 sm:block">{item.hint}</span></span>
              {selected && <CheckCircle2 size={18} className="absolute right-2 top-2 text-indigo-600" />}
            </button>
          })}
        </div>
      </section>

      <Card className="overflow-hidden p-0">
        {choice === "others" && <div className="border-b border-slate-100 bg-slate-50/70 p-3 sm:p-4">
          <p className="mb-2 text-xs font-semibold text-slate-600">Escolha o aplicativo</p>
          <div className="flex flex-wrap gap-2">
            {otherGuides.map((item) => <button key={item.id} type="button" onClick={() => setOtherId(item.id)} aria-pressed={guide.id === item.id}
              className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl border bg-white py-1.5 pl-1.5 pr-3 text-xs font-semibold transition", guide.id === item.id ? "border-indigo-500 text-indigo-700 ring-1 ring-indigo-500" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
              <AiBrandTile id={item.id} size={26} className="rounded-lg" />{item.name}
            </button>)}
          </div>
        </div>}
        <GuideBody guide={guide} hasToken={Boolean(secret)} onCreateToken={openTokens} />
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><MessageSquare size={16} className="text-indigo-600" />Depois de conectar, peça assim</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PROMPT_EXAMPLES.slice(0, 4).map((prompt) => (
            <li key={prompt} className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-700">
              <span>“{prompt}”</span><CopyButton text={prompt} label="" className="min-h-7 px-2" />
            </li>
          ))}
        </ul>
      </Card>

      <section className="space-y-2" aria-label="Mais opções">
        <h3 className="text-sm font-semibold text-slate-700">Mais opções</h3>
        <div ref={accessRef} className="scroll-mt-20">
          <Accordion open={openSections.includes("access")} onToggle={() => toggle("access")} icon={<KeyRound size={17} />} tone="bg-indigo-50 text-indigo-600" title="Acessos e tokens" description="Veja quais IAs estão conectadas, desconecte ou crie um token.">
            {catalog ? <TokenManager scopes={catalog.scopes} durations={catalog.tokenDurations} onSecret={setSecret} /> : loadingCard("Não foi possível carregar. Atualize a página.")}
          </Accordion>
        </div>
        <Accordion open={openSections.includes("cli")} onToggle={() => toggle("cli")} icon={<Terminal size={17} />} tone="bg-slate-100 text-slate-700" title="Linha de comando (CLI)" description="Para quem usa o terminal ou automações próprias.">
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm leading-6 text-slate-600">Um único arquivo, sem dependências. Requer Node.js 18 ou mais recente.</p><a href={urls.cliDownload} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700"><Download size={14} />Baixar CLI</a></div>
              <p className="mt-4 text-sm font-semibold text-slate-800">macOS e Linux</p>
              <CodeBlock code={install.unix} language="bash" />
              <p className="mt-4 text-sm font-semibold text-slate-800">Windows (PowerShell)</p>
              <CodeBlock code={install.windows} language="powershell" />
              <p className="mt-3 text-xs leading-5 text-slate-500">No login, cole um token criado em “Acessos e tokens”. Em automações use a variável <code className="font-mono">INSTACOMMAND_TOKEN</code>. No Windows, chame com <code className="font-mono">node $HOME\instacommand.cjs</code>.</p>
            </div>
            <details className="group rounded-xl border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold text-slate-800"><span className="flex items-center gap-2"><BookOpen size={15} className="text-indigo-600" />Comandos e exemplos</span><ChevronDown size={16} className="transition group-open:rotate-180" /></summary>
              <div className="space-y-4 border-t border-slate-100 p-3">
                <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[560px] text-left text-sm"><tbody className="divide-y divide-slate-100">{CLI_REFERENCE.map(([command, description]) => <tr key={command}><td className="px-3 py-2.5 align-top"><code className="font-mono text-[12px] font-semibold text-slate-800">{command}</code></td><td className="px-3 py-2.5 text-slate-600">{description}</td></tr>)}</tbody></table></div>
                {CLI_EXAMPLES.map((example) => <div key={example.title}><p className="text-sm text-slate-700">{example.title}</p><CodeBlock code={example.command} language="bash" /></div>)}
                <p className="text-xs text-slate-500">Ajuda completa: <code className="font-mono">instacommand help</code>. Toda saída aceita <code className="font-mono">--json</code>.</p>
              </div>
            </details>
          </div>
        </Accordion>
        <Accordion open={openSections.includes("tools")} onToggle={() => toggle("tools")} icon={<Wrench size={17} />} tone="bg-amber-50 text-amber-600" title="O que a IA consegue fazer" description={catalog ? `${catalog.tools.length} ações disponíveis, com busca.` : "Lista completa de ações disponíveis."}>
          {catalog ? <ToolCatalog tools={catalog.tools} categories={catalog.categories} /> : loadingCard("Não foi possível carregar o catálogo.")}
        </Accordion>
        <Accordion open={openSections.includes("security")} onToggle={() => toggle("security")} icon={<ShieldCheck size={17} />} tone="bg-emerald-50 text-emerald-600" title="Segurança e detalhes técnicos" description="Permissões, proteção dos dados e endereços do servidor.">
          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {(catalog?.scopes ?? []).map((scope) => <div key={scope.id} className="rounded-xl border border-slate-200 p-3"><p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Lock size={13} className="text-slate-400" />{scope.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{scope.description}</p></div>)}
            </div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" />A IA usa as mesmas regras do painel e só enxerga o seu workspace.</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" />Publicar, excluir e desconectar contas sempre pedem sua confirmação.</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" />Tokens ficam guardados de forma irreversível e aparecem uma única vez. Revogue qualquer acesso a qualquer momento.</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" />Conexões do ChatGPT e do Claude usam OAuth 2.1 com PKCE, expiram em 1 hora e renovam sozinhas.</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" />A importação de mídia só aceita imagens e vídeos de endereços públicos.</li>
            </ul>
            <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-[200px_1fr]">
              <dt className="font-semibold text-slate-700">Servidor MCP</dt><dd className="break-all font-mono text-slate-600">{urls.mcp}</dd>
              <dt className="font-semibold text-slate-700">Metadados do recurso (RFC 9728)</dt><dd className="break-all font-mono text-slate-600">{urls.protectedResourceMetadata}</dd>
              <dt className="font-semibold text-slate-700">Servidor de autorização (RFC 8414)</dt><dd className="break-all font-mono text-slate-600">{urls.authorizationServerMetadata}</dd>
              <dt className="font-semibold text-slate-700">API REST</dt><dd className="break-all font-mono text-slate-600">{urls.api}</dd>
              {catalog && <><dt className="font-semibold text-slate-700">Versão</dt><dd className="font-mono text-slate-600">v{catalog.serverVersion} · Streamable HTTP</dd></>}
            </dl>
          </div>
        </Accordion>
      </section>
    </div>
  )
}

function GuideBody({ guide, hasToken, onCreateToken }: { guide: ClientGuide; hasToken: boolean; onCreateToken: () => void }) {
  const usesOAuthOnly = guide.auth === "OAuth"
  return <div className="p-4 sm:p-6">
    <div className="flex items-start gap-3">
      <AiBrandTile id={guide.id} size={40} />
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-slate-900">{guide.name}</h3>
        <p className="text-sm text-slate-500">{guide.summary}</p>
      </div>
    </div>
    {!usesOAuthOnly && !hasToken && <div className={cn("mt-4 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between", guide.auth === "Token" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50")} >
      <p className={cn("text-xs leading-5", guide.auth === "Token" ? "text-amber-900" : "text-slate-600")}>{guide.auth === "Token" ? "Este aplicativo usa um token. Crie um e os códigos abaixo já saem preenchidos." : "Pode entrar com login (OAuth) ou com um token. Se usar token, crie um e os códigos abaixo já saem preenchidos."}</p>
      <Button size="sm" onClick={onCreateToken} className="shrink-0 gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"><KeyRound size={14} />Criar token</Button>
    </div>}
    <ol className="mt-5 space-y-5">
      {guide.steps.map((step, index) => (
        <li key={index} className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{index + 1}</span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm leading-6 text-slate-700">{step.text}</p>
            {step.code && (step.language === "text" && !step.code.includes("\n")
              ? <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 pl-3"><code className="min-w-0 flex-1 truncate font-mono text-sm text-slate-900">{step.code}</code><CopyButton text={step.code} label="Copiar" className="min-h-9 bg-indigo-600 px-3 text-white hover:bg-indigo-700 hover:text-white" /></div>
              : <CodeBlock code={step.code} language={step.language} />)}
          </div>
        </li>
      ))}
    </ol>
    {guide.note && <p className="mt-5 text-xs leading-5 text-slate-500">{guide.note}</p>}
  </div>
}

function Accordion({ open, onToggle, icon, tone, title, description, children }: { open: boolean; onToggle: () => void; icon: ReactNode; tone: string; title: string; description: string; children: ReactNode }) {
  return <Card className="overflow-hidden p-0">
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{title}</span><span className="block text-xs text-slate-500">{description}</span></span>
      <ChevronDown size={18} className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")} />
    </button>
    {/* Kept mounted while closed so a freshly created token is not lost. */}
    <div hidden={!open} className="border-t border-slate-100 p-4 sm:p-5">{children}</div>
  </Card>
}
