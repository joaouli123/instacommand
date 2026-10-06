"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { BookOpen, Bot, Download, KeyRound, Lock, MessageSquare, ShieldCheck, Terminal, Wrench } from "lucide-react"
import { api } from "@/lib/api"
import { BACKEND_ORIGIN } from "@/lib/config"
import { buildClientGuides, CLI_EXAMPLES, cliInstallSteps, PROMPT_EXAMPLES } from "@/lib/mcp-setup"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CodeBlock, CopyButton } from "@/components/integrations/CodeBlock"
import { TokenManager } from "@/components/integrations/TokenManager"
import { ToolCatalog } from "@/components/integrations/ToolCatalog"
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

export default function IntegrationsPage() {
  const catalogQuery = useQuery<IntegrationsCatalog>({ queryKey: ["integrations-catalog"], queryFn: api.getIntegrationsCatalog, staleTime: 5 * 60_000 })
  const catalog = catalogQuery.data
  const urls = catalog?.urls ?? fallbackUrls
  const [secret, setSecret] = useState("")
  const [client, setClient] = useState("chatgpt")
  const guides = useMemo(() => buildClientGuides({ mcpUrl: urls.mcp, cliUrl: urls.cliDownload, apiOrigin: urls.api.replace(/\/api$/, "") }, secret), [urls, secret])
  const guide = guides.find((item) => item.id === client) ?? guides[0]
  const install = cliInstallSteps(urls.cliDownload)

  return (
    <div className="max-w-5xl space-y-6 animate-fade-in pb-10">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Integrações de IA</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">MCP e CLI</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Deixe o Claude, o ChatGPT ou outro agente de IA administrar o InstaCommand por você: enviar mídias, escrever legendas, criar rascunhos, agendar, publicar,
          responder comentários, configurar automações, consultar relatórios e conectar contas — sempre com as mesmas regras e validações do painel.
        </p>
      </div>

      <Card className="grid gap-4 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Bot size={16} className="text-indigo-600" />URL do servidor MCP</p>
          <code className="mt-2 block break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">{urls.mcp}</code>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="success">OAuth 2.1 (ChatGPT e Claude)</Badge>
            <Badge variant="secondary">Token pessoal (CLI e IDEs)</Badge>
            <Badge variant="secondary">Streamable HTTP</Badge>
            {catalog && <Badge variant="outline">{catalog.tools.length} ferramentas · v{catalog.serverVersion}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={urls.mcp} label="Copiar URL" className="min-h-10 px-3" />
          <a href={urls.cliDownload} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700"><Download size={14} />Baixar CLI</a>
        </div>
      </Card>

      <Tabs defaultValue="connect" className="space-y-5">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="connect" className="gap-1.5"><Bot size={14} />Conectar</TabsTrigger>
            <TabsTrigger value="tokens" className="gap-1.5"><KeyRound size={14} />Tokens</TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5"><Wrench size={14} />Ferramentas</TabsTrigger>
            <TabsTrigger value="cli" className="gap-1.5"><Terminal size={14} />CLI</TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5"><ShieldCheck size={14} />Segurança</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="connect" className="space-y-5">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cliente de IA">
            {guides.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={client === item.id} onClick={() => setClient(item.id)}
                className={cn("rounded-xl border px-3 py-2 text-sm font-semibold transition", client === item.id ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                {item.name}
              </button>
            ))}
          </div>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{guide.name}</h3>
              <Badge variant={guide.auth === "OAuth" ? "success" : "default"}>{guide.auth}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{guide.summary}</p>
            {!secret && guide.auth !== "OAuth" && (
              <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Os exemplos usam <code className="font-mono">SEU_TOKEN_ic_pat</code>. Crie um token na aba Tokens para preenchê-los automaticamente.
              </p>
            )}
            <ol className="mt-5 space-y-4">
              {guide.steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-slate-700">{step.text}</p>
                    {step.code && <CodeBlock code={step.code} language={step.language} />}
                  </div>
                </li>
              ))}
            </ol>
            {guide.note && <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{guide.note}</p>}
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><MessageSquare size={17} className="text-indigo-600" />Exemplos de pedidos</h3>
            <p className="mt-1 text-xs text-slate-500">Depois de conectar, converse normalmente. O agente pede sua confirmação antes de publicar, agendar ou excluir.</p>
            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {PROMPT_EXAMPLES.map((prompt) => (
                <li key={prompt} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm leading-5 text-slate-700">
                  <span>{prompt}</span><CopyButton text={prompt} label="" className="min-h-7 px-2" />
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="tokens">
          {catalog ? <TokenManager scopes={catalog.scopes} durations={catalog.tokenDurations} onSecret={setSecret} /> : <Card className="p-6 text-sm text-slate-500">{catalogQuery.isError ? "Não foi possível carregar. Atualize a página." : "Carregando…"}</Card>}
        </TabsContent>

        <TabsContent value="tools">
          {catalog ? <ToolCatalog tools={catalog.tools} categories={catalog.categories} /> : <Card className="p-6 text-sm text-slate-500">{catalogQuery.isError ? "Não foi possível carregar o catálogo." : "Carregando…"}</Card>}
        </TabsContent>

        <TabsContent value="cli" className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><Terminal size={17} className="text-indigo-600" />Instalação</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Um único arquivo, sem dependências. Requer Node.js 18 ou mais recente. A URL deste servidor já vem configurada.</p>
            <p className="mt-4 text-sm font-semibold text-slate-800">macOS e Linux</p>
            <CodeBlock code={install.unix} language="bash" />
            <p className="mt-4 text-sm font-semibold text-slate-800">Windows (PowerShell)</p>
            <CodeBlock code={install.windows} language="powershell" />
            <p className="mt-4 text-xs leading-5 text-slate-500">No login, cole um token pessoal criado na aba Tokens. Para automações e CI use a variável <code className="font-mono">INSTACOMMAND_TOKEN</code> em vez do login. No Windows, chame sempre com <code className="font-mono">node $HOME\instacommand.cjs</code>.</p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><BookOpen size={17} className="text-indigo-600" />Comandos</h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[560px] text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {CLI_REFERENCE.map(([command, description]) => (
                    <tr key={command}><td className="px-3 py-2.5 align-top"><code className="font-mono text-[12px] font-semibold text-slate-800">{command}</code></td><td className="px-3 py-2.5 text-slate-600">{description}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">Ajuda completa: <code className="font-mono">instacommand help</code>. Toda saída aceita <code className="font-mono">--json</code>. Datas como “2026-10-10 18:30” usam o fuso do seu computador.</p>
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="font-bold text-slate-900">Exemplos</h3>
            <div className="mt-3 space-y-4">
              {CLI_EXAMPLES.map((example) => (
                <div key={example.title}><p className="text-sm text-slate-700">{example.title}</p><CodeBlock code={example.command} language="bash" /></div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><Lock size={17} className="text-indigo-600" />Permissões</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(catalog?.scopes ?? []).map((scope) => (
                <div key={scope.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">{scope.label}<code className="rounded bg-slate-100 px-1.5 font-mono text-[11px]">{scope.id}</code></p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{scope.description}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck size={17} className="text-emerald-600" />Como seu workspace fica protegido</h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>• Cada ferramenta executa pela mesma API do painel: valida formatos, limites e a propriedade de cada conta. Um agente nunca enxerga outro workspace.</li>
              <li>• Tokens são guardados apenas como hash; o valor completo aparece uma única vez. Tokens de API não conseguem criar, listar ou revogar outros tokens.</li>
              <li>• Conexões OAuth (ChatGPT, Claude) exigem PKCE, ficam presas ao endereço MCP, expiram em 1 hora e renovam com rotação. Você pode desconectá-las a qualquer momento.</li>
              <li>• Publicar agora, excluir, desconectar contas e excluir comentários exigem confirmação explícita; o agente deve mostrar o que vai fazer antes.</li>
              <li>• A importação de mídia só baixa imagens e vídeos reais de endereços públicos: redes internas, arquivos que não sejam mídia e páginas HTML são recusados. O CLI só envia imagens e vídeos.</li>
              <li>• Revogue imediatamente qualquer token exposto na aba Tokens e prefira validade curta e permissões mínimas.</li>
            </ul>
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="font-bold text-slate-900">Detalhes técnicos</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[220px_1fr]">
              <dt className="font-semibold text-slate-700">Servidor MCP</dt><dd className="break-all font-mono text-xs text-slate-600">{urls.mcp}</dd>
              <dt className="font-semibold text-slate-700">Metadados do recurso (RFC 9728)</dt><dd className="break-all font-mono text-xs text-slate-600">{urls.protectedResourceMetadata}</dd>
              <dt className="font-semibold text-slate-700">Servidor de autorização (RFC 8414)</dt><dd className="break-all font-mono text-xs text-slate-600">{urls.authorizationServerMetadata}</dd>
              <dt className="font-semibold text-slate-700">API REST</dt><dd className="break-all font-mono text-xs text-slate-600">{urls.api}</dd>
            </dl>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
