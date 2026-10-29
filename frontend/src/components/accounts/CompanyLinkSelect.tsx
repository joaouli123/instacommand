"use client"

// Chooses the company (Instagram account) a Threads, X or YouTube profile belongs to.
// Reports, the dashboard and posts of a company only use the profiles linked to it.
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"

const QUERY_KEYS = { threads: "threads-accounts", x: "x-accounts", youtube: "youtube-accounts", tiktok: "tiktok-accounts" } as const

export function CompanyLinkSelect({ network, accountId, value, label, onLinked }: { network: keyof typeof QUERY_KEYS; accountId: string; value?: string | null; label: string; onLinked?: () => void }) {
  const { accounts } = useActiveAccount()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const change = async (next: string) => {
    setSaving(true)
    try {
      await api.linkNetworkAccount(network, accountId, next || null)
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS[network]] })
      onLinked?.()
      toast.success(next ? `${label} vinculado a @${accounts.find(account => account.id === next)?.igUsername || "empresa"}.` : `${label} sem empresa: não aparece em nenhum relatório nem publicação.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível vincular a empresa.")
    } finally {
      setSaving(false)
    }
  }
  const unlinked = !value || !accounts.some(account => account.id === value)
  return <label className={`flex items-center gap-1.5 text-[11px] font-semibold ${unlinked ? "text-amber-800" : "text-slate-500"}`}>
    Empresa
    <select value={unlinked ? "" : value!} disabled={saving} onChange={(event) => void change(event.target.value)} aria-label={`Empresa de ${label}`} className={`h-7 max-w-[150px] rounded-md border px-1.5 text-xs font-medium ${unlinked ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}>
      <option value="">{unlinked ? "Escolha a empresa" : "Sem empresa"}</option>
      {accounts.map(account => <option key={account.id} value={account.id}>@{account.igUsername}</option>)}
    </select>
  </label>
}
