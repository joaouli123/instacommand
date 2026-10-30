'use client'

import { useCompanyProfiles } from '@/hooks/useCompanyProfiles'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Download, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CompareContext, CompareToggle, MetricCard, useComparePreference } from './MetricCard'
import { ReportChart } from './LazyCharts'
import { MediaPreview } from './MediaPreview'
import { downloadReport, reportFormat } from '@/lib/report-chart'
import { useXAccounts } from '@/components/accounts/XAccountsCard'
import { useLang, useT } from '@/lib/i18n'

type Totals = { posts: number; impressions: number | null; likes: number; replies: number; reposts: number; quotes: number; bookmarks: number; urlClicks: number | null; profileClicks: number | null; engagement: number }
type Post = { id: string; text: string; createdAt: string; url: string; image: string | null; engagement: number; metrics: { impressions: number | null; likes: number; replies: number; reposts: number; quotes: number; bookmarks: number } }
export type XReportData = {
  account: { id: string; username: string; name: string | null; profilePicUrl: string | null }
  period: { days: number; since: string; until: string }; collectedAt: string
  followers: number | null; following: number | null; totalPosts: number | null
  posts: Post[]; totals: Totals; engagementRate: number | null; daily: Array<{ date: string; impressions: number; engagement: number; posts: number }>
  complete: boolean; issues: string[]; syncedAt?: string | null; nextSyncAt?: string | null
  previous?: { totals: Totals; engagementRate: number | null } | null
}

export const X_METRICS: Array<{ key: keyof Totals; label: string }> = [
  { key: 'impressions', label: 'Visualizações' }, { key: 'engagement', label: 'Engajamentos' }, { key: 'likes', label: 'Curtidas' },
  { key: 'replies', label: 'Respostas' }, { key: 'reposts', label: 'Reposts' }, { key: 'quotes', label: 'Citações' },
  { key: 'bookmarks', label: 'Salvos' }, { key: 'urlClicks', label: 'Cliques em links' }, { key: 'profileClicks', label: 'Cliques no perfil' }, { key: 'posts', label: 'Posts publicados' },
]

