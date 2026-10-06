"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, KeyRound, Plug, ShieldCheck, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CopyButton } from "./CodeBlock"
import type { ScopeInfo, TokenList } from "./types"

const PRESETS: { label: string; scopes: string[] }[] = [
  { label: "Somente leitura", scopes: ["read"] },
  { label: "Gestão de conteúdo", scopes: ["read", "write", "publish"] },
  { label: "Acesso total", scopes: ["read", "write", "publish", "admin"] },
]

const DURATION_LABELS: Record<string, string> = { "7": "7 dias", "30": "30 dias", "90": "90 dias", "180": "180 dias", "365": "1 ano", never: "Sem expiração" }

const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"

export const scopeBadgeVariant = (scope: string) => scope === "admin" ? "danger" : scope === "publish" ? "warning" : scope === "write" ? "default" : "secondary"

export function TokenManager({ scopes, durations, onSecret }: { scopes: ScopeInfo[]; durations: number[]; onSecret: (secret: string) => void }) {
  const queryClient = useQueryClient()
  const tokensQuery = useQuery<TokenList>({ queryKey: ["api-tokens"], queryFn: api.getApiTokens })
  const [name, setName] = useState("Claude")
  const [selected, setSelected] = useState<string[]>(["read", "write", "publish"])
  const [duration, setDuration] = useState("90")
  const [secret, setSecret] = useState("")

  const create = useMutation({
    mutationFn: () => api.createApiToken({ name: name.trim(), scopes: selected, expiresInDays: duration === "never" ? null : Number(duration) }) as Promise<{ secret: string }>,
    onSuccess: (result) => {
      setSecret(result.secret)
      onSecret(result.secret)
      void queryClient.invalidateQueries({ queryKey: ["api-tokens"] })
      toast.success("Token criado. Copie-o agora: ele não será exibido novamente.")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível criar o token."),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiToken(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["api-tokens"] }); toast.success("Acesso revogado.") },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível revogar."),
  })

  const confirmRevoke = (id: string, label: string) => {
    if (window.confirm(`Revogar "${label}"? Qualquer agente usando este acesso para de funcionar imediatamente.`)) revoke.mutate(id)
  }

  const toggle = (scope: string) => setSelected((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])
  const canCreate = name.trim().length > 0 && selected.length > 0 && !create.isPending
  const personal = tokensQuery.data?.personal ?? []
  const oauth = tokensQuery.data?.oauth ?? []

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><KeyRound size={19} /></div>
          <div>
            <h3 className="font-bold text-slate-900">Criar token pessoal</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Para o CLI, Claude Code, Cursor, VS Code, Codex e outros clientes que usam token. ChatGPT e Claude (web/desktop) não precisam de token: eles conectam por OAuth.</p>
          </div>
        </div>
        <form className="space-y-5 p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); if (canCreate) create.mutate() }}>
          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="token-name">Nome</Label>
              <Input id="token-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Claude Code no notebook" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-duration">Validade</Label>
              <select id="token-duration" value={duration} onChange={(event) => setDuration(event.target.value)} className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {durations.map((days) => <option key={days} value={String(days)}>{DURATION_LABELS[String(days)] || `${days} dias`}</option>)}
                <option value="never">{DURATION_LABELS.never}</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Permissões</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <button key={preset.label} type="button" onClick={() => setSelected(preset.scopes)}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700">{preset.label}</button>
                ))}
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {scopes.map((scope) => (
                <label key={scope.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected.includes(scope.id) ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={selected.includes(scope.id)} onChange={() => toggle(scope.id)} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">{scope.label}<Badge variant={scopeBadgeVariant(scope.id)} className="px-2 py-0 text-[10px]">{scope.id}</Badge></span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">{scope.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {selected.includes("admin") && <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-rose-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Administração permite conectar e desconectar contas e trocar credenciais. Conceda só a agentes de confiança.</p>}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!canCreate} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><KeyRound size={15} />{create.isPending ? "Criando..." : "Criar token"}</Button>
          </div>
        </form>
        {secret && (
          <div className="border-t border-emerald-100 bg-emerald-50/70 p-5 sm:p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><ShieldCheck size={16} />Copie seu token agora</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">Por segurança ele não será exibido de novo. Os passos de conexão no topo da página já foram preenchidos com ele.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-900">{secret}</code>
              <CopyButton text={secret} label="Copiar token" />
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h3 className="font-bold text-slate-900">Tokens pessoais</h3>
          <p className="mt-1 text-xs text-slate-500">Mostramos só o início de cada token. Revogue os que não usa mais.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {tokensQuery.isLoading && <p className="p-5 text-sm text-slate-500">Carregando…</p>}
          {!tokensQuery.isLoading && !personal.length && <p className="p-5 text-sm text-slate-500">Nenhum token criado.</p>}
          {personal.map((token) => (
            <div key={token.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">{token.name}{token.expired && <Badge variant="danger">Expirado</Badge>}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{token.tokenPrefix}</p>
                <div className="mt-2 flex flex-wrap gap-1">{token.scopes.map((scope) => <Badge key={scope} variant={scopeBadgeVariant(scope)} className="px-2 py-0 text-[10px]">{scope}</Badge>)}</div>
                <p className="mt-2 text-[11px] text-slate-500">Criado {formatDate(token.createdAt)} · Último uso {formatDate(token.lastUsedAt)} · Expira {token.expiresAt ? formatDate(token.expiresAt) : "nunca"}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => confirmRevoke(token.id, token.name)} disabled={revoke.isPending} className="shrink-0 gap-2 text-rose-700 hover:bg-rose-50"><Trash2 size={14} />Revogar</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Plug size={19} /></div>
          <div>
            <h3 className="font-bold text-slate-900">Aplicativos conectados por OAuth</h3>
            <p className="mt-1 text-xs text-slate-500">ChatGPT, Claude e outros clientes que você autorizou. A conexão renova sozinha e expira após 30 dias sem uso.</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {!tokensQuery.isLoading && !oauth.length && <p className="p-5 text-sm text-slate-500">Nenhum aplicativo conectado ainda.</p>}
          {oauth.map((grant) => (
            <div key={grant.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{grant.oauthClient?.clientName || grant.name}</p>
                <div className="mt-2 flex flex-wrap gap-1">{grant.scopes.map((scope) => <Badge key={scope} variant={scopeBadgeVariant(scope)} className="px-2 py-0 text-[10px]">{scope}</Badge>)}</div>
                <p className="mt-2 text-[11px] text-slate-500">Autorizado {formatDate(grant.createdAt)} · Último uso {formatDate(grant.lastUsedAt)}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => confirmRevoke(grant.id, grant.oauthClient?.clientName || grant.name)} disabled={revoke.isPending} className="shrink-0 gap-2 text-rose-700 hover:bg-rose-50"><Trash2 size={14} />Desconectar</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
