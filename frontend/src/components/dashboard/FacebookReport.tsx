'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, fetchApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { rankFacebookPosts } from '@/lib/facebook-report'

type Post = { id: string; text: string; createdAt: string; permalink: string | null; reactions: number | null; comments: number | null; shares: number | null }
type Total = { value: number; availablePosts: number; complete: boolean }
type Report = { page: { id: string; name: string | null }; account: { instagram: string }; collectedAt: string;
  followers: number | null; pageLikes: number | null; posts: Post[]; contentAvailable: boolean; complete: boolean;
  totals: Record<string, Total>; insights: { mediaViews: number | null; mediaViewsAvailable: boolean };
  issues: string[]; measurement: string; period: { since: string; until: string } }
const number = (value: number | null | undefined) => value == null ? 'Indisponível' : value.toLocaleString('pt-BR')
const periods = [{ days: 7, label: 'Últimos 7 dias' }, { days: 30, label: 'Últimos 30 dias' }, { days: 90, label: 'Últimos 90 dias' }, { days: 365, label: 'Último ano' }, { days: 730, label: 'Últimos 2 anos' }]

export function FacebookReport() {
  const [selected, setSelected] = useState('')
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)
  const accountsQuery = useQuery({ queryKey: ['facebook-linked-accounts'], queryFn: api.getAccounts })
  const accounts = ((accountsQuery.data || []) as Array<{ id: string; igUsername: string; pageId: string; pageName: string | null }>).filter(a => a.pageId)
  const accountId = accounts.some(a => a.id === selected) ? selected : accounts[0]?.id || ''
  const query = useQuery<Report>({ queryKey: ['facebook-report', accountId, days], enabled: !!accountId,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/facebook/${encodeURIComponent(accountId)}?days=${days}`, { signal }), staleTime: 60_000, retry: false })
  const report = query.data
  useEffect(() => setPage(1), [accountId, days])
  const rankedPosts = report ? rankFacebookPosts(report.posts) : []
  const exportCsv = () => {
    if (!report) return
    const cell = (value: unknown) => { let text = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"` }
    const rows = [['Página', 'Publicação', 'Data', 'Texto', 'Reações acumuladas', 'Comentários acumulados', 'Compartilhamentos acumulados'],
      ...report.posts.map(p => [report.page.name, p.id, p.createdAt, p.text, p.reactions, p.comments, p.shares])]
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `facebook-${report.page.id}-${days}dias.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (accountsQuery.isPending) return <p role="status">Carregando Páginas do Facebook...</p>
  if (accountsQuery.isError) return <Card className="p-6"><p role="alert">Não foi possível carregar as contas.</p><Button onClick={() => accountsQuery.refetch()}>Tentar novamente</Button></Card>
  if (!accountId) return <Card className="p-8"><h2 className="text-xl font-bold">Conecte uma Página do Facebook</h2><p className="my-3 text-slate-600">Autorize a Página vinculada ao seu Instagram profissional. As métricas das duas redes ficam separadas.</p><a className="font-semibold text-indigo-600 underline" href="/accounts">Gerenciar conexões</a></Card>
  const totalPages = Math.max(1, Math.ceil((report?.posts.length || 0) / 20))
  return <section className="space-y-5" aria-label="Relatório do Facebook">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-bold">Desempenho no Facebook</h2><p className="mt-1 text-sm text-slate-500">Seguidores e publicações da Página, sem misturar dados do Instagram.</p></div>
      <div className="flex flex-wrap gap-3"><label className="text-xs font-semibold text-slate-600">Página<select value={accountId} onChange={e => setSelected(e.target.value)} className="mt-1 block max-w-full rounded-lg border bg-white p-2 text-sm">{accounts.map(a => <option key={a.id} value={a.id}>{a.pageName || 'Página vinculada'} · @{a.igUsername}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Período<select value={days} onChange={e => setDays(Number(e.target.value))} className="mt-1 block rounded-lg border bg-white p-2 text-sm">{periods.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}</select></label></div></div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>Atualizar</Button><Button variant="outline" disabled={!report?.posts.length} onClick={exportCsv}>Exportar publicações</Button><a className="self-center px-2 text-sm font-semibold text-indigo-600 underline" href="/accounts">Gerenciar conexões</a></div>
    {query.isPending && <Card className="p-8" role="status">Consultando a Página na Meta...</Card>}
    {query.isError && <Card className="border-rose-200 p-5 text-rose-700" role="alert">{query.error.message} Confira a conexão da Página ou tente atualizar.</Card>}
    {report && <><p className="text-xs text-slate-500">{report.page.name} · Vinculada a @{report.account.instagram} · Consulta em {new Date(report.collectedAt).toLocaleString('pt-BR')}</p>
      {report.issues.length > 0 && <Card className="border-amber-200 bg-amber-50 p-5" role="status">{report.issues.map(issue => <p key={issue} className="text-sm">{issue}</p>)}</Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Seguidores atuais', report.followers], ['Curtidas atuais da Página', report.pageLikes]].map(([label, value]) => <Card className="p-5" key={String(label)}><h3 className="text-sm text-slate-500">{label}</h3><p className="mt-2 text-2xl font-bold">{number(value as number | null)}</p></Card>)}
        <Card className="p-5"><h3 className="text-sm text-slate-500">Publicações recuperadas</h3><p className="mt-2 text-2xl font-bold">{report.contentAvailable ? number(report.posts.length) : 'Indisponível'}</p><p className="mt-1 text-xs text-slate-500">{report.complete ? 'Consulta do período concluída' : 'Consulta parcial ou indisponível'}</p></Card>
        <Card className="p-5"><h3 className="text-sm text-slate-500">Visualizações da Página</h3><p className="mt-2 text-2xl font-bold">{number(report.insights.mediaViews)}</p><p className="mt-1 text-xs text-slate-500">{report.insights.mediaViewsAvailable ? `Soma diária no período selecionado (${periods.find(p => p.days === days)?.label || days + ' dias'}).` : 'Não disponível para este token, Página ou período; não estimamos o valor.'}</p></Card></div>
      <Card className="p-5"><h3 className="font-bold">Interações nas publicações selecionadas</h3><p className="mt-2 text-sm text-slate-600">{report.measurement}</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{[['reactions', 'Reações'], ['comments', 'Comentários'], ['shares', 'Compartilhamentos']].map(([key, label]) => { const total = report.totals[key]; return <div key={key} className="rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-bold">{total.complete || total.availablePosts ? number(total.value) : 'Indisponível'}</p><p className="text-xs text-slate-500">{total.complete ? 'Cobertura completa dos posts recuperados' : `${total.availablePosts} de ${report.posts.length} posts com dados; soma parcial`}</p></div> })}</div></Card>
      <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Publicações com mais interações observadas</h3><p className="mt-1 text-sm text-slate-600">Ranking pela soma de reações, comentários e compartilhamentos retornados pela Meta. Não é taxa de engajamento nem alcance.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">{rankedPosts.length} com dados</span></div>
        {!rankedPosts.length ? <p className="py-6 text-sm text-slate-500">Ainda não há contadores disponíveis para comparar as publicações deste período.</p> : <ol className="mt-4 grid gap-3 lg:grid-cols-3">{rankedPosts.slice(0, 3).map(({ post, interactions }, index) => <li key={post.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wide text-indigo-700">Destaque {index + 1}</span><span className="text-lg font-bold text-slate-900">{number(interactions.value)}</span></div><p className="mt-1 text-[11px] text-slate-500">{interactions.complete ? '3 de 3 contadores disponíveis' : `${interactions.availableMetrics} de 3 contadores; soma parcial`}</p><p className="mt-3 line-clamp-3 break-words text-sm text-slate-700">{post.text || 'Publicação sem texto'}</p><p className="mt-3 text-xs text-slate-500">{new Date(post.createdAt).toLocaleDateString('pt-BR')}</p>{post.permalink && /^https:\/\/(www\.)?facebook\.com\//.test(post.permalink) && <a className="mt-3 inline-block text-sm font-semibold text-indigo-600 underline" href={post.permalink} target="_blank" rel="noreferrer">Abrir publicação</a>}</li>)}</ol>}
        {report.posts.some(post => post.reactions === null || post.comments === null || post.shares === null) && <p className="mt-3 text-xs text-amber-800">A Meta omitiu alguns contadores. Eles permanecem como indisponíveis e não entram como zero neste ranking.</p>}
      </Card>
      <Card className="p-5"><h3 className="font-bold">Publicações do período</h3>{!report.complete && report.contentAvailable && <p className="mt-2 text-sm text-amber-800">Resultado parcial: limite de consulta ou interrupção da Meta. Escolha um período menor.</p>}
        {report.contentAvailable && !report.posts.length && <p className="py-8 text-sm text-slate-500">Nenhuma publicação retornada nesse período. Experimente “Último ano” ou “Últimos 2 anos” para ver o histórico.</p>}
        {!report.contentAvailable && <p className="py-8 text-sm text-slate-500">Não foi possível consultar as publicações.</p>}
        <div className="divide-y">{report.posts.slice((page - 1) * 20, page * 20).map(post => <article className="py-5" key={post.id}><p className="text-xs text-slate-500">{new Date(post.createdAt).toLocaleString('pt-BR')}</p><p className="my-3 whitespace-pre-wrap break-words text-sm">{post.text || 'Publicação sem texto'}</p><div className="flex flex-wrap gap-4 text-xs text-slate-600"><span>Reações: {number(post.reactions)}</span><span>Comentários: {number(post.comments)}</span><span>Compartilhamentos: {number(post.shares)}</span></div>{post.permalink && /^https:\/\/(www\.)?facebook\.com\//.test(post.permalink) && <a className="mt-3 inline-block text-sm font-semibold text-indigo-600 underline" href={post.permalink} target="_blank" rel="noreferrer">Abrir no Facebook</a>}</article>)}</div>
        {totalPages > 1 && <div className="mt-4 flex items-center justify-between"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page} de {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}</Card>
    </>}
  </section>
}