export function useXReport(accountId: string, days: number) {
  return useQuery<XReportData>({
    queryKey: ['x-report', accountId, days], enabled: !!accountId, staleTime: 5 * 60_000, retry: false,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/x/${encodeURIComponent(accountId)}?days=${days}`, { signal }) as Promise<XReportData>,
  })
}

export function XReport() {
  const t = useT()
  const { locale } = useLang()
  const [selectedId, setSelectedId] = useState('')
  const [days, setDays] = useState(30)
  const [order, setOrder] = useState<'engagement' | 'impressions' | 'recent'>('engagement')
  // Only the X profiles of the company chosen at the top.
  const { company, companyId, x: accounts, xConfigured, isLoading: profilesLoading } = useCompanyProfiles()
  const accountId = accounts.some((a) => a.id === selectedId) ? selectedId : accounts[0]?.id || ''
  const reportQuery = useXReport(accountId, days)
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  // Forces a fresh read from X (the server allows it at most every 15 minutes).
  const refresh = async () => {
    if (!accountId || refreshing) return
    setRefreshing(true)
    try { queryClient.setQueryData(['x-report', accountId, days], await fetchApi(`/analytics/networks/x/${encodeURIComponent(accountId)}?days=${days}&refresh=1`)) }
    catch (error) { toast.error(error instanceof Error ? error.message : t('Não foi possível atualizar agora.')) }
    finally { setRefreshing(false) }
  }
  const report = reportQuery.data
  const [comparing, setComparing] = useComparePreference()
  const posts = useMemo(() => [...(report?.posts || [])].sort((a, b) => order === 'recent' ? b.createdAt.localeCompare(a.createdAt) : order === 'impressions' ? (b.metrics.impressions ?? -1) - (a.metrics.impressions ?? -1) : b.engagement - a.engagement).slice(0, 20), [report, order])

  const connect = async () => {
    const authWindow = window.open('about:blank', '_blank')
    if (!authWindow) { toast.error(t('Permita pop-ups para conectar sem sair desta página.')); return }
    authWindow.opener = null
    authWindow.document.body.textContent = t('Abrindo autorização segura do X…')
    try { authWindow.location.replace(((await fetchApi(`/auth/x/url?workspace=${encodeURIComponent(companyId)}`)) as { url: string }).url) }
    catch (error) { authWindow.close(); toast.error(error instanceof Error ? error.message : t('Não foi possível abrir a autorização do X')) }
  }
  const exportReport = () => {
    if (!report) return
    downloadReport([[t('Rede'), t('Perfil'), t('período::Início'), t('Fim'), t('Métrica'), t('Valor')], ...X_METRICS.map(({ key, label }) => ['X', report.account.username, report.period.since, report.period.until, t(label), report.totals[key] ?? ''])], `x-${report.account.username}-${days}dias.csv`)
  }

  if (profilesLoading) return <p role="status">{t('Carregando contas do X…')}</p>
  if (!accountId) return <Card className="p-8 text-center"><h2 className="text-xl font-bold">{t('Nenhum perfil do X nesta empresa')}</h2><p className="mx-auto my-3 max-w-md text-sm text-slate-600">{t('Os relatórios mostram só os perfis da empresa selecionada no topo{company}. Conecte o perfil desta empresa ou vincule um perfil já conectado em Contas.', { company: company ? ` (@${company.igUsername})` : '' })}</p><div className="flex flex-wrap justify-center gap-3"><Button onClick={() => void connect()} disabled={!xConfigured || !companyId}>{!xConfigured ? t('Conexão em configuração') : t('Conectar X')}</Button><a className="inline-flex h-10 items-center text-sm font-semibold text-indigo-600 underline" href="/accounts">{t('Vincular em Contas')}</a></div></Card>

  const previous = report?.previous
  return <section className="min-w-0 space-y-4 sm:space-y-5" aria-label={t('Relatório do X')}>
    <div className="report-header">
      <div><p className="report-eyebrow">X</p><h2 className="report-title">{t('Desempenho do perfil')}</h2><p className="report-description">{t('Visualizações, engajamento e posts publicados no período.')}</p></div>
      <div className="report-filters">
        <label>{t('Perfil')}<select value={accountId} onChange={(e) => setSelectedId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</select></label>
        <label>{t('Período')}<select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>{t('Últimos {days} dias', { days: d })}</option>)}</select></label>
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={refreshing || reportQuery.isFetching}><RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />{t('Atualizar')}</Button><Button variant="outline" onClick={exportReport} disabled={!report}><Download size={16} className="mr-2" />{t('Exportar métricas')}</Button></div>
    {reportQuery.isPending && <Card className="p-8" role="status">{t('Consultando o X…')}</Card>}
    {reportQuery.isError && <Card className="border-rose-200 p-5 text-rose-700" role="alert">{reportQuery.error.message}</Card>}
    {report && <>
      {report.issues.length > 0 && <Card className="border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertCircle className="shrink-0 text-amber-700" size={20} /><div><h3 className="font-semibold text-amber-950">{t('Alguns dados não vieram do X')}</h3>{report.issues.map((issue) => <p key={issue} className="mt-1 text-sm text-amber-900">{issue}</p>)}</div></div></Card>}
      <CompareToggle value={comparing} onChange={setComparing} />
      <CompareContext.Provider value={comparing}>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <MetricCard label={t('Seguidores')} value={report.followers} detail={t('Total atual')} accent compare={{ current: report.followers, previous: null }} />
          {X_METRICS.map(({ key, label }) => <MetricCard key={key} label={t(label)} value={report.totals[key]} detail={t(key === 'impressions' && report.totals.impressions == null ? 'O X não informou para estes posts' : key === 'posts' ? 'No período selecionado' : 'Soma dos posts do período')} compare={{ current: report.totals[key], previous: previous?.totals?.[key] ?? null }} />)}
          <MetricCard label={t('Taxa de engajamento')} value={report.engagementRate == null ? null : `${report.engagementRate.toLocaleString(locale, { maximumFractionDigits: 2 })}%`} detail={t('Engajamentos ÷ visualizações')} compare={{ current: report.engagementRate, previous: previous?.engagementRate, format: (v) => `${v.toLocaleString(locale, { maximumFractionDigits: 2 })}%` }} />
        </div>
      </CompareContext.Provider>
      <ReportChart key={`x-${accountId}-${days}`} title={t('Visualizações e engajamento por dia de publicação')} description={t('Soma dos posts publicados em cada dia, com os contadores atuais de cada post.')} rows={report.daily} series={[{ key: 'impressions', label: t('Visualizações'), color: '#0f172a' }, { key: 'engagement', label: t('Engajamentos'), color: '#6366f1' }]} defaultKeys={['impressions', 'engagement']} filename="x-desempenho" />
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="section-title">{t('Posts do período')}</h3><p className="section-subtitle">{t('{count} posts', { count: report.posts.length })}{report.complete ? '' : ` ${t('(amostra: mais de 300 no período)')}`}</p></div>
          <select aria-label={t('Ordenar posts do X')} value={order} onChange={(e) => setOrder(e.target.value as typeof order)} className="rounded-lg border border-slate-200 bg-white p-2 text-sm"><option value="engagement">{t('Mais engajamento')}</option><option value="impressions">{t('Mais visualizações')}</option><option value="recent">{t('Mais recentes')}</option></select></div>
        {!posts.length ? <p className="py-6 text-center text-sm text-slate-500">{t('Nenhum post no período.')}</p> : <div className="divide-y divide-slate-100">{posts.map((post) => <article key={post.id} className="flex gap-3 py-3">
          {post.image && <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100"><MediaPreview src={post.image} fallback="" /></div>}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm text-slate-800">{post.text || t('Post sem texto')}</p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{new Date(post.createdAt).toLocaleDateString(locale)}</span><span><b className="text-slate-800">{reportFormat(post.metrics.impressions)}</b> {t('visualizações')}</span><span><b className="text-slate-800">{post.metrics.likes}</b> {t('curtidas')}</span><span><b className="text-slate-800">{post.metrics.replies}</b> {t('respostas')}</span><span><b className="text-slate-800">{post.metrics.reposts}</b> {t('reposts')}</span><a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">{t('Abrir no X')}<ExternalLink size={12} /></a></p>
          </div>
        </article>)}</div>}
      </Card>
      <p className="text-xs text-slate-500">@{report.account.username} · {t('Dados do X de {date}', { date: report.syncedAt ? new Date(report.syncedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : t('ainda não sincronizado') })}{report.nextSyncAt ? ` · ${t('próxima atualização automática a partir de {date}', { date: new Date(report.nextSyncAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) })}` : ''}. {t('Os números ficam guardados para economizar créditos da API do X.')}</p>
    </>}
  </section>
}
