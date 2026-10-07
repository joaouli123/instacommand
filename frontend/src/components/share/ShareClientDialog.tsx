"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Link2, MessageSquare, Share2, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export type ShareLink = {
  id: string
  name: string
  tokenPrefix: string
  accountIds: string[]
  includeDrafts: boolean
  expiresAt: string | null
  revokedAt: string | null
  lastViewedAt: string | null
  createdAt: string
  active: boolean
  commentCount: number
  url?: string
}

const EXPIRY_OPTIONS = [
  { value: "", label: "Sem validade" },
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
]

const formatDate = (value: string) => new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("Link copiado.")
  } catch {
    toast.error("Não foi possível copiar. Selecione o link e copie manualmente.")
  }
}

/** One click: copies this account's client link, creating it the first time. */
export function ShareClientButton({ accountId, accountLabel }: { accountId?: string; accountLabel?: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const storageKey = `share-link:${accountId || "all"}`
  const share = async () => {
    setBusy(true)
    try {
      let url = 
      try { url = localStorage.getItem(storageKey) || "" } catch {}
      // The server keeps only a hash, so the full URL is remembered here; reuse it while that link is still active.
      if (url) {
        const links = await api.getShareLinks() as ShareLink[]
        if (!links.some((link) => link.active && url.includes(link.tokenPrefix))) url = ""
      }
      if (!url) {
        const created = await api.createShareLink({ name: accountLabel || "Cliente", includeDrafts: false, expiresInDays: null, accountIds: accountId ? [accountId] : [] }) as ShareLink
        url = created.url || ""
        try { localStorage.setItem(storageKey, url) } catch {}
      }
      await navigator.clipboard.writeText(url)
      toast.success("Link do cliente copiado. É só enviar!")
      setDone(true)
      window.setTimeout(() => setDone(false), 2500)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível copiar o link.")
    } finally {
      setBusy(false)
    }
  }
  return <Button variant="outline" size="sm" disabled={busy} className="h-9 gap-1.5 rounded-lg text-xs font-semibold" onClick={() => void share()}>
    {done ? <Check size={14} className="text-emerald-600" /> : <Share2 size={14} />}{done ? "Link copiado" : "Compartilhar com cliente"}
  </Button>
}

function ShareClientPanel({ accountId, accountLabel }: { accountId?: string; accountLabel?: string }) {
  const queryClient = useQueryClient()
  const linksQuery = useQuery({ queryKey: ["share-links"], queryFn: api.getShareLinks })
  const links = (linksQuery.data || []) as ShareLink[]
  const [name, setName] = useState("")
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const [expiry, setExpiry] = useState("30")
  const [onlyThisAccount, setOnlyThisAccount] = useState(true)
  const [created, setCreated] = useState<ShareLink | null>(null)

  const createMutation = useMutation({
    mutationFn: () => api.createShareLink({ name: name.trim(), includeDrafts, expiresInDays: expiry ? Number(expiry) : null, accountIds: onlyThisAccount && accountId ? [accountId] : [] }),
    onSuccess: (link: ShareLink) => {
      setCreated(link)
      setName("")
      void queryClient.invalidateQueries({ queryKey: ["share-links"] })
      if (link.url) void copyText(link.url)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível criar o link."),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeShareLink(id),
    onSuccess: () => {
      toast.success("Link revogado. Quem tiver o endereço perde o acesso.")
      void queryClient.invalidateQueries({ queryKey: ["share-links"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível revogar."),
  })

  return <div className="min-w-0 space-y-5">
    <div className="pr-8">
      <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Área do cliente</p>
      <h3 className="mt-1 text-xl font-bold text-slate-900">Compartilhar calendário</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">Gere um link público, somente leitura. O cliente vê o que será publicado e pode deixar observações em cada post, sem precisar de conta.</p>
    </div>

    {created?.url && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><Check size={15} />Link criado para {created.name}</p>
      <p className="mt-1 text-xs text-emerald-700">Copie agora: por segurança, o endereço completo só aparece uma vez.</p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={created.url} onFocus={(event) => event.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2 font-mono text-xs text-slate-700" aria-label="Link do cliente" />
        <Button size="sm" className="h-9 shrink-0 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => copyText(created.url!)}><Copy size={14} />Copiar</Button>
      </div>
    </div>}

    <form className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); if (name.trim()) createMutation.mutate() }}>
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Nome do cliente ou do link</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex.: Padaria Central — aprovação de outubro" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Validade</span>
          <select value={expiry} onChange={(event) => setExpiry(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
            {EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="space-y-2 pt-1 text-sm text-slate-700">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)} className="h-4 w-4 accent-indigo-600" />Incluir rascunhos</label>
          {accountId && <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={onlyThisAccount} onChange={(event) => setOnlyThisAccount(event.target.checked)} className="h-4 w-4 accent-indigo-600" />Só {accountLabel || "esta conta"}</label>}
        </div>
      </div>
      <Button type="submit" disabled={!name.trim() || createMutation.isPending} className="h-10 w-full gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"><Link2 size={15} />{createMutation.isPending ? "Gerando…" : "Gerar link do cliente"}</Button>
    </form>

    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Links criados</p>
      {linksQuery.isLoading ? <p className="mt-2 text-sm text-slate-500">Carregando…</p> : links.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhum link ainda.</p> : <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {links.map((link) => <li key={link.id} className="flex items-center gap-3 p-3">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", link.active ? "bg-emerald-500" : "bg-slate-300")} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{link.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
              <span className="font-mono">{link.tokenPrefix}…</span>
              <span>{link.revokedAt ? "Revogado" : !link.active ? "Expirado" : link.expiresAt ? `Até ${formatDate(link.expiresAt)}` : "Sem validade"}</span>
              {link.includeDrafts && <span>com rascunhos</span>}
              <span className="inline-flex items-center gap-0.5"><MessageSquare size={11} />{link.commentCount}</span>
              {link.lastViewedAt && <span>visto {formatDate(link.lastViewedAt)}</span>}
            </p>
          </div>
          {link.active && <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1 text-xs text-rose-600 hover:bg-rose-50" disabled={revokeMutation.isPending} onClick={() => { if (window.confirm(`Revogar o link "${link.name}"?`)) revokeMutation.mutate(link.id) }}><Trash2 size={13} />Revogar</Button>}
        </li>)}
      </ul>}
    </div>
  </div>
}
