"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Plus, RefreshCw, Trash2, CheckCircle2, Users, Activity, Instagram, AtSign, Sparkles, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"
import { fetchApi, api } from "@/lib/api"
import { announceAccountsConnected, notifySameTabAccountsConnected, subscribeAccountsConnected } from "@/lib/oauth-broadcast"
import { ScreenshotAnalysis } from "@/components/dashboard/ScreenshotAnalysis"
import { ProfileAudit, type AiAudit } from "@/components/dashboard/ProfileAudit"
import { AvatarImage } from "@/components/ui/avatar-image"
import { tr, useLang, useT, withAuthLocale } from "@/lib/i18n"

type ConnectedAccount = {
  id: string
  igUsername: string
  pageName?: string | null
  igProfilePicUrl?: string | null
  igFollowersCount: number
  lastSyncAt?: string | null
  isActive: boolean
  // True while the server imports posts and metrics (first sync after connecting).
  syncing?: boolean
}
type ConnectedThreadsAccount = { id: string; username: string; name?: string | null; profilePicUrl?: string | null; isActive: boolean }
type ThreadsOAuthStatus = { appIdConfigured: boolean; appSecretConfigured: boolean; platformConfigured: boolean; credentialSource: 'platform' | 'workspace' | 'missing' }

import { XAccountsCard } from "@/components/accounts/XAccountsCard"
import { SiX } from "@icons-pack/react-simple-icons"

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const t = useT()
  const { locale } = useLang()
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [pendingAccounts, setPendingAccounts] = useState<ConnectedAccount[]>([])
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([])
  const [savingSelection, setSavingSelection] = useState(false)
  const [threadsAccounts, setThreadsAccounts] = useState<ConnectedThreadsAccount[]>([])
  const [threadsOAuthStatus, setThreadsOAuthStatus] = useState<ThreadsOAuthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [auditLoadingId, setAuditLoadingId] = useState<string | null>(null)
  const [audit, setAudit] = useState<AiAudit | null>(null)
  const [auditAccount, setAuditAccount] = useState("")
  const [auditVersion, setAuditVersion] = useState(0)
  const [auditObjective, setAuditObjective] = useState("")
  const [auditAudience, setAuditAudience] = useState("")
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)
  const [disconnectingThreadId, setDisconnectingThreadId] = useState<string | null>(null)
  // Set in the tab opened only for the authorization, once the original tab took over.
  const [handedOff, setHandedOff] = useState(false)

  const startOAuth = async (path: string) => {
    // Open synchronously from the click handler so browser popup blockers do
    // not reject the authorization tab after the API request completes.
    const authWindow = window.open("about:blank", "_blank")
    if (!authWindow) {
      toast.error(t("Permita pop-ups para conectar a conta sem sair desta página."))
      return
    }
    authWindow.opener = null
    authWindow.document.title = t("Conectar conta")
    authWindow.document.body.textContent = t("Abrindo a autorização segura…")

    try {
      const result = await fetchApi(path) as { url?: string }
      if (!result.url) throw new Error(t("A Meta não disponibilizou o endereço de autorização"))
      authWindow.location.replace(withAuthLocale(result.url))
    } catch (error) {
      authWindow.close()
      toast.error(error instanceof Error ? error.message : t("Não foi possível iniciar a conexão"))
    }
  }

  const connectAccount = () => {
    setConnectDialogOpen(false)
    void startOAuth("/auth/facebook/url")
  }

  const connectThreads = () => {
    setConnectDialogOpen(false)
    if (threadsOAuthStatus && !threadsOAuthStatus.appIdConfigured) {
      toast.error(t("A conexão do Threads ainda não foi habilitada pelo administrador. Você não precisa criar app nem copiar token."))
      return
    }
    if (threadsOAuthStatus && !threadsOAuthStatus.appSecretConfigured) {
      toast.error(t("Falta concluir uma configuração do Threads no servidor. Você não precisa informar credenciais; avise o administrador do sistema."))
      return
    }
    void startOAuth("/auth/threads/url")
  }

  const connectX = () => {
    setConnectDialogOpen(false)
    void startOAuth("/auth/x/url")
  }

  const refreshAccounts = useCallback(async () => {
    const [data, threads, pending, oauthStatus] = await Promise.all([
      api.getAccounts(), api.getThreadsAccounts(), api.getPendingAccounts(),
      api.getThreadsOAuthStatus().catch(() => null),
    ])
    setAccounts(data as ConnectedAccount[])
    setThreadsAccounts(threads as ConnectedThreadsAccount[])
    setThreadsOAuthStatus(oauthStatus as ThreadsOAuthStatus | null)
    const pendingList = pending as ConnectedAccount[]
    setPendingAccounts(pendingList)
    setSelectedPendingIds(pendingList.map((account) => account.id))
    queryClient.setQueryData(["accounts"], data)
  }, [queryClient])

  // The OAuth return (session handoff, toasts, cross-tab announcement) must run
  // exactly once. React may run this effect twice in development, and the URL
  // is cleaned on the first pass; a ref survives that and shares the result.
  const connectionReturn = useRef<Promise<{ handedOff: boolean }> | null>(null)

  useEffect(() => {
    let active = true
    const processConnectionReturn = async () => {
      const params = new URLSearchParams(window.location.search)
      const connected = params.get("connected")
      const reason = params.get("reason")
      const threadsConnected = params.get("threads_connected")
      const xConnected = params.get("x_connected")
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

      if (connected === "1") toast.success(tr("Conta conectada. Importando publicações e métricas…"))
      if (connected === "pending") toast.success(tr("A Meta encontrou contas profissionais. Escolha quais deseja vincular."))
      if (connected === "0") toast.error(tr(reason === "no_professional_instagram"
        ? "Nenhuma conta Instagram elegível foi importada. Verifique na Meta o vínculo com a Página e o acesso concedido ao aplicativo."
        : reason === "account_workspace_conflict"
          ? "A conta autorizada já está vinculada a outro cadastro do InstaCommand. Entre nesse cadastro ou solicite a transferência dos vínculos. Não é necessário converter o Instagram."
          : reason === "meta_denied"
          ? "A Meta cancelou ou bloqueou esta conexão. Nenhum token foi salvo."
          : "A Meta recusou a conexão. Revise a Página, o portfólio e as permissões do aplicativo."))
      if (threadsConnected === "1") toast.success(tr("Conta do Threads conectada com sucesso"))
      if (threadsConnected === "0") toast.error(tr(reason === "threads_denied"
        ? "Você cancelou ou a Meta recusou a autorização do Threads. Nenhuma conta foi vinculada."
        : reason === "threads_callback_missing_code"
          ? "A Meta não retornou o código de autorização. Confira o endereço de retorno configurado no app Threads."
          : reason === "threads_account_conflict"
            ? "Essa conta Threads já está vinculada a outro usuário do InstaCommand. Entre no cadastro que a conectou primeiro."
            : "A conexão Threads falhou. Verifique a configuração do app Threads, as permissões autorizadas e tente novamente."))
      if (xConnected === "1") toast.success(tr("Conta do X conectada com sucesso"))
      if (xConnected === "0") toast.error(tr(reason === "x_denied"
        ? "Você cancelou ou o X recusou a autorização. Nenhuma conta foi vinculada."
        : reason === "x_account_conflict"
          ? "Essa conta do X já está vinculada a outro usuário do InstaCommand."
          : reason === "x_callback_missing_code"
            ? "O X não retornou o código de autorização. Confira a Callback URL configurada no app do X."
            : "A conexão com o X falhou. Confira se o app do X tem permissão de leitura e escrita e tente novamente."))
      if (xConnected === "1") void queryClient.invalidateQueries({ queryKey: ["x-accounts"] })
      if ((connected || threadsConnected || xConnected) && !oauthSession) window.history.replaceState({}, "", "/accounts")

      await refreshAccounts()
      if (connected === "1" || connected === "pending" || threadsConnected === "1") {
        // Refresh every screen of this tab and follow the first sync...
        notifySameTabAccountsConnected()
        // ...and tell the tab that started the connection. If it answers,
        // this tab existed only for the authorization and can close itself.
        return { handedOff: await announceAccountsConnected() }
      }
      return { handedOff: false }
    }

    connectionReturn.current ??= processConnectionReturn()
    connectionReturn.current
      .then(({ handedOff: tookOver }) => {
        if (!active || !tookOver) return
        setHandedOff(true)
        window.setTimeout(() => window.close(), 1200)
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : tr("Entre na plataforma para carregar suas contas"))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const unsubscribe = subscribeAccountsConnected(() => {
      void refreshAccounts().then(() => toast.success(tr("Conta conectada. Importando publicações e métricas…"))).catch(() => {
        toast.error(tr("A conexão foi concluída, mas não foi possível atualizar a lista. Recarregue a página."))
      })
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [refreshAccounts])

  // While the server runs the first import, keep the cards current; the last
  // poll shows the final follower count and sync time.
  const anySyncing = accounts.some((account) => account.syncing)
  useEffect(() => {
    if (!anySyncing) return
    const timer = window.setTimeout(() => { void refreshAccounts().catch(() => undefined) }, 3000)
    return () => window.clearTimeout(timer)
  }, [accounts, anySyncing, refreshAccounts])

  const totalFollowers = useMemo(() => accounts.reduce((total, account) => total + (account.igFollowersCount || 0), 0), [accounts])

  const syncAccount = async (id: string) => {
    setSyncingId(id)
    try {
      const result = await fetchApi(`/accounts/${id}/sync`, { method: "POST" }) as { sync?: { importedMedia?: number; removedMedia?: number; mediaSnapshotComplete?: boolean; profileInsightsAvailable?: boolean } }
      // Refresh the cards and every cached report, not just the dashboard.
      await Promise.all([refreshAccounts(), queryClient.invalidateQueries()])
      const importedMedia = result.sync?.importedMedia ?? 0
      const removedMedia = result.sync?.removedMedia ?? 0
      const mediaMessage = removedMedia
        ? ` ${t("{count} publicação(ões) apagada(s) removida(s) do dashboard.", { count: removedMedia })}`
        : result.sync?.mediaSnapshotComplete === false
          ? ` ${t("Leitura parcial da Meta; os posts antigos foram mantidos por segurança.")}`
          : ""
      const insightsMessage = ` ${result.sync?.profileInsightsAvailable ? t("métricas de perfil atualizadas.") : t("perfil atualizado; Insights ainda não liberado no app Meta.")}`
      toast.success(`${t("{count} publicações encontradas.", { count: importedMedia })}${mediaMessage}${insightsMessage}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível sincronizar esta conta"))
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
      toast.success(accountIds.length ? t("{count} conta(s) vinculada(s) com sucesso", { count: accountIds.length }) : t("Seleção descartada"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível salvar sua seleção"))
    } finally {
      setSavingSelection(false)
    }
  }

  const analyzeAccount = async (account: ConnectedAccount) => {
    if (auditLoadingId) return
    setAuditLoadingId(account.id)
    try {
      const response = await api.generateAi({ mode: "audit", accountId: account.id, objective: auditObjective, audience: auditAudience }) as { result?: AiAudit }
      if (!response.result) throw new Error(t("A IA não retornou a análise. Tente novamente."))
      setAudit(response.result)
      setAuditVersion(value => value + 1)
      setAuditAccount(account.igUsername)
      toast.success(t("Análise de @{username} concluída.", { username: account.igUsername }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível analisar o perfil com IA."))
    } finally {
      setAuditLoadingId(null)
    }
  }

  const disconnectAccount = async (account: ConnectedAccount) => {
    if (!window.confirm(t("Desconectar @{username}?", { username: account.igUsername }))) return
    try {
      await fetchApi(`/accounts/${account.id}`, { method: "DELETE" })
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      await queryClient.invalidateQueries({ queryKey: ["accounts"] })
      toast.success(t("@{username} foi desconectada", { username: account.igUsername }))
    } catch {
      toast.error(t("Não foi possível desconectar a conta"))
    }
  }

  const disconnectThreads = async (account: ConnectedThreadsAccount) => {
    if (!window.confirm(t("Desconectar @{username} do Threads?", { username: account.username }))) return
    setDisconnectingThreadId(account.id)
    try {
      await api.disconnectThreadsAccount(account.id)
      setThreadsAccounts((current) => current.filter((item) => item.id !== account.id))
      await queryClient.invalidateQueries({ queryKey: ["threads-accounts"] })
      toast.success(t("@{username} foi desconectada do Threads", { username: account.username }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível desconectar a conta do Threads"))
    } finally {
      setDisconnectingThreadId(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header"><div><p className="page-eyebrow">{t("Conexões")}</p><h1 className="page-title">{t("Contas conectadas")}</h1><p className="page-subtitle">{t("Gerencie suas contas do Instagram, Facebook, Threads e X.")}</p></div><Button onClick={() => setConnectDialogOpen(true)} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Plus size={17} />{t("Adicionar conta")}</Button></div>

      {handedOff && <Card className="flex items-start gap-3 border-emerald-200 bg-emerald-50/70 p-4">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
        <div><p className="font-semibold text-emerald-900">{t("Conexão concluída")}</p><p className="mt-0.5 text-sm text-emerald-800">{t("A aba original do InstaCommand já foi atualizada com a nova conta. Você pode fechar esta aba.")}</p></div>
      </Card>}

      <ScreenshotAnalysis />
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent aria-label={t("Conectar uma conta")} className="max-w-xl">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">{t("Conexão segura")}</p>
            <h3 className="mt-1 pr-5 text-lg font-bold text-slate-900 sm:text-xl">{t("Escolha a rede que deseja conectar")}</h3>
            <p className="mt-1 text-sm text-slate-500">{t("Entre e autorize na janela oficial da rede. Não é preciso copiar códigos ou senhas para o sistema.")}</p>
          </div>
          <div className="grid gap-3">
            <button type="button" onClick={connectAccount} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 text-white"><Instagram size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">Instagram + Facebook</span><span className="mt-1 block text-xs leading-5 text-slate-500">{t("A Meta abrirá a seleção de portfólio, Página e contas Instagram profissionais.")}</span></span>
              <ArrowRight size={18} className="shrink-0 text-indigo-600" />
            </button>
            <button type="button" onClick={connectThreads} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white"><AtSign size={21} /></span>
              <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">Threads</span><span className="mt-1 block text-xs leading-5 text-slate-500">{t("Entre com o Threads e escolha o perfil que deseja vincular ao workspace.")}</span></span>
              <ArrowRight size={18} className="shrink-0 text-indigo-600" />
            </button>
            <button type="button" onClick={connectX} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black text-white"><SiX size={18} color="white" /></span>
              <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">X (Twitter)</span><span className="mt-1 block text-xs leading-5 text-slate-500">{t("Entre com o X e autorize publicar e ler as métricas do perfil.")}</span></span>
              <ArrowRight size={18} className="shrink-0 text-indigo-600" />
            </button>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{t("Selecione apenas as contas e Páginas que deseja gerenciar. Se uma opção não estiver disponível, confira seu acesso a ela no Meta Business.")}</div>
        </DialogContent>
      </Dialog>

      {pendingAccounts.length > 0 && <Card className="border-indigo-200 bg-indigo-50/60 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">{t("Nova conexão")}</p><h3 className="mt-1 text-lg font-bold text-slate-900">{t("Escolha quais contas deseja vincular")}</h3><p className="mt-1 text-sm text-slate-600">{t("A Meta encontrou {count} conta(s) profissional(is). Você pode selecionar todas ou apenas algumas.", { count: pendingAccounts.length })}</p></div>
          <Button variant="outline" onClick={() => setSelectedPendingIds(pendingAccounts.map((account) => account.id))}>{t("Selecionar todas")}</Button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{pendingAccounts.map((account) => <label key={account.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-indigo-100 bg-white p-3 transition hover:border-indigo-300"><input type="checkbox" checked={selectedPendingIds.includes(account.id)} onChange={(event) => setSelectedPendingIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} className="h-4 w-4 accent-indigo-600" /><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 text-sm font-bold text-white"><AvatarImage src={account.igProfilePicUrl} fallback={account.igUsername[0].toUpperCase()} /></div><div className="min-w-0"><p className="truncate font-bold text-slate-900">@{account.igUsername}</p><p className="truncate text-xs text-slate-500">{account.pageName || t("Instagram profissional")}</p></div></label>)}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => finishPendingSelection([])} disabled={savingSelection}>{t("Agora não")}</Button><Button onClick={() => finishPendingSelection(selectedPendingIds)} disabled={savingSelection}>{savingSelection ? t("Salvando...") : t("Vincular selecionadas ({count})", { count: selectedPendingIds.length })}</Button></div>
      </Card>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[{ label: t("Contas ativas"), value: accounts.length.toString().padStart(2, "0"), icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" }, { label: t("Seguidores totais"), value: totalFollowers.toLocaleString(locale), icon: Users, tone: "bg-indigo-50 text-indigo-600" }, { label: t("Última sincronização"), value: accounts[0]?.lastSyncAt ? new Date(accounts[0].lastSyncAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : t("Aguardando"), icon: Activity, tone: "bg-sky-50 text-sky-600" }].map((stat) => (<Card key={stat.label} className="flex min-w-0 items-center gap-3 p-3.5 last:col-span-2 sm:last:col-span-1"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 ${stat.tone}`}><stat.icon size={19} /></div><div><p className="text-xs font-medium text-slate-500">{stat.label}</p><p className="break-words text-lg font-bold tracking-tight text-slate-900">{stat.value}</p></div></Card>))}</div>

      <details className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">{t("Personalizar análise de perfil com IA")}</summary><p className="text-sm text-slate-600">{t("Informe seu objetivo e público, depois clique em Analisar com IA na conta desejada. A análise usa a bio, dados disponíveis e até oito legendas recentes dessa conta, enviados ao provedor de IA configurado; pode consumir sua cota.")}</p><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold">{t("Objetivo (opcional)")}<input value={auditObjective} onChange={event => setAuditObjective(event.target.value)} maxLength={200} placeholder={t("Ex.: atrair clientes para meu serviço")} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label><label className="text-sm font-semibold">{t("Público que deseja atrair (opcional)")}<input value={auditAudience} onChange={event => setAuditAudience(event.target.value)} maxLength={300} placeholder={t("Ex.: pequenos negócios da minha região")} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label></div></details>
      {audit && <ProfileAudit key={auditVersion} audit={audit} username={auditAccount} />}

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{t("Carregando contas conectadas...")}</div> : accounts.length === 0 ? <Card className="flex flex-col items-center justify-center gap-4 p-12 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Instagram size={25} /></div><div><h3 className="section-title">{t("Nenhuma conta conectada")}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{t("Clique em Adicionar conta para entrar com a Meta e selecionar suas contas Instagram Business ou Creator.")}</p></div><Button onClick={() => setConnectDialogOpen(true)} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Plus size={16} />{t("Adicionar conta")}</Button></Card> : <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => (<Card key={account.id} className="flex flex-col gap-5 p-5 transition-shadow hover:shadow-lg"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 text-sm font-bold text-white"><AvatarImage src={account.igProfilePicUrl} alt={t("Avatar de {username}", { username: account.igUsername })} fallback={account.igUsername[0].toUpperCase()} /></div><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-900">@{account.igUsername}</h3><p className="text-sm text-slate-500">{t("{count} seguidores", { count: account.igFollowersCount.toLocaleString(locale) })}</p></div></div><Badge variant="success" className="gap-1"><CheckCircle2 size={12} />{t("Ativo")}</Badge></div><div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">{account.syncing ? <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-700"><RefreshCw size={12} className="animate-spin" />{t("Importando publicações e métricas…")}</span> : <>{t("Última sincronização")} <span className="font-semibold text-slate-700">{account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString(locale) : t("Ainda não sincronizada")}</span></>}</div><div className="mt-auto flex flex-wrap gap-2"><Button variant="secondary" onClick={() => syncAccount(account.id)} disabled={syncingId === account.id || account.syncing} className="flex-1 gap-2"><RefreshCw size={15} className={syncingId === account.id || account.syncing ? "animate-spin" : ""} />{syncingId === account.id || account.syncing ? t("Sincronizando") : t("Sincronizar")}</Button><Button variant="outline" onClick={() => analyzeAccount(account)} disabled={Boolean(auditLoadingId)} className="gap-2 text-indigo-700"><Sparkles size={15} />{auditLoadingId === account.id ? t("Analisando") : t("Analisar com IA")}</Button><Button variant="outline" size="icon" title={t("Desconectar @{username}", { username: account.igUsername })} onClick={() => disconnectAccount(account)} className="text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></Button></div></Card>))}</div>}

      <Card className="border-slate-200/80 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><AtSign size={19} /></div><div><h3 className="section-title">Threads</h3><p className="text-sm text-slate-500">{threadsAccounts.length ? t("@{username} conectado", { username: threadsAccounts[0].username }) : t("Conecte um perfil para publicar e acompanhar os resultados.")}</p><p className="mt-1 text-xs text-slate-500">{t("Veja as publicações e métricas disponíveis em Analytics → Threads. Os dados dependem das permissões concedidas pela conta.")}</p></div></div>
          <Button variant={threadsAccounts.length ? "outline" : "secondary"} onClick={connectThreads} disabled={Boolean(threadsOAuthStatus && (!threadsOAuthStatus.appIdConfigured || !threadsOAuthStatus.appSecretConfigured))} className="gap-2">{threadsAccounts.length ? t("Conectar outra conta") : threadsOAuthStatus && (!threadsOAuthStatus.appIdConfigured || !threadsOAuthStatus.appSecretConfigured) ? t("Conexão em configuração") : t("Entrar com Threads")}</Button>
        </div>
        {threadsOAuthStatus && (!threadsOAuthStatus.appIdConfigured || !threadsOAuthStatus.appSecretConfigured) && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p className="font-semibold">{t("A conexão automática ainda não está pronta")}</p><p className="mt-1">{t("O administrador do InstaCommand precisa concluir a configuração do Threads uma vez no servidor. Você não precisa criar aplicativo, copiar ID ou colar token.")}</p></div>}
        {threadsAccounts.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{threadsAccounts.map((account) => <div key={account.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5"><span className="text-sm font-semibold text-slate-800">@{account.username}</span><div className="flex items-center gap-2"><Badge variant="success">{t("Ativo")}</Badge><Button variant="ghost" size="icon" title={t("Desconectar @{username}", { username: account.username })} onClick={() => disconnectThreads(account)} disabled={disconnectingThreadId === account.id} className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14}/></Button></div></div>)}</div>}
      </Card>

      <XAccountsCard onConnect={connectX} />
    </div>
  )
}
