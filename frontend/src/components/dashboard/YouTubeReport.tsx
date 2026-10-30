'use client'

// YouTube channel report of the company chosen at the top: channel totals, the period's
// videos and, with the YouTube Analytics permission, daily views, watch time,
// subscribers, traffic sources and audience.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Download, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CompareContext, CompareToggle, MetricCard, useComparePreference } from './MetricCard'
import { ReportChart } from './LazyCharts'
import { MediaPreview } from './MediaPreview'
import { downloadReport, reportFormat } from '@/lib/report-chart'
import { useCompanyProfiles } from '@/hooks/useCompanyProfiles'
import { currentLocale, useLang, useT } from '@/lib/i18n'

type Totals = { views: number; watchMinutes: number; averageViewSeconds: number; subscribersGained: number; subscribersLost: number; likes: number; comments: number; shares: number }
type Video = { id: string; title: string; publishedAt: string; url: string; thumbnail: string | null; views: number | null; likes: number | null; comments: number | null; durationSeconds: number | null }
export type YouTubeReportData = {
  account: { id: string; channelId: string; title: string; handle: string | null; thumbnailUrl: string | null }
  period: { days: number; since: string; until: string }; collectedAt: string
  channel: { subscribers: number | null; views: number | null; videos: number | null }
  posts: Video[]; totals: { videos: number; views: number | null; likes: number | null; comments: number | null }
  analytics: { available: true; totals: Totals; daily: Array<{ date: string; views: number; watchMinutes: number; subscribersGained: number; subscribersLost: number }>; trafficSources: Array<{ source: string; views: number }>; demographics: Array<{ age: string; gender: string; percent: number }> }
    | { available: false; reason: 'scope' | 'error'; message: string }
  previous: Totals | null; complete: boolean; issues: string[]; measurement: string
}

const PERIODS = [7, 30, 90, 365]
const hours = (minutes: number) => `${(minutes / 60).toLocaleString(currentLocale(), { maximumFractionDigits: minutes < 600 ? 1 : 0 })} h`
const duration = (seconds: number | null) => seconds == null ? '' : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

