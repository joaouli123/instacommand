'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, fetchApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertCircle, Download, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

type Metric = { value: number | null; available: boolean; daily: Array<{ date: string; value: number }> }
type Report = {
  account: { id: string; username: string; name: string | null }
  collectedAt: string; period: { days: number; since: string; until: string }
  metrics: Record<string, Metric>; contentAvailable: boolean; truncated: boolean
  posts: Array<{ id: string; text: string; timestamp: string; permalink: string | null; mediaType: string | null }>
  issues: Array<{ section: string; reason: string; status?: number; code?: number; subcode?: number }>
}
const labels: Record<string, string> = { views: 'Visualizações', likes: 'Curtidas', replies: 'Respostas', reposts: 'Republicações', quotes: 'Citações', followers_count: 'Seguidores atuais' }
const number = (value: number) => value.toLocaleString('pt-BR')

export function ThreadsReport() {
  const [selectedId, setSelectedId] = useState('')
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)
  const [connecting, setConnecting] = useState(false)
  const accountsQuery = useQuery({ queryKey: ['threads-accounts'], queryFn: api.getThreadsAccounts })
  const accounts = (accountsQuery.data || []) as Array<{ id: string; username: string }>
  const accountId = accounts.some(a => a.id === selectedId) ? selectedId : accounts[0]?.id || ''
  const reportQuery = useQuery<Report>({
    queryKey: ['threads-report', accountId, days], enabled: !!accountId,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/threads/${encodeURIComponent(accountId)}?days=${days}`, { signal }),
    staleTime: 60_000, retry: false,
  })
  const report = reportQuery.data
  useEffect(() => { setPage(1) }, [accountId, days])
  const connect = async () => {
    setConnecting(true)
    try {
      const result = await fetchApi('/auth/threads/url') as { url: string }
      window.location.assign(result.url)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a autorização'); setConnecting(false) }
  }
  const exportReport = () => {
    if (!report) return
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [['Rede', 'Perfil', 'Início', 'Fim', 'Métrica', 'Valor', 'Disponível'],
      ...Object.entries(labels).map(([key, label]) => ['Threads', report.account.username, report.period.since, report.period.until, label,
        report.metrics[key]?.value ?? '', report.metrics[key]?.available ? 'Sim' : 'Não'])]
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `threads-${report.account.username}-${days}dias.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (accountsQuery.isPending) return <p role="status">Carregando contas do Threads...</p>
  if (accountsQuery.isError) return <Card className="p-6"><p role="alert">Não foi possível carregar suas contas do Threads.</p><Button onClick={() => accountsQuery.refetch()}>Tentar novamente</Button></Card>
  if (!accountId) return <Card className="p-8 text-center"><h2 className="text-xl font-bold">Conecte seu Threads</h2><p className="my-3 text-sm text-slate-600">Entre na sua conta e autorize a leitura de métricas. Não é necessário copiar tokens.</p><Button onClick={connect} disabled={connecting}>{connecting ? 'Abrindo...' : 'Conectar Threads'}</Button></Card>
  const reasons = new Set(report?.issues.map(issue => issue.reason))
  const requiresReconnect = reasons.has('permission') || reasons.has('expired')
  const pages = Math.max(1, Math.ceil((report?.posts.length || 0) / 20))
  return <section className="space-y-5" aria-label="Relatório do Threads">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-2xl font-bold text-slate-900">Desempenho no Threads</h2><p className="mt-1 text-sm text-slate-500">Dados exclusivos do Threads, separados do Instagram e Facebook.</p></div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-semibold text-slate-600">Perfil<select className="mt-1 block rounded-lg border bg-white p-2 text-sm" value={accountId} onChange={e => setSelectedId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Período<select className="mt-1 block rounded-lg border bg-white p-2 text-sm" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(d => <option key={d} value={d}>Últimos {d} dias</option>)}</select></label>
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => reportQuery.refetch()} disabled={reportQuery.isFetching}><RefreshCw size={16} className="mr-2"/>Atualizar</Button><Button variant="outline" onClick={exportReport} disabled={!report}><Download size={16} className="mr-2"/>Exportar métricas</Button></div>
    {reportQuery.isPending && <Card className="p-8" role="status">Consultando o Threads...</Card>}
    {reportQuery.isError && <Card className="border-rose-200 p-5 text-rose-700" role="alert">{reportQuery.error.message} Use Atualizar para tentar novamente.</Card>}
    {report && <>
      <p className="text-xs text-slate-500">@{report.account.username} · Consulta em {new Date(report.collectedAt).toLocaleString('pt-BR')} · Métricas do período selecionado; seguidores representam o total atual.</p>
      {report.issues.length > 0 && <Card className="border-amber-200 bg-amber-50 p-5"><div className="flex gap-3"><AlertCircle className="shrink-0 text-amber-700" size={20}/><div><h3 className="font-semibold">Alguns dados ainda não estão disponíveis</h3><p className="mt-1 text-sm text-slate-700">{reasons.has('expired') ? 'A autorização expirou. Reconecte sua conta.' : reasons.has('permission') ? 'A conexão não tem acesso às métricas solicitadas. Reconecte e autorize Insights. O aplicativo também precisa dessa permissão habilitada na Meta.' : reasons.has('rate_limit') ? 'O Threads limitou temporariamente as consultas. Aguarde antes de atualizar.' : 'O Threads não respondeu a parte das consultas. Atualize mais tarde; seus dados não foram substituídos por zeros.'}</p><p className="mt-2 text-xs text-slate-600">Diagnóstico da Meta: {report.issues.map(issue => `${issue.section} (HTTP ${issue.status ?? '—'}${issue.code !== undefined ? `, código ${issue.code}` : ''}${issue.subcode !== undefined ? `, subcódigo ${issue.subcode}` : ''})`).join(' · ')}</p>{requiresReconnect && <Button className="mt-3" onClick={connect} disabled={connecting}>Reconectar e autorizar métricas</Button>}</div></div></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(labels).map(([key, label]) => <Card key={key} className="p-5"><h3 className="text-sm text-slate-500">{label}</h3><p className="mt-2 text-2xl font-bold">{report.metrics[key]?.available && report.metrics[key].value !== null ? number(report.metrics[key].value) : 'Indisponível'}</p></Card>)}</div>
      <Card className="p-5"><h3 className="font-bold">Publicações do período</h3><p className="mt-1 text-sm text-slate-500">{report.contentAvailable ? `${report.posts.length} publicações recuperadas${report.truncated ? ' — resultado parcial (limite de consulta atingido)' : ''}.` : 'A lista de publicações não pôde ser consultada.'}</p>
        <div className="mt-4 divide-y">{report.posts.slice((page - 1) * 20, page * 20).map(post => <article className="py-4" key={post.id}><p className="text-xs text-slate-500">{new Date(post.timestamp).toLocaleString('pt-BR')} · {post.mediaType}</p><p className="my-2 whitespace-pre-wrap break-words text-sm">{post.text || 'Publicação sem texto'}</p>{post.permalink && /^https:\/\/(www\.)?threads\.(net|com)\//.test(post.permalink) && <a className="text-sm font-semibold text-indigo-600 underline" href={post.permalink} target="_blank" rel="noreferrer">Abrir no Threads</a>}</article>)}</div>
        {report.contentAvailable && !report.posts.length && <p className="py-6 text-sm text-slate-500">Nenhuma publicação retornada nesse período.</p>}
        {pages > 1 && <div className="mt-4 flex items-center justify-between gap-2"><Button variant="outline" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>Anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= pages}>Próxima</Button></div>}
      </Card>
    </>}
  </section>
}
