"use client"

import { CompanyLinkSelect } from "@/components/accounts/CompanyLinkSelect"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { SiTiktok } from "@icons-pack/react-simple-icons"
import { Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AvatarImage } from "@/components/ui/avatar-image"
import { useLang, useT } from "@/lib/i18n"

export type TikTokAccount = { id: string; displayName: string; username?: string | null; avatarUrl?: string | null; followerCount?: number | null; workspaceAccountId?: string | null }
export type TikTokAccountsPayload = { configured: boolean; accounts: TikTokAccount[] }

export function useTikTokAccounts() {
  return useQuery({ queryKey: ["tiktok-accounts"], queryFn: () => api.getTikTokAccounts() as Promise<TikTokAccountsPayload>, staleTime: 60_000 })
}

/** Connected TikTok profiles with connect / disconnect, in the same layout as the YouTube card. */
export function TikTokAccountsCard({ onConnect }: { onConnect: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  const { locale } = useLang()
  const query = useTikTokAccounts()
  const configured = query.data?.configured ?? true
  const accounts = query.data?.accounts ?? []

  const disconnect = async (account: TikTokAccount) => {
    if (!window.confirm(t("Desconectar o perfil {name}? Vídeos agendados para o TikTok deixarão de ser publicados nesse perfil.", { name: account.displayName }))) return
    try {
      await api.disconnectTikTokAccount(account.id)
      await queryClient.invalidateQueries({ queryKey: ["tiktok-accounts"] })
      toast.success(t("O perfil {name} foi desconectado", { name: account.displayName }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível desconectar o perfil do TikTok"))
    }
  }

  return <Card className="border-slate-200/80 bg-white p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white"><SiTiktok size={20} color="white" /></div>
        <div><h3 className="section-title">TikTok</h3><p className="text-sm text-slate-500">{accounts.length ? t("{name} conectado", { name: accounts[0].displayName }) : t("Conecte um perfil para publicar e agendar vídeos.")}</p><p className="mt-1 text-xs text-slate-500">{t("A conexão pede permissão para ler o perfil, as estatísticas e os vídeos, e para publicar.")}</p></div>
      </div>
      <Button variant={accounts.length ? "outline" : "secondary"} onClick={onConnect} disabled={!configured} className="gap-2">{!configured ? t("Conexão em configuração") : accounts.length ? t("Conectar outro perfil") : t("Entrar com o TikTok")}</Button>
    </div>
    {!configured && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p className="font-semibold">{t("A conexão com o TikTok ainda não está pronta")}</p><p className="mt-1">{t("O administrador precisa cadastrar o Client Key e o Client Secret do app do TikTok no servidor.")}</p></div>}
    {accounts.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-xs font-bold text-white"><AvatarImage src={account.avatarUrl} fallback={account.displayName[0]?.toUpperCase() || "T"} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{account.displayName}</span><span className="block truncate text-xs text-slate-500">{[account.username ? `@${account.username}` : null, account.followerCount != null ? t("{count} seguidores", { count: account.followerCount.toLocaleString(locale) }) : null].filter(Boolean).join(" · ")}</span></span></span>
      <div className="flex flex-wrap items-center justify-end gap-2"><CompanyLinkSelect network="tiktok" accountId={account.id} value={account.workspaceAccountId} label={account.displayName} /><Badge variant="success">{t("Ativo")}</Badge><Button variant="ghost" size="icon" title={t("Desconectar {name}", { name: account.displayName })} onClick={() => void disconnect(account)} className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14} /></Button></div>
    </div>)}</div>}
  </Card>
}