export function useYouTubeReport(accountId: string, days: number) {
  return useQuery<YouTubeReportData>({
    queryKey: ['youtube-report', accountId, days], enabled: !!accountId, staleTime: 5 * 60_000, retry: false,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/youtube/${encodeURIComponent(accountId)}?days=${days}`, { signal }) as Promise<YouTubeReportData>,
  })
}

export function YouTubeReport() {
  const t = useT()
  const { locale } = useLang()
  const { company, companyId, youtube: channels, youtubeConfigured, isLoading } = useCompanyProfiles()
  const [selectedId, setSelectedId] = useState('')
  const [days, setDays] = useState(30)
  const [order, setOrder] = useState<'views' | 'recent' | 'likes'>('views')
  const accountId = channels.some((channel) => channel.id === selectedId) ? selectedId : channels[0]?.id || ''
  const reportQuery = useYouTubeReport(accountId, days)
  const report = reportQuery.data
  const [comparing, setComparing] = useComparePreference()
  const [refreshing, setRefreshing] = useState(false)
  const videos = useMemo(() => [...(report?.posts || [])].sort((a, b) => order === 'recent' ? b.publishedAt.localeCompare(a.publishedAt) : order === 'likes' ? (b.likes ?? -1) - (a.likes ?? -1) : (b.views ?? -1) - (a.views ?? -1)).slice(0, 30), [report, order])

  const connect = async () => {
    const authWindow = window.open('about:blank', '_blank')
    if (!authWindow) { toast.error(t('Permita pop-ups para conectar sem sair desta página.')); return }
    authWindow.opener = null
    authWindow.document.body.textContent = t('Abrindo autorização segura do Google…')
    try { authWindow.location.replace(((await fetchApi(`/auth/youtube/url?workspace=${encodeURIComponent(companyId)}`)) as { url: string }).url) }
    catch (error) { authWindow.close(); toast.error(error instanceof Error ? error.message : t('Não foi possível abrir a autorização do Google')) }
  }
  const refresh = async () => {
    setRefreshing(true)
    try { await fetchApi(`/analytics/networks/youtube/${encodeURIComponent(accountId)}?days=${days}&refresh=1`); await reportQuery.refetch() }
    catch (error) { toast.error(error instanceof Error ? error.message : t('Não foi possível atualizar agora.')) }
    finally { setRefreshing(false) }
  }
  const exportReport = () => {
    if (!report) return
    const rows: Array<Array<string | number | null>> = [[t('Rede'), t('Canal'), t('período::Início'), t('Fim'), t('Métrica'), t('Valor')],
      ['YouTube', report.account.title, report.period.since, report.period.until, t('Inscritos (total)'), report.channel.subscribers],
      ['YouTube', report.account.title, report.period.since, report.period.until, t('Vídeos publicados'), report.totals.videos]]
    if (report.analytics.available) for (const [label, value] of Object.entries({ 'Visualizações': report.analytics.totals.views, 'Minutos assistidos': report.analytics.totals.watchMinutes, 'Duração média (s)': report.analytics.totals.averageViewSeconds, 'Inscritos ganhos': report.analytics.totals.subscribersGained, 'Inscritos perdidos': report.analytics.totals.subscribersLost, 'Curtidas': report.analytics.totals.likes, 'Comentários': report.analytics.totals.comments, 'Compartilhamentos': report.analytics.totals.shares })) rows.push(['YouTube', report.account.title, report.period.since, report.period.until, t(label), value])
    rows.push([], [t('Vídeo'), t('Publicado em'), t('Visualizações'), t('Curtidas'), t('Comentários'), t('Link')], ...report.posts.map((video) => [video.title, video.publishedAt, video.views, video.likes, video.comments, video.url]))
    downloadReport(rows, `youtube-${days}dias.csv`)
  }

  if (isLoading) return <p role="status">{t('Carregando canais do YouTube…')}</p>
  if (!accountId) return <Card className="p-8 text-center"><h2 className="text-xl font-bold">{t('Nenhum canal do YouTube nesta empresa')}</h2><p className="mx-auto my-3 max-w-md text-sm text-slate-600">{t('Os relatórios mostram só os canais da empresa selecionada no topo{company}. Conecte o canal desta empresa ou vincule um canal já conectado em Contas.', { company: company ? ` (@${company.igUsername})` : '' })}</p><div className="flex flex-wrap justify-center gap-3"><Button onClick={() => void connect()} disabled={!youtubeConfigured || !companyId}>{youtubeConfigured ? t('Conectar YouTube') : t('Conexão em configuração')}</Button><a className="inline-flex h-10 items-center text-sm font-semibold text-indigo-600 underline" href="/accounts">{t('Vincular em Contas')}</a></div></Card>

  const analytics = report?.analytics.available ? report.analytics : null
  const previous = report?.previous
  return <section className="min-w-0 space-y-4 sm:space-y-5" aria-label={t('Relatório do YouTube')}>
    <div className="report-header">
      <div><p className="report-eyebrow">YouTube</p><h2 className="report-title">{t('Desempenho do canal')}</h2><p className="report-description">{t('Visualizações, tempo assistido, inscritos e os vídeos do período.')}</p></div>
      <div className="report-filters">
        <label>{t('Canal')}<select value={accountId} onChange={(event) => setSelectedId(event.target.value)} disabled={channels.length < 2}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.title}</option>)}</select></label>
        <label>{t('Período')}<select value={days} onChange={(event) => setDays(Number(event.target.value))}>{PERIODS.map((d) => <option key={d} value={d}>{d === 365 ? t('Último ano') : t('Últimos {days} dias', { days: d })}</option>)}</select></label>
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={refreshing || reportQuery.isFetching}><RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />{t('Atualizar')}</Button><Button variant="outline" onClick={exportReport} disabled={!report}><Download size={16} className="mr-2" />{t('Exportar métricas')}</Button></div>
    {reportQuery.isPending && <Card className="p-8" role="status">{t('Consultando o YouTube…')}</Card>}
    {reportQuery.isError && <Card className="border-rose-200 p-5 text-rose-700" role="alert">{reportQuery.error.message}</Card>}
    {report && <>
      {!report.analytics.available && <Card className="border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertCircle className="shrink-0 text-amber-700" size={20} /><div><h3 className="font-semibold text-amber-950">{report.analytics.reason === 'scope' ? t('Libere as métricas detalhadas do canal') : t('O YouTube Analytics não respondeu')}</h3><p className="mt-1 text-sm text-amber-900">{report.analytics.message}</p>{report.analytics.reason === 'scope' && <Button size="sm" className="mt-3" onClick={() => void connect()}>{t('Reconectar canal')}</Button>}</div></div></Card>}
      {report.issues.map((issue) => <p key={issue} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{issue}</p>)}
      <CompareToggle value={comparing} onChange={setComparing} />
      <CompareContext.Provider value={comparing}>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <MetricCard label={t('Inscritos')} value={report.channel.subscribers} detail={report.channel.subscribers == null ? t('O canal oculta o número de inscritos') : t('Total atual')} accent compare={{ current: report.channel.subscribers, previous: null }} />
          {analytics ? <>
            <MetricCard label={t('Visualizações')} value={analytics.totals.views} detail={t('No período, todo o canal')} compare={{ current: analytics.totals.views, previous: previous?.views ?? null }} />
            <MetricCard label={t('Tempo assistido')} value={hours(analytics.totals.watchMinutes)} detail={t('Horas no período')} compare={{ current: analytics.totals.watchMinutes, previous: previous?.watchMinutes ?? null, format: hours }} />
            <MetricCard label={t('Duração média')} value={duration(analytics.totals.averageViewSeconds)} detail={t('Por visualização')} compare={{ current: analytics.totals.averageViewSeconds, previous: previous?.averageViewSeconds ?? null, format: duration }} />
            <MetricCard label={t('Inscritos ganhos')} value={analytics.totals.subscribersGained} detail={t('No período')} compare={{ current: analytics.totals.subscribersGained, previous: previous?.subscribersGained ?? null }} />
            <MetricCard label={t('Inscritos perdidos')} value={analytics.totals.subscribersLost} detail={t('No período')} compare={{ current: analytics.totals.subscribersLost, previous: previous?.subscribersLost ?? null, inverted: true }} />
            <MetricCard label={t('Curtidas')} value={analytics.totals.likes} detail={t('No período, todo o canal')} compare={{ current: analytics.totals.likes, previous: previous?.likes ?? null }} />
            <MetricCard label={t('Comentários')} value={analytics.totals.comments} detail={t('No período, todo o canal')} compare={{ current: analytics.totals.comments, previous: previous?.comments ?? null }} />
            <MetricCard label={t('Compartilhamentos')} value={analytics.totals.shares} detail={t('No período, todo o canal')} compare={{ current: analytics.totals.shares, previous: previous?.shares ?? null }} />
          </> : <>
            <MetricCard label={t('Views dos vídeos do período')} value={report.totals.views} detail={t('Totais atuais dos vídeos publicados')} compare={{ current: report.totals.views, previous: null }} />
            <MetricCard label={t('Curtidas')} value={report.totals.likes} detail={t('Dos vídeos do período')} compare={{ current: report.totals.likes, previous: null }} />
            <MetricCard label={t('Comentários')} value={report.totals.comments} detail={t('Dos vídeos do período')} compare={{ current: report.totals.comments, previous: null }} />
          </>}
          <MetricCard label={t('Vídeos publicados')} value={report.totals.videos} detail={t('No período selecionado')} compare={{ current: report.totals.videos, previous: null }} />
          <MetricCard label={t('Visualizações do canal')} value={report.channel.views} detail={t('Total desde a criação')} compare={{ current: report.channel.views, previous: null }} />
        </div>
      </CompareContext.Provider>
      {analytics && <>
        <ReportChart key={`yt-views-${accountId}-${days}`} title={t('Visualizações e tempo assistido por dia')} description={t('Dados diários do YouTube Analytics para todo o canal. Os últimos dois dias costumam aparecer depois.')} rows={analytics.daily} series={[{ key: 'views', label: t('Visualizações'), color: '#ff0033' }, { key: 'watchMinutes', label: t('Minutos assistidos'), color: '#0f172a' }]} defaultKeys={['views']} filename="youtube-visualizacoes" />
        <ReportChart key={`yt-subs-${accountId}-${days}`} title={t('Inscritos ganhos e perdidos por dia')} description={t('Movimento diário de inscrições do canal.')} rows={analytics.daily} series={[{ key: 'subscribersGained', label: t('Ganhos'), color: '#0284c7' }, { key: 'subscribersLost', label: t('Perdidos'), color: '#e11d48' }]} kind="bar" filename="youtube-inscritos" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5"><h3 className="section-title">{t('De onde vêm as visualizações')}</h3><p className="section-subtitle">{t('Origem do tráfego no período')}</p>
            {analytics.trafficSources.length ? <ul className="mt-3 space-y-2">{(() => { const total = analytics.trafficSources.reduce((sum, row) => sum + row.views, 0) || 1; return analytics.trafficSources.slice(0, 8).map((row) => <li key={row.source}><div className="flex justify-between text-sm"><span className="text-slate-700">{row.source}</span><span className="font-semibold text-slate-900">{reportFormat(row.views)} · {Math.round(row.views / total * 100)}%</span></div><div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#ff0033]" style={{ width: `${row.views / total * 100}%` }} /></div></li>) })()}</ul> : <p className="mt-3 text-sm text-slate-500">{t('O YouTube ainda não tem dados de origem para este período.')}</p>}
          </Card>
          <Card className="p-5"><h3 className="section-title">{t('Público')}</h3><p className="section-subtitle">{t('Idade e gênero de quem assistiu, em % das visualizações')}</p>
            {analytics.demographics.length ? <ul className="mt-3 space-y-2">{analytics.demographics.filter((row) => row.percent > 0).sort((a, b) => b.percent - a.percent).slice(0, 10).map((row) => <li key={`${row.age}-${row.gender}`} className="flex justify-between text-sm"><span className="text-slate-700">{row.gender} · {row.age}</span><span className="font-semibold text-slate-900">{row.percent.toLocaleString(locale, { maximumFractionDigits: 1 })}%</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">{t('O YouTube só mostra o público quando há visualizações suficientes no período.')}</p>}
          </Card>
        </div>
      </>}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="section-title">{t('Vídeos do período')}</h3><p className="section-subtitle">{t('{count} vídeos · contadores atuais de cada vídeo', { count: report.posts.length })}</p></div>
          <select aria-label={t('Ordenar vídeos')} value={order} onChange={(event) => setOrder(event.target.value as typeof order)} className="rounded-lg border border-slate-200 bg-white p-2 text-sm"><option value="views">{t('Mais visualizados')}</option><option value="likes">{t('Mais curtidos')}</option><option value="recent">{t('Mais recentes')}</option></select></div>
        {!videos.length ? <p className="py-6 text-center text-sm text-slate-500">{t('Nenhum vídeo publicado no período.')}</p> : <div className="divide-y divide-slate-100">{videos.map((video) => <article key={video.id} className="flex gap-3 py-3">
          <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100"><MediaPreview src={video.thumbnail} fallback="" />{video.durationSeconds != null && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-semibold text-white">{duration(video.durationSeconds)}</span>}</div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium text-slate-800">{video.title}</p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{new Date(video.publishedAt).toLocaleDateString(locale)}</span><span><b className="text-slate-800">{reportFormat(video.views)}</b> {t('visualizações')}</span><span><b className="text-slate-800">{reportFormat(video.likes)}</b> {t('curtidas')}</span><span><b className="text-slate-800">{reportFormat(video.comments)}</b> {t('comentários')}</span><a href={video.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">{t('Abrir no YouTube')}<ExternalLink size={12} /></a></p>
          </div>
        </article>)}</div>}
      </Card>
      <p className="text-xs text-slate-500">{report.account.title} · {t('Consulta em {date}', { date: new Date(report.collectedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) })}. {report.measurement}</p>
    </>}
  </section>
}
