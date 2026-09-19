"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, TrendingUp, Users, ArrowUpRight, MoreHorizontal } from "lucide-react"

export default function CompetitorsPage() {
  const [query, setQuery] = useState("")
  const competitors = [
    { name: "TechBrand", username: "@techbrand_br", followers: "250k", er: "5,4%", growth: "+8,2%", avatar: "T", tone: "from-indigo-500 to-sky-500" },
    { name: "Digital Solutions", username: "@digitalsol", followers: "120k", er: "3,2%", growth: "+4,7%", avatar: "D", tone: "from-violet-500 to-fuchsia-500" },
    { name: "Studio Norte", username: "@studionorte", followers: "86k", er: "4,8%", growth: "+6,1%", avatar: "S", tone: "from-amber-500 to-orange-500" },
  ]

  const filteredCompetitors = useMemo(
    () => competitors.filter((comp) => `${comp.name} ${comp.username}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Inteligência competitiva</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Análise de concorrentes</h2>
          <p className="mt-1 text-sm text-slate-500">Compare presença, crescimento e engajamento do seu mercado.</p>
        </div>
        <Button className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Plus size={17} /> Adicionar concorrente</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Perfis monitorados", value: "12", detail: "+2 este mês", icon: Users, tone: "bg-indigo-50 text-indigo-600" },
          { label: "Média de engajamento", value: "4,6%", detail: "+0,8% vs. seu perfil", icon: TrendingUp, tone: "bg-emerald-50 text-emerald-600" },
          { label: "Maior crescimento", value: "+8,2%", detail: "TechBrand no período", icon: ArrowUpRight, tone: "bg-amber-50 text-amber-600" },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-4 p-4"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon size={20} /></div><div><p className="text-xs font-medium text-slate-500">{stat.label}</p><p className="text-xl font-bold tracking-tight text-slate-900">{stat.value}</p><p className="text-[11px] font-medium text-slate-400">{stat.detail}</p></div></Card>
        ))}
      </div>

      <Card className="p-4"><div className="relative"><Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-xl pl-10" placeholder="Buscar por nome ou @username..." /></div></Card>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredCompetitors.map((comp) => (
          <Card key={comp.username} className="group overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg">
            <div className="flex items-start justify-between border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${comp.tone} text-lg font-bold text-white shadow-sm`}>{comp.avatar}</div><div><h3 className="font-bold text-slate-900">{comp.name}</h3><p className="text-sm text-slate-500">{comp.username}</p></div></div><button type="button" title="Mais opções" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal size={18} /></button></div>
            <div className="grid grid-cols-3 gap-2 p-5"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium text-slate-500">Seguidores</p><p className="mt-1 font-bold text-slate-900">{comp.followers}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium text-slate-500">Engajamento</p><p className="mt-1 font-bold text-indigo-600">{comp.er}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-medium text-slate-500">Crescimento</p><p className="mt-1 font-bold text-emerald-600">{comp.growth}</p></div></div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4"><Badge variant="success">Monitoramento ativo</Badge><Button variant="ghost" size="sm" className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700">Ver comparação <ArrowUpRight size={14} className="ml-1" /></Button></div>
          </Card>
        ))}
      </div>
      {filteredCompetitors.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">Nenhum concorrente encontrado.</div>}
    </div>
  )
}
