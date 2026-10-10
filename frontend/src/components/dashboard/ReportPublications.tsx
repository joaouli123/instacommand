'use client'

import { useMemo, useState } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { mediaLabel, reportFormat } from '@/lib/report-chart'
import { MediaPreview } from './MediaPreview'
import { useLang, useT } from '@/lib/i18n'

export type ReportPublication = { id: string; text: string; image?: string | null; date: string; url: string | null; type?: string | null; metrics?: Array<{ label: string; value: number | null }>; score?: number | null }

export function ReportPublications({ posts, network, available, complete = true }: { posts: ReportPublication[]; network: 'Facebook' | 'Threads'; available: boolean; complete?: boolean }) {
  const t = useT()
  const { locale } = useLang()
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
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="section-title">{t('Publicações do período')}</h3><p className="mt-1 text-xs text-slate-500">{available ? `${t('{shown} de {total} publicações recuperadas', { shown: filtered.length, total: posts.length })}${complete ? '' : ` · ${t('resultado parcial')}`}` : t('A rede não disponibilizou as publicações.')}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{network}</span></div>
    {!complete && available && <p className="mt-3 text-xs text-amber-800">{t('A consulta não cobriu todo o período. Os dados já obtidos foram preservados; experimente um período menor.')}</p>}
    {posts.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
      <label className="flex min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={16} className="shrink-0 text-slate-400"/><input aria-label={t('Buscar publicações do {network}', { network })} placeholder={t('Buscar no texto…')} type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="min-h-10 w-full min-w-0 bg-transparent text-sm outline-none"/></label>
      {types.length > 1 && <select aria-label={t('Formato das publicações do {network}', { network })} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-sm" value={kind} onChange={e => { setKind(e.target.value); setPage(1) }}><option value="all">{t('Todos os formatos')}</option>{types.map(type => <option key={type} value={type}>{mediaLabel(type)}</option>)}</select>}
      <select aria-label={t('Ordenar publicações do {network}', { network })} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-sm" value={order} onChange={e => { setOrder(e.target.value); setPage(1) }}><option value="recent">{t('Mais recentes')}</option><option value="oldest">{t('Mais antigas')}</option>{posts.some(p => p.score != null) && <option value="interactions">{t('Mais interações')}</option>}</select>
    </div>}
    <div className="mt-3 divide-y divide-slate-100">{filtered.slice((currentPage - 1) * 10, currentPage * 10).map(post => <article key={post.id} className="flex gap-3 py-4">
      {post.image !== undefined && <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><MediaPreview src={post.image} fallback="" /></div>}
      <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><time dateTime={post.date}>{new Date(post.date).toLocaleString(locale, { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</time>{post.type && <span className="rounded bg-slate-100 px-1.5 py-0.5">{mediaLabel(post.type)}</span>}</div>
      {post.text.length > 110 ? <details className="mt-1.5 text-sm leading-relaxed text-slate-700"><summary className="cursor-pointer break-words">{post.text.slice(0, 100).trimEnd()}… <span className="font-medium text-indigo-600">{t('Ler mais')}</span></summary><p className="mt-2 whitespace-pre-wrap break-words">{post.text}</p></details> : <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{post.text || t('Publicação sem texto')}</p>}
      {post.metrics && <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{post.metrics.map(metric => <div key={metric.label} className="text-xs"><dt className="inline text-slate-500">{t(metric.label)} </dt><dd className="inline font-semibold tabular-nums text-slate-800">{reportFormat(metric.value)}</dd></div>)}</dl>}
      {safeUrl(post.url) && <a href={post.url!} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline">{t('Abrir no {network}', { network })}<ExternalLink size={13}/></a>}
      </div>
    </article>)}</div>
    {available && !filtered.length && <p className="py-8 text-center text-sm text-slate-500">{search || kind !== 'all' ? t('Nenhuma publicação corresponde aos filtros.') : t('Nenhuma publicação retornada nesse período.')}</p>}
    {pages > 1 && <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-4"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t('Anterior')}</Button><span aria-live="polite" className="text-xs text-slate-500">{t('{page} de {pages}', { page: currentPage, pages })}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>{t('Próxima')}</Button></div>}
  </Card>
}
