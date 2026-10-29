"use client"

import { CompanyLinkSelect } from "@/components/accounts/CompanyLinkSelect"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { SiYoutube } from "@icons-pack/react-simple-icons"
import { Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AvatarImage } from "@/components/ui/avatar-image"
import { useLang, useT } from "@/lib/i18n"

export type YouTubeAccount = { id: string; title: string; handle?: string | null; thumbnailUrl?: string | null; subscriberCount?: number | null; workspaceAccountId?: string | null }
export type YouTubeAccountsPayload = { configured: boolean; accounts: YouTubeAccount[] }

export function useYouTubeAccounts() {
  return useQuery({ queryKey: ["youtube-accounts"], queryFn: () => api.getYouTubeAccounts() as Promise<YouTubeAccountsPayload>, staleTime: 60_000 })
}

/** Connected YouTube channels with connect / disconnect, in the same layout as the X card. */
export function YouTubeAccountsCard({ onConnect }: { onConnect: () => void }) {
  const queryClient = useQueryClient()
  const t = useT()
  const { locale } = useLang()
  const query = useYouTubeAccounts()
  const configured = query.data?.configured ?? true
  const accounts = query.data?.accounts ?? []

  const disconnect = async (account: YouTubeAccount) => {
    if (!window.confirm(t("Desconectar o canal {channel}? Vídeos agendados para o YouTube deixarão de ser publicados nesse canal.", { channel: account.title }))) return
    try {
      await api.disconnectYouTubeAccount(account.id)
      await queryClient.invalidateQueries({ queryKey: ["youtube-accounts"] })
      toast.success(t("O canal {channel} foi desconectado", { channel: account.title }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível desconectar o canal do YouTube"))
    }
  }

  return <Card className="border-slate-200/80 bg-white p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff0033] text-white"><SiYoutube size={20} color="white" /></div>
        <div><h3 className="section-title">YouTube</h3><p className="text-sm text-slate-500">{accounts.length ? t("{channel} conectado", { channel: accounts[0].title }) : t("Conecte um canal para publicar e agendar vídeos e Shorts.")}</p><p className="mt-1 text-xs text-slate-500">{t("A conexão pede apenas permissão para enviar vídeos e ler os dados do canal.")}</p></div>
      </div>
      <Button variant={accounts.length ? "outline" : "secondary"} onClick={onConnect} disabled={!configured} className="gap-2">{!configured ? t("Conexão em configuração") : accounts.length ? t("Conectar outro canal") : t("Entrar com o Google")}</Button>
    </div>
    {!configured && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p className="font-semibold">{t("A conexão com o YouTube ainda não está pronta")}</p><p className="mt-1">{t("O administrador precisa cadastrar o Client ID e o Client Secret do Google Cloud no servidor.")}</p></div>}
    {accounts.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ff0033] text-xs font-bold text-white"><AvatarImage src={account.thumbnailUrl} fallback={account.title[0]?.toUpperCase() || "Y"} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{account.title}</span><span className="block truncate text-xs text-slate-500">{[account.handle, account.subscriberCount != null ? t("{count} inscritos", { count: account.subscriberCount.toLocaleString(locale) }) : null].filter(Boolean).join(" · ")}</span></span></span>
      <div className="flex flex-wrap items-center justify-end gap-2"><CompanyLinkSelect network="youtube" accountId={account.id} value={account.workspaceAccountId} label={account.title} /><Badge variant="success">{t("Ativo")}</Badge><Button variant="ghost" size="icon" title={t("Desconectar {channel}", { channel: account.title })} onClick={() => void disconnect(account)} className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14} /></Button></div>
    </div>)}</div>}
  </Card>
}
