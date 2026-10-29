'use client'

// TikTok report of the company chosen at the top: profile totals and the period's videos with
// their current views, likes, comments and shares.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchApi } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MetricCard } from './MetricCard'
import { ReportChart } from './LazyCharts'
import { MediaPreview } from './MediaPreview'
import { downloadReport, reportFormat } from '@/lib/report-chart'
import { useCompanyProfiles } from '@/hooks/useCompanyProfiles'

type Video = { id: string; title: string; createdAt: string; url: string | null; cover: string | null; durationSeconds: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null }
export type TikTokReportData = {
  account: { id: string; username: string | null; displayName: string; avatarUrl: string | null }
  period: { days: number; since: string; until: string }; collectedAt: string
  profile: { followers: number | null; following: number | null; likes: number | null; videos: number | null }
  posts: Video[]; totals: { videos: number; views: number | null; likes: number | null; comments: number | null; shares: number | null }
  engagementRate: number | null; daily: Array<{ date: string; views: number; interactions: number; videos: number }>
  complete: boolean; issues: string[]; measurement: string
}

export function useTikTokReport(accountId: string, days: number) {
  return useQuery<TikTokReportData>({ queryKey: ['tiktok-report', accountId, days], enabled: !!accountId, staleTime: 5 * 60_000, retry: false,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/tiktok/${encodeURIComponent(accountId)}?days=${days}`, { signal }) as Promise<TikTokReportData> })
}

export function TikTokReport() {
  const { company, companyId, tiktok: profiles, tiktokConfigured, isLoading } = useCompanyProfiles()
  const [selectedId, setSelectedId] = useState('')
  const [days, setDays] = useState(30)
  const [order, setOrder] = useState<'views' | 'recent' | 'likes'>('views')
  const accountId = profiles.some((profile) => profile.id === selectedId) ? selectedId : profiles[0]?.id || ''
  const query = useTikTokReport(accountId, days)
  const report = query.data
  const [refreshing, setRefreshing] = useState(false)
  const videos = useMemo(() => [...(report?.posts || [])].sort((a, b) => order === 'recent' ? b.createdAt.localeCompare(a.createdAt) : order === 'likes' ? (b.likes ?? -1) - (a.likes ?? -1) : (b.views ?? -1) - (a.views ?? -1)).slice(0, 30), [report, order])

  const connect = async () => {
    const authWindow = window.open('about:blank', '_blank')
    if (!authWindow) { toast.error('Permita pop-ups para conectar sem sair desta página.'); return }
    authWindow.opener = null
    authWindow.document.body.textContent = 'Abrindo autorização segura do TikTok…'
    try { authWindow.location.replace(((await fetchApi(`/auth/tiktok/url?workspace=${encodeURIComponent(companyId)}`)) as { url: string }).url) }
    catch (error) { authWindow.close(); toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a autorização do TikTok') }
  }
  const refresh = async () => {
    setRefreshing(true)
    try { await fetchApi(`/analytics/networks/tiktok/${encodeURIComponent(accountId)}?days=${days}&refresh=1`); await query.refetch() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar agora.') }
    finally { setRefreshing(false) }
  }
  const exportReport = () => {
    if (!report) return
    downloadReport([['Vídeo', 'Publicado em', 'Visualizações', 'Curtidas', 'Comentários', 'Compartilhamentos', 'Link'], ...report.posts.map((video) => [video.title, video.createdAt, video.views, video.likes, video.comments, video.shares, video.url])], `tiktok-${days}dias.csv`)
  }

  if (isLoading) return <p role="status">Carregando perfis do TikTok…</p>
  if (!accountId) return <Card className="p-8 text-center"><h2 className="text-xl font-bold">Nenhum perfil do TikTok nesta empresa</h2><p className="mx-auto my-3 max-w-md text-sm text-slate-600">Os relatórios mostram só os perfis da empresa selecionada no topo{company ? ` (@${company.igUsername})` : ''}. Conecte o perfil desta empresa ou vincule um perfil já conectado em Contas.</p><div className="flex flex-wrap justify-center gap-3"><Button onClick={() => void connect()} disabled={!tiktokConfigured || !companyId}>{tiktokConfigured ? 'Conectar TikTok' : 'Conexão em configuração'}</Button><a className="inline-flex h-10 items-center text-sm font-semibold text-indigo-600 underline" href="/accounts">Vincular em Contas</a></div></Card>

  return <section className="min-w-0 space-y-4 sm:space-y-5" aria-label="Relatório do TikTok">
    <div className="report-header">
      <div><p className="report-eyebrow">TikTok</p><h2 className="report-title">Desempenho do perfil</h2><p className="report-description">Seguidores, curtidas e os vídeos publicados no período.</p></div>
      <div className="report-filters">
        <label>Perfil<select value={accountId} onChange={(event) => setSelectedId(event.target.value)} disabled={profiles.length < 2}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
        <label>Período<select value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}</select></label>
      </div>
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={refreshing || query.isFetching}><RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />Atualizar</Button><Button variant="outline" onClick={exportReport} disabled={!report}><Download size={16} className="mr-2" />Exportar métricas</Button></div>
    {query.isPending && <Card className="p-8" role="status">Consultando o TikTok…</Card>}
    {query.isError && <Card className="border-rose-200 p-5 text-rose-700" role="alert">{query.error.message}</Card>}
    {report && <>
      {report.issues.map((issue) => <p key={issue} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{issue}</p>)}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <MetricCard label="Seguidores" value={report.profile.followers} detail="Total atual" accent />
        <MetricCard label="Curtidas do perfil" value={report.profile.likes} detail="Total desde a criação" />
        <MetricCard label="Vídeos no perfil" value={report.profile.videos} detail="Total atual" />
        <MetricCard label="Vídeos no período" value={report.totals.videos} detail="Publicados no período" />
        <MetricCard label="Visualizações" value={report.totals.views} detail="Dos vídeos do período" />
        <MetricCard label="Curtidas" value={report.totals.likes} detail="Dos vídeos do período" />
        <MetricCard label="Comentários" value={report.totals.comments} detail="Dos vídeos do período" />
        <MetricCard label="Compartilhamentos" value={report.totals.shares} detail="Dos vídeos do período" />
        <MetricCard label="Taxa de engajamento" value={report.engagementRate == null ? null : `${report.engagementRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`} detail="Interações ÷ visualizações" />
      </div>
      <ReportChart key={`tt-${accountId}-${days}`} title="Visualizações e interações por dia de publicação" description="Soma dos vídeos publicados em cada dia, com os contadores atuais de cada vídeo." rows={report.daily} series={[{ key: 'views', label: 'Visualizações', color: '#111111' }, { key: 'interactions', label: 'Interações', color: '#fe2c55' }]} defaultKeys={['views', 'interactions']} filename="tiktok-desempenho" />
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="section-title">Vídeos do período</h3><p className="section-subtitle">{report.posts.length} vídeos · contadores atuais</p></div>
          <select aria-label="Ordenar vídeos do TikTok" value={order} onChange={(event) => setOrder(event.target.value as typeof order)} className="rounded-lg border border-slate-200 bg-white p-2 text-sm"><option value="views">Mais visualizados</option><option value="likes">Mais curtidos</option><option value="recent">Mais recentes</option></select></div>
        {!videos.length ? <p className="py-6 text-center text-sm text-slate-500">Nenhum vídeo publicado no período.</p> : <div className="divide-y divide-slate-100">{videos.map((video) => <article key={video.id} className="flex gap-3 py-3">
          <div className="relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100"><MediaPreview src={video.cover} fallback="" /></div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium text-slate-800">{video.title}</p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{new Date(video.createdAt).toLocaleDateString('pt-BR')}</span><span><b className="text-slate-800">{reportFormat(video.views)}</b> visualizações</span><span><b className="text-slate-800">{reportFormat(video.likes)}</b> curtidas</span><span><b className="text-slate-800">{reportFormat(video.comments)}</b> comentários</span><span><b className="text-slate-800">{reportFormat(video.shares)}</b> compartilhamentos</span>{video.url && <a href={video.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">Abrir no TikTok<ExternalLink size={12} /></a>}</p>
          </div>
        </article>)}</div>}
      </Card>
      <p className="text-xs text-slate-500">{report.account.displayName} · Consulta em {new Date(report.collectedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. {report.measurement}</p>
    </>}
  </section>
}
