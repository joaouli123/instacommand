'use client'

import { useMemo, useState } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { mediaLabel, reportFormat } from '@/lib/report-chart'

export type ReportPublication = { id: string; text: string; date: string; url: string | null; type?: string | null; metrics?: Array<{ label: string; value: number | null }>; score?: number | null }

export function ReportPublications({ posts, network, available, complete = true }: { posts: ReportPublication[]; network: 'Facebook' | 'Threads'; available: boolean; complete?: boolean }) {
  const [search, setSearch] = useState('')
  const [order, setOrder] = useState('recent')
  const [kind, setKind] = useState('all')
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => posts.filter(p => (kind === 'all' || p.type === kind) && p.text.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).sort((a, b) => {
    if (order === 'interactions') return (b.score ?? -1) - (a.score ?? -1) || Date.parse(b.date) - Date.parse(a.date)
    return (Date.parse(b.date) - Date.parse(a.date)) * (order === 'oldest' ? -1 : 1)
  }), [posts, search, kind, order])
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const currentPage = Math.min(page, pages)
  const types = Array.from(new Set(posts.map(p => p.type).filter((v): v is string => !!v)))
  const safeUrl = (url: string | null) => url && (network === 'Facebook' ? /^https:\/\/(www\.)?facebook\.com\// : /^https:\/\/(www\.)?threads\.(net|com)\//).test(url)
  return <Card className="min-w-0 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">Publicações do período</h3><p className="mt-1 text-xs text-slate-500">{available ? `${filtered.length} de ${posts.length} publicações recuperadas${complete ? '' : ' · resultado parcial'}` : 'A rede não disponibilizou as publicações.'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{network}</span></div>
    {!complete && available && <p className="mt-3 text-xs text-amber-800">A consulta não cobriu todo o período. Os dados já obtidos foram preservados; experimente um período menor.</p>}
    {posts.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
      <label className="flex min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={16} className="shrink-0 text-slate-400"/><input aria-label={`Buscar publicações do ${network}`} placeholder="Buscar no texto…" type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none"/></label>
      {types.length > 1 && <select aria-label={`Formato das publicações do ${network}`} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-sm" value={kind} onChange={e => { setKind(e.target.value); setPage(1) }}><option value="all">Todos os formatos</option>{types.map(type => <option key={type} value={type}>{mediaLabel(type)}</option>)}</select>}
      <select aria-label={`Ordenar publicações do ${network}`} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-sm" value={order} onChange={e => { setOrder(e.target.value); setPage(1) }}><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option>{posts.some(p => p.score != null) && <option value="interactions">Mais interações</option>}</select>
    </div>}
    <div className="mt-3 divide-y divide-slate-100">{filtered.slice((currentPage - 1) * 10, currentPage * 10).map(post => <article key={post.id} className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><time dateTime={post.date}>{new Date(post.date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</time>{post.type && <span className="rounded bg-slate-100 px-1.5 py-0.5">{mediaLabel(post.type)}</span>}</div>
      {post.text.length > 250 ? <details className="mt-2 text-sm leading-relaxed text-slate-700"><summary className="cursor-pointer break-words">{post.text.slice(0, 210)}… <span className="font-medium text-indigo-600">Ler mais</span></summary><p className="mt-2 whitespace-pre-wrap break-words">{post.text}</p></details> : <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{post.text || 'Publicação sem texto'}</p>}
      {post.metrics && <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{post.metrics.map(metric => <div key={metric.label} className="text-xs"><dt className="inline text-slate-500">{metric.label} </dt><dd className="inline font-semibold tabular-nums text-slate-800">{reportFormat(metric.value)}</dd></div>)}</dl>}
      {safeUrl(post.url) && <a href={post.url!} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline">Abrir no {network}<ExternalLink size={13}/></a>}
    </article>)}</div>
    {available && !filtered.length && <p className="py-8 text-center text-sm text-slate-500">{search || kind !== 'all' ? 'Nenhuma publicação corresponde aos filtros.' : 'Nenhuma publicação retornada nesse período.'}</p>}
    {pages > 1 && <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-4"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span aria-live="polite" className="text-xs text-slate-500">{currentPage} de {pages}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div>}
  </Card>
}
