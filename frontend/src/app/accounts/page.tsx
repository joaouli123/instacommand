"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, RefreshCw, Trash2, CheckCircle2, Users, Activity, Instagram } from "lucide-react"
import toast from "react-hot-toast"
import { fetchApi, api } from "@/lib/api"

type ConnectedAccount = {
  id: string
  igUsername: string
  igProfilePicUrl?: string | null
  igFollowersCount: number
  lastSyncAt?: string | null
  isActive: boolean
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const connectAccount = () => {
    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001").replace(/\/api\/?$/, "").replace(/\/$/, "")
    window.location.assign(`${backendUrl}/api/auth/facebook`)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    if (connected === "1") toast.success("Conta do Instagram conectada com sucesso")
    if (connected === "0") toast.error("Nenhuma conta profissional do Instagram foi encontrada")
    if (connected) window.history.replaceState({}, "", "/accounts")

    let active = true
    api.getAccounts()
      .then((data) => { if (active) setAccounts(data as ConnectedAccount[]) })
      .catch(() => { if (active) toast.error("Entre na plataforma para carregar suas contas") })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [])

  const totalFollowers = useMemo(() => accounts.reduce((total, account) => total + (account.igFollowersCount || 0), 0), [accounts])

  const syncAccount = async (id: string) => {
    setSyncingId(id)
    try {
      await fetchApi(`/accounts/${id}/sync`, { method: "POST" })
      toast.success("Sincronização iniciada")
    } catch {
      toast.error("Não foi possível sincronizar esta conta")
    } finally {
      setSyncingId(null)
    }
  }

  const disconnectAccount = async (account: ConnectedAccount) => {
    if (!window.confirm(`Desconectar @${account.igUsername}?`)) return
    try {
      await fetchApi(`/accounts/${account.id}`, { method: "DELETE" })
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      toast.success(`@${account.igUsername} foi desconectada`)
    } catch {
      toast.error("Não foi possível desconectar a conta")
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Conexões</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Contas conectadas</h2><p className="mt-1 text-sm text-slate-500">Conecte suas contas profissionais e gerencie tudo em um só lugar.</p></div><Button onClick={connectAccount} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Plus size={17} />Conectar nova conta</Button></div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[{ label: "Contas ativas", value: accounts.length.toString().padStart(2, "0"), icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" }, { label: "Seguidores totais", value: totalFollowers.toLocaleString("pt-BR"), icon: Users, tone: "bg-indigo-50 text-indigo-600" }, { label: "Última sincronização", value: accounts[0]?.lastSyncAt ? new Date(accounts[0].lastSyncAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Aguardando", icon: Activity, tone: "bg-sky-50 text-sky-600" }].map((stat) => (<Card key={stat.label} className="flex items-center gap-4 p-4"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon size={19} /></div><div><p className="text-xs font-medium text-slate-500">{stat.label}</p><p className="text-xl font-bold tracking-tight text-slate-900">{stat.value}</p></div></Card>))}</div>

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Carregando contas conectadas...</div> : accounts.length === 0 ? <Card className="flex flex-col items-center justify-center gap-4 p-12 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Instagram size={25} /></div><div><h3 className="font-bold text-slate-900">Nenhuma conta conectada</h3><p className="mt-1 max-w-md text-sm text-slate-500">Clique no botão acima para entrar com a Meta e selecionar suas contas Instagram Business ou Creator.</p></div><Button onClick={connectAccount} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Instagram size={16} />Entrar com a Meta</Button></Card> : <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => (<Card key={account.id} className="flex flex-col gap-5 p-5 transition-shadow hover:shadow-lg"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 text-sm font-bold text-white">{account.igProfilePicUrl ? <img src={account.igProfilePicUrl} alt={`Avatar de ${account.igUsername}`} className="h-full w-full object-cover" /> : account.igUsername[0].toUpperCase()}</div><div><h3 className="font-bold text-slate-900">@{account.igUsername}</h3><p className="text-sm text-slate-500">{account.igFollowersCount.toLocaleString("pt-BR")} seguidores</p></div></div><Badge variant="success" className="gap-1"><CheckCircle2 size={12} />Ativo</Badge></div><div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Última sincronização <span className="font-semibold text-slate-700">{account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString("pt-BR") : "Ainda não sincronizada"}</span></div><div className="mt-auto flex gap-2"><Button variant="secondary" onClick={() => syncAccount(account.id)} disabled={syncingId === account.id} className="flex-1 gap-2"><RefreshCw size={15} className={syncingId === account.id ? "animate-spin" : ""} />{syncingId === account.id ? "Sincronizando" : "Sincronizar"}</Button><Button variant="outline" size="icon" title={`Desconectar @${account.igUsername}`} onClick={() => disconnectAccount(account)} className="text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></Button></div></Card>))}</div>}
    </div>
  )
}
