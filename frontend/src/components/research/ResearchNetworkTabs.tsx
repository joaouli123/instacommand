"use client"

// Network picker for Competitors and Trends. Networks whose official API does not allow
// this kind of research yet stay visible, with the exact reason, instead of disappearing.
import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import { SiFacebook, SiInstagram, SiThreads, SiX, SiYoutube } from "@icons-pack/react-simple-icons"
import { Card } from "@/components/ui/card"

export type ResearchNetwork = "INSTAGRAM" | "YOUTUBE" | "FACEBOOK" | "THREADS" | "X"
type Kind = "competitors" | "trends" | "community"

const NETWORKS: Array<{ id: ResearchNetwork; label: string; Icon: typeof SiInstagram; color: string }> = [
  { id: "INSTAGRAM", label: "Instagram", Icon: SiInstagram, color: "#E1306C" },
  { id: "YOUTUBE", label: "YouTube", Icon: SiYoutube, color: "#FF0033" },
  { id: "FACEBOOK", label: "Facebook", Icon: SiFacebook, color: "#1877F2" },
  { id: "THREADS", label: "Threads", Icon: SiThreads, color: "#101113" },
  { id: "X", label: "X", Icon: SiX, color: "#000000" },
]

/** Why the network cannot be used for this research yet, or null when it can. */
export const UNAVAILABLE: Record<Kind, Partial<Record<ResearchNetwork, { title: string; text: string }>>> = {
  competitors: {
    FACEBOOK: { title: "Depende de uma aprovação da Meta", text: "Ler Páginas de outras empresas exige a permissão Page Public Content Access, aprovada pela Meta numa revisão própria. Ela será pedida quando a revisão atual do app terminar." },
    THREADS: { title: "A API do Threads não abre perfis de terceiros", text: "O Threads só entrega os números do próprio perfil. Quando a Meta liberar a busca por palavra-chave para o app, dará para acompanhar os posts públicos dos concorrentes." },
    X: { title: "Depende do plano pago da API do X", text: "Ler perfis e posts de outras contas exige o plano Basic ou superior da API do X. Com o plano contratado e uma conta do X conectada, os concorrentes passam a funcionar aqui." },
  },
  community: {
    FACEBOOK: { title: "Chega na próxima etapa", text: "Os comentários da Página do Facebook vão entrar nesta tela na próxima etapa da integração. Por enquanto, as mensagens do Messenger já podem ser respondidas em Automações." },
    THREADS: { title: "Chega na próxima etapa", text: "As respostas aos seus posts do Threads vão entrar nesta tela na próxima etapa. As respostas automáticas do Threads já funcionam em Automações." },
    X: { title: "Depende do plano pago da API do X", text: "Ler as menções e respostas do X em volume exige o plano Basic ou superior da API do X. As respostas automáticas a menções ficam em Automações." },
  },
  trends: {
    FACEBOOK: { title: "Depende de uma aprovação da Meta", text: "Ver o que está em alta em Páginas públicas exige a permissão Page Public Content Access, aprovada pela Meta numa revisão própria." },
    THREADS: { title: "Depende de uma permissão da Meta", text: "A busca por palavra-chave do Threads exige a permissão threads_keyword_search, que precisa da aprovação da Meta para este app." },
    X: { title: "Depende do plano pago da API do X", text: "Busca e tendências do X exigem o plano Basic ou superior da API do X." },
  },
}

const read = (): ResearchNetwork => {
  if (typeof window === "undefined") return "INSTAGRAM"
  const value = new URLSearchParams(window.location.search).get("network")?.toUpperCase()
  return NETWORKS.some((network) => network.id === value) ? value as ResearchNetwork : "INSTAGRAM"
}

/** Selected network, kept in ?network= so a link or a reload opens the same one. */
export function useResearchNetwork() {
  const [network, setNetwork] = useState<ResearchNetwork>("INSTAGRAM")
  useEffect(() => { setNetwork(read()) }, [])
  const change = (next: ResearchNetwork) => {
    setNetwork(next)
    const url = new URL(window.location.href)
    if (next === "INSTAGRAM") url.searchParams.delete("network"); else url.searchParams.set("network", next.toLowerCase())
    window.history.replaceState(null, "", url)
  }
  return [network, change] as const
}

export function ResearchNetworkTabs({ value, onChange, kind }: { value: ResearchNetwork; onChange: (network: ResearchNetwork) => void; kind: Kind }) {
  return <div role="tablist" aria-label="Rede social" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
    {NETWORKS.map(({ id, label, Icon, color }) => {
      const blocked = Boolean(UNAVAILABLE[kind][id])
      const selected = value === id
      return <button key={id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(id)} title={blocked ? UNAVAILABLE[kind][id]!.title : undefined}
        className={`flex min-w-[96px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${selected ? "bg-slate-900 text-white" : blocked ? "text-slate-400 hover:bg-slate-50" : "text-slate-600 hover:bg-slate-50"}`}>
        <Icon size={14} color={selected ? "#fff" : blocked ? "#94a3b8" : color} aria-hidden />{label}{blocked && <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase text-slate-500">em breve</span>}
      </button>
    })}
  </div>
}

export function UnavailableNetwork({ kind, network }: { kind: Kind; network: ResearchNetwork }) {
  const reason = UNAVAILABLE[kind][network]
  if (!reason) return null
  return <Card className="flex gap-3 border-slate-200 p-6"><Info className="mt-0.5 shrink-0 text-indigo-600" size={20} /><div><h2 className="font-semibold text-slate-900">{reason.title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{reason.text}</p></div></Card>
}
