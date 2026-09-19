"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Hash, Flame, ArrowUpRight, Sparkles } from "lucide-react"

export default function TrendsPage() {
  const [query, setQuery] = useState("")
  const hashtags = ["marketingdigital", "socialmedia", "empreendedorismo", "dicasdeinstagram"]
  const trends = [
    { title: "Vídeos curtos educacionais", type: "Reels", score: 98, note: "Alta retenção" },
    { title: "Carrossel passo a passo", type: "Carrossel", score: 85, note: "Mais salvamentos" },
    { title: "Bastidores da empresa", type: "Stories", score: 72, note: "Mais respostas" },
  ]
  const inspirations = [
    { title: "Hook direto nos primeiros 3 segundos", meta: "12,4k curtidas", image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800&q=80" },
    { title: "Antes e depois com prova visual", meta: "9,8k curtidas", image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80" },
    { title: "Tutorial em uma sequência simples", meta: "8,2k curtidas", image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80" },
    { title: "Pergunta que gera comentários", meta: "6,7k curtidas", image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80" },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Radar de conteúdo</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Tendências e insights</h2><p className="mt-1 text-sm text-slate-500">Descubra padrões que podem elevar o desempenho da próxima publicação.</p></div>

      <Card className="p-4"><div className="relative"><Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 rounded-xl pl-10" placeholder="Pesquisar hashtags ou nichos..." /></div><div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">Monitoradas</span>{hashtags.filter((tag) => tag.includes(query.replace(/^#/, "").toLowerCase())).map((tag) => (<Badge key={tag} variant="secondary" className="gap-1 rounded-lg px-3 py-1.5 text-xs hover:bg-indigo-50 hover:text-indigo-700"><Hash size={13} />{tag}</Badge>))}</div></Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <section className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Flame size={19} className="text-orange-500" />Em alta no seu nicho</h3><p className="mt-1 text-xs text-slate-500">Padrões identificados nas contas monitoradas.</p></div><button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">Explorar tudo <ArrowUpRight size={14} /></button></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{inspirations.map((item) => (<Card key={item.title} className="group overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"><div className="relative h-44 overflow-hidden bg-slate-100"><img src={item.image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" /><div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs font-semibold text-white"><span>Inspiração</span><span>{item.meta}</span></div></div><div className="p-4"><p className="text-sm font-bold text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-500">Aplicável ao seu calendário editorial</p></div></Card>))}</div></section>
        <section className="space-y-4"><div><h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Sparkles size={18} className="text-indigo-600" />Formatos recomendados</h3><p className="mt-1 text-xs text-slate-500">Oportunidades priorizadas pelo potencial de resultado.</p></div>{trends.map((trend) => (<Card key={trend.title} className="border-l-4 border-l-indigo-500 p-4 transition-shadow hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><h4 className="font-bold text-slate-900">{trend.title}</h4><p className="mt-1 text-xs text-slate-500">{trend.note}</p></div><Badge variant="outline" className="shrink-0 text-[11px]">{trend.type}</Badge></div><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" style={{ width: `${trend.score}%` }} /></div><span className="text-xs font-bold text-indigo-600">{trend.score}</span></div></Card>))}</section>
      </div>
    </div>
  )
}
