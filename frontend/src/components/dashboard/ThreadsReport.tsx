'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, fetchApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertCircle, Download, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { MetricCard } from './MetricCard'
import { ReportChart } from './ReportChart'
import { ReportPublications } from './ReportPublications'
import { ChartRow, downloadReport, reportDay } from '@/lib/report-chart'

type Metric = { value: number | null; available: boolean; daily: Array<{ date: string; value: number }> }
type Report = {
  account: { id: string; username: string; name: string | null }
  collectedAt: string; period: { days: number; since: string; until: string }
  metrics: Record<string, Metric>; contentAvailable: boolean; truncated: boolean
  posts: Array<{ id: string; text: string; timestamp: string; permalink: string | null; mediaType: string | null }>
  issues: Array<{ section: string; reason: string; status?: number; code?: number; subcode?: number; message?: string }>
}
const labels: Record<string, string> = { views: 'Visualizações', likes: 'Curtidas', replies: 'Respostas', reposts: 'Republicações', quotes: 'Citações', followers_count: 'Seguidores atuais' }
const number = (value: number) => value.toLocaleString('pt-BR')

export function ThreadsReport() {
  const [selectedId, setSelectedId] = useState('')
  const [days, setDays] = useState(30)
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
  const daily = useMemo(() => {
    const rows = new Map<string, ChartRow>()
    for (const key of Object.keys(labels).filter(k => k !== 'followers_count')) {
      for (const point of report?.metrics[key]?.daily || []) {
        // end_time marks the end of the provider's daily bucket.
        const end = Date.parse(point.date)
        if (!Number.isFinite(end)) continue
        const date = new Date(end - 86400000).toISOString().slice(0, 10)
        const row = rows.get(date) || { date }
        row[key] = point.value; rows.set(date, row)
      }
    }
    return Array.from(rows.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [report])
  const publicationDays = useMemo(() => {
    const rows = new Map<string, ChartRow>()
    for (const post of report?.posts || []) { const date = reportDay(post.timestamp); const row = rows.get(date) || { date, posts: 0 }; row.posts = Number(row.posts) + 1; rows.set(date, row) }
    return Array.from(rows.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [report])
  const connect = async () => {
    const authWindow = window.open('about:blank', '_blank')
    if (!authWindow) { toast.error('Permita pop-ups para conectar sem sair desta página.'); return }
    authWindow.opener = null
    authWindow.document.body.textContent = 'Abrindo autorização segura…'
    setConnecting(true)
    try {
      const result = await fetchApi('/auth/threads/url') as { url: string }
      authWindow.location.replace(result.url)
    } catch (error) { authWindow.close(); toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a autorização') }
    finally { setConnecting(false) }
  }
  const exportReport = () => {
    if (!report) return
    const rows = [['Rede', 'Perfil', 'Início', 'Fim', 'Métrica', 'Valor', 'Disponível'],
      ...Object.entries(labels).map(([key, label]) => ['Threads', report.account.username, report.period.since, report.period.until, label,
        report.metrics[key]?.value ?? '', report.metrics[key]?.available ? 'Sim' : 'Não'])]
    downloadReport(rows, `threads-${report.account.username}-${days}dias.csv`)
  }
  if (accountsQuery.isPending) return <p role="status">Carregando contas do Threads...</p>
  if (accountsQuery.isError) return <Card className="p-6"><p role="alert">Não foi possível carregar suas contas do Threads.</p><Button onClick={() => accountsQuery.refetch()}>Tentar novamente</Button></Card>
  if (!accountId) return <Card className="p-8 text-center"><h2 className="text-xl font-bold">Conecte seu Threads</h2><p className="my-3 text-sm text-slate-600">Entre na sua conta e autorize a leitura de métricas. Não é necessário copiar tokens.</p><Button onClick={connect} disabled={connecting}>{connecting ? 'Abrindo...' : 'Conectar Threads'}</Button></Card>
  const reasons = new Set(report?.issues.map(issue => issue.reason))
  const requiresReconnect = reasons.has('permission') || reasons.has('expired')
  const metaInternalError = report?.issues.some(issue => issue.status === 500 && issue.code === 1)
  return <section className="min-w-0 space-y-4 sm:space-y-5" aria-label="Relatório do Threads">
    <div className="report-header">
      <div><p className="report-eyebrow">Threads</p><h2 className="report-title">Desempenho do perfil</h2><p className="report-description">Explore visualizações, conversas e publicações.</p></div>
      <div className="report-filters">
        <label className="text-xs font-semibold text-slate-600">Perfil<select className="mt-1 block rounded-lg border bg-white p-2 text-sm" value={accountId} onChange={e => setSelectedId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Período<select className="mt-1 block rounded-lg border bg-white p-2 text-sm" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(d => <option key={d} value={d}>Últimos {d} dias</option>)}</select></label>
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => reportQuery.refetch()} disabled={reportQuery.isFetching}><RefreshCw size={16} className="mr-2"/>Atualizar</Button><Button variant="outline" onClick={exportReport} disabled={!report}><Download size={16} className="mr-2"/>Exportar métricas</Button></div>
    {reportQuery.isPending && <Card className="p-8" role="status">Consultando o Threads...</Card>}
    {reportQuery.isError && <Card className="border-rose-200 p-5 text-rose-700" role="alert">{reportQuery.error.message} Use Atualizar para tentar novamente.</Card>}
    {report && <>
      <p className="text-xs text-slate-500">@{report.account.username} · Consulta em {new Date(report.collectedAt).toLocaleString('pt-BR')} · Métricas do período selecionado; seguidores representam o total atual.</p>
      {report.issues.length > 0 && <Card className="border-amber-200 bg-amber-50 p-5"><div className="flex gap-3"><AlertCircle className="shrink-0 text-amber-700" size={20}/><div><h3 className="font-semibold">Alguns dados ainda não estão disponíveis</h3><p className="mt-1 text-sm text-slate-700">{reasons.has('expired') ? 'A autorização expirou. Reconecte sua conta.' : reasons.has('permission') ? 'A conexão não tem acesso às métricas solicitadas. Reconecte e autorize Insights. O aplicativo também precisa dessa permissão habilitada na Meta.' : reasons.has('rate_limit') ? 'O Threads limitou temporariamente as consultas. Aguarde antes de atualizar.' : metaInternalError ? 'Sua conta está conectada e as publicações foram carregadas, mas a Meta retornou um erro interno ao consultar os insights. Isso não significa que o perfil foi desconectado. Evite reconectar repetidamente; verifique a permissão de insights e tente novamente mais tarde.' : 'O Threads não respondeu a parte das consultas. Seus dados não foram substituídos por zeros.'}</p><details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Detalhes técnicos da consulta</summary><p className="mt-2">{report.issues.map(issue => `${issue.section} (HTTP ${issue.status ?? '—'}${issue.code !== undefined ? `, código ${issue.code}` : ''}${issue.subcode !== undefined ? `, subcódigo ${issue.subcode}` : ''})`).join(' · ')}</p>{report.issues.filter(issue => issue.message).map(issue => <p key={issue.section} className="mt-1 break-words">{issue.section}: {issue.message}</p>)}</details>{requiresReconnect && <Button className="mt-3" onClick={connect} disabled={connecting}>Reconectar e autorizar métricas</Button>}</div></div></Card>}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">{Object.entries(labels).map(([key, label]) => <MetricCard key={key} label={label} value={report.metrics[key]?.available ? report.metrics[key].value : null} detail={key === 'followers_count' ? 'Total atual do perfil' : 'No período selecionado'} accent={key === 'views'}/>)}</div>
      <ReportChart key={`metrics-${accountId}-${days}`} title="Evolução do desempenho" description="Contadores diários retornados pelo Threads. Se a rede fornecer apenas um total, ele não será distribuído artificialmente entre os dias." rows={daily} series={Object.entries(labels).filter(([key]) => key !== 'followers_count').map(([key, label], index) => ({ key, label, color: ['#4f46e5', '#e11d48', '#0284c7', '#0d9488', '#a855f7'][index] }))} defaultKeys={['views']} filename="threads-desempenho"/>
      <ReportChart key={`posts-${accountId}-${days}`} title="Atividade de publicação" description="Quantidade de publicações recuperadas em cada data. Não representa o total de interações dos posts." rows={publicationDays} series={[{ key: 'posts', label: 'Publicações', color: '#4f46e5' }]} kind="bar" filename="threads-publicacoes"/>
      <ReportPublications key={`${accountId}-${days}`} network="Threads" available={report.contentAvailable} complete={!report.truncated} posts={report.posts.map(p => ({ id: p.id, text: p.text, date: p.timestamp, url: p.permalink, type: p.mediaType }))}/>
    </>}
  </section>
}
