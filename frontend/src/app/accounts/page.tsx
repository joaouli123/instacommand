"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Plus, RefreshCw, Trash2, CheckCircle2, Users, Activity, Instagram, AtSign, Sparkles, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"
import { fetchApi, api } from "@/lib/api"

type ConnectedAccount = {
  id: string
  igUsername: string
  pageName?: string | null
  igProfilePicUrl?: string | null
  igFollowersCount: number
  lastSyncAt?: string | null
  isActive: boolean
}
type ConnectedThreadsAccount = { id: string; username: string; name?: string | null; profilePicUrl?: string | null; isActive: boolean }
type AiAudit = { score?: number; summary?: string; strengths?: string[]; opportunities?: string[]; actions?: string[]; bioSuggestion?: string }

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [pendingAccounts, setPendingAccounts] = useState<ConnectedAccount[]>([])
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([])
  const [savingSelection, setSavingSelection] = useState(false)
  const [threadsAccounts, setThreadsAccounts] = useState<ConnectedThreadsAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [auditLoadingId, setAuditLoadingId] = useState<string | null>(null)
  const [audit, setAudit] = useState<AiAudit | null>(null)
  const [auditAccount, setAuditAccount] = useState("")
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)
  const [disconnectingThreadId, setDisconnectingThreadId] = useState<string | null>(null)

  const startOAuth = async (path: string) => {
    try {
      const result = await fetchApi(path) as { url?: string }
      if (!result.url) throw new Error("A Meta não disponibilizou o endereço de autorização")
      window.location.assign(result.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar a conexão")
    }
  }

  const connectAccount = () => {
    setConnectDialogOpen(false)
    void startOAuth("/auth/facebook/url")
  }

  const connectThreads = () => {
    setConnectDialogOpen(false)
    void startOAuth("/auth/threads/url")
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const reason = params.get("reason")
    const threadsConnected = params.get("threads_connected")

    let active = true
    const loadAccounts = async () => {
      try {
        const oauthSession = params.get("oauth_session")
        if (oauthSession) {
          const session = await fetchApi("/auth/oauth-session", {
            method: "POST",
            body: JSON.stringify({ token: oauthSession }),
          }) as { token?: string; user?: unknown }

          if (session.token) window.localStorage.setItem("instacommand_token", session.token)
          if (session.user) window.localStorage.setItem("instacommand_user", JSON.stringify(session.user))
          params.delete("oauth_session")
          const nextQuery = params.toString()
          window.history.replaceState({}, "", `/accounts${nextQuery ? `?${nextQuery}` : ""}`)
        }

        if (connected === "1") toast.success("Conta do Instagram conectada com sucesso")
        if (connected === "pending") toast.success("A Meta encontrou contas profissionais. Escolha quais deseja vincular.")
        if (connected === "0") toast.error(reason === "no_professional_instagram"
          ? "A Meta não encontrou uma conta Instagram profissional vinculada à Página escolhida. Converta a conta em Profissional e vincule-a ao mesmo portfólio Meta."
          : reason === "meta_denied"
            ? "A Meta cancelou ou bloqueou esta conexão. Nenhum token foi salvo."
            : "A Meta recusou a conexão. Revise a Página, o portfólio e as permissões do aplicativo.")
        if (threadsConnected === "1") toast.success("Conta do Threads conectada com sucesso")
        if (threadsConnected === "0") toast.error("Não foi possível conectar a conta do Threads")
        if ((connected || threadsConnected) && !oauthSession) window.history.replaceState({}, "", "/accounts")

        const [data, threads, pending] = await Promise.all([api.getAccounts(), api.getThreadsAccounts(), api.getPendingAccounts()])
        if (!active) return
        setAccounts(data as ConnectedAccount[])
        setThreadsAccounts(threads as ConnectedThreadsAccount[])
        const pendingList = pending as ConnectedAccount[]
        setPendingAccounts(pendingList)
        setSelectedPendingIds(pendingList.map((account) => account.id))
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Entre na plataforma para carregar suas contas")
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadAccounts()

    return () => { active = false }
  }, [])

  const totalFollowers = useMemo(() => accounts.reduce((total, account) => total + (account.igFollowersCount || 0), 0), [accounts])

  const syncAccount = async (id: string) => {
    setSyncingId(id)
    try {
      const result = await fetchApi(`/accounts/${id}/sync`, { method: "POST" }) as { sync?: { importedMedia?: number; profileInsightsAvailable?: boolean } }
      await queryClient.invalidateQueries({ queryKey: ["accounts"] })
      const importedMedia = result.sync?.importedMedia ?? 0
      const insightsMessage = result.sync?.profileInsightsAvailable ? " métricas de perfil atualizadas." : " perfil atualizado; Insights ainda não liberado no app Meta."
      toast.success(`${importedMedia} publicações importadas.${insightsMessage}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível sincronizar esta conta")
    } finally {
      setSyncingId(null)
    }
  }

  const finishPendingSelection = async (accountIds: string[]) => {
    setSavingSelection(true)
    try {
      const result = await api.selectAccounts(accountIds) as { accounts?: ConnectedAccount[] }
      setAccounts(result.accounts || [])
      setPendingAccounts([])
      setSelectedPendingIds([])
      toast.success(accountIds.length ? `${accountIds.length} conta(s) vinculada(s) com sucesso` : "Seleção descartada")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar sua seleção")
    } finally {
      setSavingSelection(false)
    }
  }

  const analyzeAccount = async (account: ConnectedAccount) => {
    setAuditLoadingId(account.id)
    try {
      const response = await api.generateAi({ mode: "audit", accountId: account.id }) as { result?: AiAudit }
      setAudit(response.result || null)
      setAuditAccount(account.igUsername)
      toast.success(`Análise de @${account.igUsername} concluída.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível analisar o perfil com IA.")
    } finally {
      setAuditLoadingId(null)
    }
  }

  const disconnectAccount = async (account: ConnectedAccount) => {
    if (!window.confirm(`Desconectar @${account.igUsername}?`)) return
    try {
      await fetchApi(`/accounts/${account.id}`, { method: "DELETE" })
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      await queryClient.invalidateQueries({ queryKey: ["accounts"] })
      toast.success(`@${account.igUsername} foi desconectada`)
    } catch {
      toast.error("Não foi possível desconectar a conta")
    }
  }

  const disconnectThreads = async (account: ConnectedThreadsAccount) => {
    if (!window.confirm(`Desconectar @${account.username} do Threads?`)) return
    setDisconnectingThreadId(account.id)
    try {
      await api.disconnectThreadsAccount(account.id)
      setThreadsAccounts((current) => current.filter((item) => item.id !== account.id))
      await queryClient.invalidateQueries({ queryKey: ["threads-accounts"] })
      toast.success(`@${account.username} foi desconectada do Threads`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desconectar a conta do Threads")
    } finally {
      setDisconnectingThreadId(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Conexões</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Contas conectadas</h2><p className="mt-1 text-sm text-slate-500">Conecte Instagram, Facebook e Threads para publicar em conjunto.</p></div><Button onClick={() => setConnectDialogOpen(true)} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Plus size={17} />Adicionar conta</Button></div>

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="max-w-xl">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Conexão segura</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">Escolha a rede que deseja conectar</h3>
            <p className="mt-1 text-sm text-slate-500">Você não precisa copiar App ID, secret ou token. A autorização acontece na plataforma oficial.</p>
          </div>
          <div className="grid gap-3">
            <button type="button" onClick={connectAccount} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 text-white"><Instagram size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">Instagram + Facebook</span><span className="mt-1 block text-xs leading-5 text-slate-500">A Meta abrirá a seleção de portfólio, Página e contas Instagram profissionais.</span></span>
              <ArrowRight size={18} className="shrink-0 text-indigo-600" />
            </button>
            <button type="button" onClick={connectThreads} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white"><AtSign size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">Threads</span><span className="mt-1 block text-xs leading-5 text-slate-500">Entre com o Threads e escolha o perfil que deseja vincular ao workspace.</span></span>
              <ArrowRight size={18} className="shrink-0 text-indigo-600" />
            </button>
          </div>
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><p>Na janela da Meta, selecione apenas os portfólios/ativos que estiverem habilitados. <strong>João Lucas</strong> é o proprietário do aplicativo e não precisa ser compartilhado.</p><p>Se um portfólio aparecer cinza, como “Doce Beleza” ou “Lp Slim”, seu usuário precisa receber <strong>Controle total</strong> dele e das páginas/contas Instagram vinculadas no Meta Business.</p></div>
        </DialogContent>
      </Dialog>

      {pendingAccounts.length > 0 && <Card className="border-indigo-200 bg-indigo-50/60 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Nova conexão</p><h3 className="mt-1 text-lg font-bold text-slate-900">Escolha quais contas deseja vincular</h3><p className="mt-1 text-sm text-slate-600">A Meta encontrou {pendingAccounts.length} conta(s) profissional(is). Você pode selecionar todas ou apenas algumas.</p></div>
          <Button variant="outline" onClick={() => setSelectedPendingIds(pendingAccounts.map((account) => account.id))}>Selecionar todas</Button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{pendingAccounts.map((account) => <label key={account.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-indigo-100 bg-white p-3 transition hover:border-indigo-300"><input type="checkbox" checked={selectedPendingIds.includes(account.id)} onChange={(event) => setSelectedPendingIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} className="h-4 w-4 accent-indigo-600" /><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 text-sm font-bold text-white">{account.igProfilePicUrl ? <img src={account.igProfilePicUrl} alt="" className="h-full w-full object-cover" /> : account.igUsername[0].toUpperCase()}</div><div className="min-w-0"><p className="truncate font-bold text-slate-900">@{account.igUsername}</p><p className="truncate text-xs text-slate-500">{account.pageName || "Instagram profissional"}</p></div></label>)}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => finishPendingSelection([])} disabled={savingSelection}>Agora não</Button><Button onClick={() => finishPendingSelection(selectedPendingIds)} disabled={savingSelection}>{savingSelection ? "Salvando..." : `Vincular selecionadas (${selectedPendingIds.length})`}</Button></div>
      </Card>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[{ label: "Contas ativas", value: accounts.length.toString().padStart(2, "0"), icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" }, { label: "Seguidores totais", value: totalFollowers.toLocaleString("pt-BR"), icon: Users, tone: "bg-indigo-50 text-indigo-600" }, { label: "Última sincronização", value: accounts[0]?.lastSyncAt ? new Date(accounts[0].lastSyncAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Aguardando", icon: Activity, tone: "bg-sky-50 text-sky-600" }].map((stat) => (<Card key={stat.label} className="flex items-center gap-4 p-4"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon size={19} /></div><div><p className="text-xs font-medium text-slate-500">{stat.label}</p><p className="text-xl font-bold tracking-tight text-slate-900">{stat.value}</p></div></Card>))}</div>

      {audit && <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-fuchsia-50/60 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Assistente de IA · @{auditAccount}</p><h3 className="mt-1 text-lg font-bold text-slate-900">Análise prática do perfil</h3><p className="mt-1 max-w-3xl text-sm text-slate-600">{audit.summary || "Análise concluída com base nos dados disponíveis."}</p></div><div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-indigo-600 text-white"><span className="text-xl font-bold">{Math.round(audit.score || 0)}</span><span className="text-[10px] uppercase">score</span></div></div><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">{[["Pontos fortes", audit.strengths], ["Oportunidades", audit.opportunities], ["Próximas ações", audit.actions]].map(([title, items]) => <div key={title as string} className="rounded-xl border border-slate-100 bg-white p-3"><p className="text-xs font-bold text-slate-800">{title as string}</p><ul className="mt-2 space-y-1 text-xs text-slate-600">{(Array.isArray(items) ? items : []).slice(0, 4).map((item) => <li key={item as string}>• {item as string}</li>)}</ul></div>)}</div>{audit.bioSuggestion && <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3"><p className="text-xs font-bold text-slate-800">Sugestão de bio</p><p className="mt-1 text-sm text-slate-600">{audit.bioSuggestion}</p></div>}</Card>}

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Carregando contas conectadas...</div> : accounts.length === 0 ? <Card className="flex flex-col items-center justify-center gap-4 p-12 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Instagram size={25} /></div><div><h3 className="font-bold text-slate-900">Nenhuma conta conectada</h3><p className="mt-1 max-w-md text-sm text-slate-500">Clique em Adicionar conta para entrar com a Meta e selecionar suas contas Instagram Business ou Creator.</p></div><Button onClick={() => setConnectDialogOpen(true)} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Plus size={16} />Adicionar conta</Button></Card> : <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => (<Card key={account.id} className="flex flex-col gap-5 p-5 transition-shadow hover:shadow-lg"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 text-sm font-bold text-white">{account.igProfilePicUrl ? <img src={account.igProfilePicUrl} alt={`Avatar de ${account.igUsername}`} className="h-full w-full object-cover" /> : account.igUsername[0].toUpperCase()}</div><div><h3 className="font-bold text-slate-900">@{account.igUsername}</h3><p className="text-sm text-slate-500">{account.igFollowersCount.toLocaleString("pt-BR")} seguidores</p></div></div><Badge variant="success" className="gap-1"><CheckCircle2 size={12} />Ativo</Badge></div><div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Última sincronização <span className="font-semibold text-slate-700">{account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString("pt-BR") : "Ainda não sincronizada"}</span></div><div className="mt-auto flex flex-wrap gap-2"><Button variant="secondary" onClick={() => syncAccount(account.id)} disabled={syncingId === account.id} className="flex-1 gap-2"><RefreshCw size={15} className={syncingId === account.id ? "animate-spin" : ""} />{syncingId === account.id ? "Sincronizando" : "Sincronizar"}</Button><Button variant="outline" onClick={() => analyzeAccount(account)} disabled={auditLoadingId === account.id} className="gap-2 text-indigo-700"><Sparkles size={15} />{auditLoadingId === account.id ? "Analisando" : "Analisar com IA"}</Button><Button variant="outline" size="icon" title={`Desconectar @${account.igUsername}`} onClick={() => disconnectAccount(account)} className="text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></Button></div></Card>))}</div>}

      <Card className="border-slate-200/80 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><AtSign size={19} /></div><div><h3 className="font-bold text-slate-900">Threads</h3><p className="text-sm text-slate-500">{threadsAccounts.length ? `@${threadsAccounts[0].username} conectado` : "Conecte para publicar junto com Instagram e Facebook."}</p></div></div>
          <Button variant={threadsAccounts.length ? "outline" : "secondary"} onClick={connectThreads} className="gap-2">{threadsAccounts.length ? "Conectar outra conta" : "Entrar com Threads"}</Button>
        </div>
        {threadsAccounts.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{threadsAccounts.map((account) => <div key={account.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5"><span className="text-sm font-semibold text-slate-800">@{account.username}</span><div className="flex items-center gap-2"><Badge variant="success">Ativo</Badge><Button variant="ghost" size="icon" title={`Desconectar @${account.username}`} onClick={() => disconnectThreads(account)} disabled={disconnectingThreadId === account.id} className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14}/></Button></div></div>)}</div>}
      </Card>
    </div>
  )
}
