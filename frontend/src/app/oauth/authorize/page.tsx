"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Bot, Instagram, Loader2, ShieldCheck } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type ConsentDetails = {
  client: { name: string; uri: string | null; registrationType: string; metadataUrl: string | null }
  redirectUri: string
  redirectHost: string
  loopbackOnly: boolean
  resource: string
  scopes: { id: string; label: string; description: string }[]
  user: { name: string; email: string } | null
}

export default function OAuthAuthorizePage() {
  const [request, setRequest] = useState<string | null>(null)
  const [details, setDetails] = useState<ConsentDetails | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null)

  useEffect(() => {
    // Read the query on the client only: this screen is never prerendered with user data.
    const value = new URLSearchParams(window.location.search).get("request")
    if (!value) { setError("Pedido de autorização ausente. Volte ao aplicativo e conecte novamente."); return }
    setRequest(value)
    api.describeOAuthRequest(value)
      .then((result) => { const data = result as ConsentDetails; setDetails(data); setChosen(data.scopes.map((scope) => scope.id)) })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar o pedido de autorização."))
  }, [])

  const decide = async (decision: "approve" | "deny") => {
    if (!request) return
    setSubmitting(decision)
    setError("")
    try {
      const { redirectTo } = await api.decideOAuthConsent(request, decision, decision === "approve" ? chosen : undefined) as { redirectTo: string }
      window.location.assign(redirectTo)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir a autorização.")
      setSubmitting(null)
    }
  }

  const toggle = (scope: string) => setChosen((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-lg rounded-2xl p-6 shadow-xl sm:p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 text-white shadow-md"><Instagram size={22} /></div>
          <span className="text-slate-300">⟷</span>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md"><Bot size={22} /></div>
        </div>

        {!details && !error && <p className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando pedido…</p>}

        {error && !details && (
          <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}</div>
        )}

        {details && (
          <>
            <h1 className="mt-6 text-center text-xl font-bold tracking-tight text-slate-900"><span className="text-indigo-700">{details.client.name}</span> quer acessar seu InstaCommand</h1>
            {details.user && <p className="mt-2 text-center text-xs text-slate-500">Workspace: <strong className="text-slate-700">{details.user.name}</strong> ({details.user.email})</p>}

            <div className="mt-5 space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
              <p>Após autorizar, você volta para <strong className="break-all text-slate-900">{details.redirectHost}</strong>.</p>
              {details.client.metadataUrl && <p className="break-all">Identidade verificada por <span className="font-mono">{details.client.metadataUrl}</span></p>}
              {details.client.uri && <p className="break-all">Site do aplicativo: {details.client.uri}</p>}
            </div>

            {details.loopbackOnly && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />Este aplicativo roda no seu computador (retorno para localhost). Autorize só se você acabou de iniciar a conexão em um app de confiança, como o Claude Code.
              </p>
            )}

            <p className="mt-5 text-sm font-semibold text-slate-900">Permissões solicitadas</p>
            <div className="mt-2 space-y-2">
              {details.scopes.map((scope) => (
                <label key={scope.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${chosen.includes(scope.id) ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200"}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={chosen.includes(scope.id)} onChange={() => toggle(scope.id)} />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">{scope.label}{scope.id === "admin" && <Badge variant="danger" className="px-2 py-0 text-[10px]">sensível</Badge>}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">{scope.description}</span>
                  </span>
                </label>
              ))}
            </div>

            {error && <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={Boolean(submitting)} onClick={() => decide("deny")}>{submitting === "deny" ? "Cancelando…" : "Cancelar"}</Button>
              <Button type="button" disabled={Boolean(submitting) || !chosen.length} onClick={() => decide("approve")} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700">
                <ShieldCheck size={15} />{submitting === "approve" ? "Autorizando…" : "Autorizar"}
              </Button>
            </div>
            <p className="mt-5 text-center text-[11px] leading-4 text-slate-400">Você pode desconectar este aplicativo a qualquer momento em MCP e CLI › Tokens. O InstaCommand nunca compartilha suas senhas.</p>
          </>
        )}
      </Card>
    </div>
  )
}
