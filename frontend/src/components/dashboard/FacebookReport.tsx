'use client'

import { useActiveAccount } from '@/hooks/useActiveAccount'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { api, fetchApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { facebookHistoryRows, getObservedInteractions, rankFacebookPosts, type FacebookAudienceHistory } from '@/lib/facebook-report'
import { ChartRow, downloadReport, reportDay, reportFormat } from '@/lib/report-chart'
import { CompareContext, CompareToggle, MetricCard, useComparePreference } from './MetricCard'
import { ReportChart } from './LazyCharts'
import { ReportPublications } from './ReportPublications'
import { ReportAccessNotice } from './ReportAccessNotice'
import { useLang, useT } from '@/lib/i18n'

type Post = { id: string; text: string; createdAt: string; permalink: string | null; image?: string | null; reactions: number | null; comments: number | null; shares: number | null }
type Total = { value: number; availablePosts: number; complete: boolean }
type Report = { page: { id: string; name: string | null }; account: { instagram: string }; collectedAt: string;
  followers: number | null; pageLikes: number | null; posts: Post[]; contentAvailable: boolean; complete: boolean;
  totals: Record<string, Total>; insights: { mediaViews: number | null; mediaViewsAvailable: boolean; daily?: Array<{ date: string; value: number }>; mediaViewsPartial?: boolean; history?: FacebookAudienceHistory; period?: { days: number; limited: boolean; since: string; until: string } };
  issues: string[]; measurement: string; period: { since: string; until: string } }
const periods = [{ days: 7, label: 'Últimos 7 dias' }, { days: 30, label: 'Últimos 30 dias' }, { days: 90, label: 'Últimos 90 dias' }, { days: 365, label: 'Último ano' }, { days: 730, label: 'Últimos 2 anos' }]
const interactionSeries = [{ key: 'reactions', label: 'Reações', color: '#4f46e5' }, { key: 'comments', label: 'Comentários', color: '#0284c7' }, { key: 'shares', label: 'Compartilhamentos', color: '#0d9488' }]

export function FacebookReport() {
  const t = useT()
  const { locale } = useLang()
  const [comparing, setComparing] = useComparePreference()
  const [days, setDays] = useState(30)
  // Always the Page of the company chosen at the top, never another company's.
  const companyQuery = useActiveAccount()
  const company = companyQuery.activeAccount
  const accountId = company?.pageId ? company.id : ''
  const query = useQuery<Report>({ queryKey: ['facebook-report', accountId, days], enabled: !!accountId,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/facebook/${encodeURIComponent(accountId)}?days=${days}`, { signal }), staleTime: 60_000, retry: false })
  const report = query.data
  const audienceHistory = useMemo(() => facebookHistoryRows(report?.insights.history), [report])
  const insightWindow = t('Últimos {days} dias', { days: report?.insights.period?.days ?? Math.min(days, 90) })
  const daily = useMemo(() => {
    const map = new Map<string, ChartRow>()
    for (const post of report?.posts || []) {
      const date = reportDay(post.createdAt)
      const row = map.get(date) || { date, posts: 0, reactions: null, comments: null, shares: null }
      row.posts = Number(row.posts) + 1
      for (const key of ['reactions', 'comments', 'shares'] as const) if (post[key] != null) row[key] = Number(row[key] ?? 0) + post[key]!
      map.set(date, row)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [report])
  const exportCsv = () => {
    if (!report) return
    downloadReport([[t('Página'), t('Publicação'), t('Data'), t('Texto'), t('Reações acumuladas'), t('Comentários acumulados'), t('Compartilhamentos acumulados')],
      ...report.posts.map(p => [report.page.name, p.id, p.createdAt, p.text, p.reactions, p.comments, p.shares])], `facebook-${days}dias.csv`)
  }
  if (companyQuery.isLoading) return <p role="status">{t('Carregando Página do Facebook…')}</p>
  if (companyQuery.error) return <Card className="p-6"><p role="alert">{t('Não foi possível carregar as contas.')}</p><Button onClick={() => companyQuery.refetch()}>{t('Tentar novamente')}</Button></Card>
  if (!accountId) return <Card className="p-6"><h2 className="text-xl font-bold">{company ? t('@{user} não tem Página do Facebook vinculada', { user: company.igUsername }) : t('Conecte uma conta')}</h2><p className="my-3 text-sm text-slate-600">{t('O relatório do Facebook mostra só a Página da empresa selecionada no topo.')}</p><a className="font-semibold text-indigo-600 underline" href="/accounts">{t('Gerenciar conexões')}</a></Card>
  const ranked = report ? rankFacebookPosts(report.posts).slice(0, 3) : []
  const previous = (report as { previous?: { mediaViews: number | null; posts: number | null; totals: Record<string, { value: number | null; complete: boolean; availablePosts: number }> } | null } | undefined)?.previous
  return <section className="min-w-0 space-y-4 sm:space-y-5" aria-label={t('Relatório do Facebook')}>
    <div className="report-header"><div><p className="report-eyebrow">Facebook</p><h2 className="report-title">{t('Desempenho da Página')}</h2><p className="report-description">{t('Acompanhe sua audiência e os conteúdos publicados.')}</p></div>
      <div className="report-filters"><label>{t('Página')}<select value={accountId} disabled aria-readonly="true"><option value={accountId}>{company?.pageName || t('Página vinculada')} · @{company?.igUsername}</option></select></label><label>{t('Período')}<select value={days} onChange={e => setDays(Number(e.target.value))}>{periods.map(p => <option key={p.days} value={p.days}>{t(p.label)}</option>)}</select></label></div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw size={15} className={`mr-2 ${query.isFetching ? 'animate-spin' : ''}`}/>{t('Atualizar')}</Button><Button variant="outline" disabled={!report?.posts.length} onClick={exportCsv}><Download size={15} className="mr-2"/>{t('Exportar publicações')}</Button></div>
    <ReportAccessNotice accountId={accountId} network="Facebook"/>
    {query.isPending && <Card className="p-8" role="status">{t('Consultando a Página…')}</Card>}
    {query.isError && <Card className="border-rose-200 p-4 text-sm text-rose-700" role="alert">{query.error.message} {t('Use Atualizar para tentar novamente.')}</Card>}
    {report && <>
      <p className="text-xs leading-relaxed text-slate-500">{report.page.name} · {t('Atualizado em {date}', { date: new Date(report.collectedAt).toLocaleString(locale, { timeZone: 'America/Sao_Paulo' }) })}</p>
      {report.insights.period?.limited && <p className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs leading-relaxed text-slate-600">{t('Visualizações e séries de audiência: últimos {days} dias, limite desta consulta do Facebook. A lista de publicações mantém o período selecionado de {selected} dias.', { days: report.insights.period.days, selected: days })}</p>}
      {report.issues.length > 0 && <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">{t('Disponibilidade dos dados · {count} aviso(s)', { count: report.issues.length })}</summary><div className="mt-2 space-y-2">{report.issues.map(issue => <p key={issue}>{issue}</p>)}</div></details>}
      <CompareToggle value={comparing} onChange={setComparing} />
      <CompareContext.Provider value={comparing}>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4"><MetricCard label={t('Seguidores')} value={report.followers} detail={t('Total atual')} accent compare={{ current: report.followers, previous: previous ? audienceHistory.find(row => row.followers != null)?.followers ?? null : null }}/><MetricCard label={t('Curtidas da Página')} value={report.pageLikes} detail={t('Total atual')} compare={{ current: report.pageLikes, previous: null }}/><MetricCard label={t('Publicações')} value={report.contentAvailable ? report.posts.length : null} detail={report.complete ? t('No período selecionado') : t('Consulta parcial ou indisponível')} compare={{ current: report.contentAvailable ? report.posts.length : null, previous: previous?.posts }}/><MetricCard label={t('Visualizações')} value={report.insights.mediaViews} detail={report.insights.mediaViewsAvailable ? `${insightWindow} · ${report.insights.mediaViewsPartial ? t('soma diária parcial') : t('soma diária')}` : t('Não fornecidas pela rede')} compare={{ current: report.insights.mediaViews, previous: previous?.mediaViews }}/></div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">{interactionSeries.map(({ key, label }) => { const total = report.totals[key]; return <MetricCard key={key} label={t(label)} value={total.complete || total.availablePosts ? total.value : null} detail={total.complete ? t('Contadores dos posts do período') : t('{available} de {total} posts com dados', { available: total.availablePosts, total: report.posts.length })} compare={{ current: total.complete ? total.value : null, previous: previous?.totals?.[key]?.complete ? previous.totals[key].value : null }}/> })}</div>
      </CompareContext.Provider>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <ReportChart key={`views-${accountId}-${days}`} title={t('Visualizações ao longo do tempo')} description={`${insightWindow} · ${t('visualizações diárias da Página fornecidas pelo Facebook.')}`} rows={(report.insights.daily || []).map(p => ({ date: p.date, views: p.value }))} series={[{ key: 'views', label: t('Visualizações'), color: '#2563eb' }]} filename="facebook-visualizacoes"/>
        <ReportChart key={`posts-${accountId}-${days}`} title={t('Atividade de publicação')} description={t('Quantidade de posts recuperados por data de publicação. Uma consulta parcial pode omitir posts.')} rows={daily} series={[{ key: 'posts', label: t('Publicações'), color: '#4f46e5' }]} kind="bar" filename="facebook-publicacoes"/>
      </div>
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <ReportChart key={`viewers-${accountId}-${days}`} title={t('Pessoas que visualizaram o conteúdo')} description={`${insightWindow} · ${t('contas únicas em cada dia. Semanal e mensal exibem o último dia disponível, não a soma de pessoas.')}`} rows={audienceHistory} series={[{ key: 'viewers', label: t('Pessoas por dia'), color: '#0284c7', aggregation: 'last' }]} filename="facebook-audiencia"/>
        <ReportChart key={`followers-${accountId}-${days}`} title={t('Evolução de seguidores')} description={`${insightWindow} · ${t('total de seguidores ao fim de cada dia. Lacunas não são preenchidas.')}`} rows={audienceHistory} series={[{ key: 'followers', label: t('Seguidores'), color: '#4f46e5', aggregation: 'last' }]} filename="facebook-seguidores"/>
      </div>
      <ReportChart key={`follows-${accountId}-${days}`} title={t('Novos seguidores e saídas por dia')} description={`${insightWindow} · ${t('contagens únicas diárias estimadas pelo Facebook. Semanal e mensal mostram o último dia disponível, não o total da semana ou mês.')}`} rows={audienceHistory} series={[{ key: 'gained', label: t('Novos seguidores'), color: '#0284c7', aggregation: 'last' }, { key: 'lost', label: t('Deixaram de seguir'), color: '#e11d48', aggregation: 'last' }]} kind="bar" filename="facebook-entradas-saidas"/>
      <ReportChart key={`interactions-${accountId}-${days}`} title={t('Interações por data de publicação')} description={report.measurement} rows={daily} series={interactionSeries} kind="bar" filename="facebook-interacoes"/>
      {!!ranked.length && <Card className="p-4 sm:p-5"><h3 className="font-bold">{t('Destaques por interações')}</h3><p className="mt-1 text-xs text-slate-500">{t('Soma dos contadores disponíveis, acumulados até a consulta.')}</p><ol className="mt-3 grid gap-3 lg:grid-cols-3">{ranked.map(({ post, interactions }, index) => <li key={post.id} className="min-w-0 rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between text-sm"><strong className="text-indigo-700">#{index + 1}</strong><strong>{reportFormat(interactions.value)}</strong></div><p className="mt-2 line-clamp-3 break-words text-sm text-slate-700">{post.text || t('Sem texto')}</p><p className="mt-2 text-[11px] text-slate-500">{interactions.complete ? t('Todos os contadores disponíveis') : t('Soma parcial')}</p></li>)}</ol></Card>}
      <ReportPublications key={`${accountId}-${days}`} network="Facebook" available={report.contentAvailable} complete={report.complete} posts={report.posts.map(p => ({ id: p.id, text: p.text, image: p.image ?? null, date: p.createdAt, url: p.permalink, score: getObservedInteractions(p).value, metrics: interactionSeries.map(s => ({ label: s.label, value: p[s.key as 'reactions' | 'comments' | 'shares'] })) }))}/>
    </>}
  </section>
}
