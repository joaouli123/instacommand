"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { SiX } from "@icons-pack/react-simple-icons"
import { Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AvatarImage } from "@/components/ui/avatar-image"

export type XAccount = { id: string; username: string; name?: string | null; profilePicUrl?: string | null; followersCount?: number | null }
export type XAccountsPayload = { configured: boolean; accounts: XAccount[] }

export function useXAccounts() {
  return useQuery({ queryKey: ["x-accounts"], queryFn: () => api.getXAccounts() as Promise<XAccountsPayload>, staleTime: 60_000 })
}

/** Connected X profiles with connect / disconnect, in the same layout as the Threads card. */
export function XAccountsCard({ onConnect }: { onConnect: () => void }) {
  const queryClient = useQueryClient()
  const query = useXAccounts()
  const configured = query.data?.configured ?? true
  const accounts = query.data?.accounts ?? []

  const disconnect = async (account: XAccount) => {
    if (!window.confirm(`Desconectar @${account.username} do X? Posts agendados para o X deixarão de ser publicados nessa conta.`)) return
    try {
      await api.disconnectXAccount(account.id)
      await queryClient.invalidateQueries({ queryKey: ["x-accounts"] })
      toast.success(`@${account.username} foi desconectada do X`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desconectar a conta do X")
    }
  }

  return <Card className="border-slate-200/80 bg-white p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white"><SiX size={18} color="white" /></div>
        <div><h3 className="section-title">X (Twitter)</h3><p className="text-sm text-slate-500">{accounts.length ? `@${accounts[0].username} conectado` : "Conecte um perfil para publicar, agendar e acompanhar os resultados no X."}</p><p className="mt-1 text-xs text-slate-500">Métricas em Relatórios → X. Cada post publicado consome créditos da API do X.</p></div>
      </div>
      <Button variant={accounts.length ? "outline" : "secondary"} onClick={onConnect} disabled={!configured} className="gap-2">{!configured ? "Conexão em configuração" : accounts.length ? "Conectar outra conta" : "Entrar com o X"}</Button>
    </div>
    {!configured && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p className="font-semibold">A conexão com o X ainda não está pronta</p><p className="mt-1">O administrador precisa cadastrar o Client ID e o Client Secret do app do X no servidor.</p></div>}
    {accounts.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-xs font-bold text-white"><AvatarImage src={account.profilePicUrl} fallback={account.username[0]?.toUpperCase() || "X"} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">@{account.username}</span>{account.followersCount != null && <span className="block text-xs text-slate-500">{account.followersCount.toLocaleString("pt-BR")} seguidores</span>}</span></span>
      <div className="flex items-center gap-2"><Badge variant="success">Ativo</Badge><Button variant="ghost" size="icon" title={`Desconectar @${account.username}`} onClick={() => void disconnect(account)} className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14} /></Button></div>
    </div>)}</div>}
  </Card>
}
