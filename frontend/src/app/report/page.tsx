"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { SiFacebook, SiInstagram, SiThreads } from "@icons-pack/react-simple-icons"
import { ArrowLeft, Download, Loader2 } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { api, fetchApi } from "@/lib/api"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ChangeBadge } from "@/components/dashboard/MetricCard"
import { MediaPreview } from "@/components/dashboard/MediaPreview"
import { periodChange, type InstagramProfileReport } from "@/lib/instagram-report"
import { cn } from "@/lib/utils"

type Num = number | null | undefined
type Kpi = { label: string; value: Num; previous?: Num; format?: (value: number) => string }
type IgPost = { id: string; mediaType: string; caption?: string | null; igMediaUrl?: string | null; publishedAt: string; metrics?: Record<string, number | null | undefined>; insights?: Array<Record<string, number | null | undefined>> }
type FbReport = { followers: number | null; pageLikes: number | null; contentAvailable: boolean; posts: Array<{ id: string; text: string; createdAt: string; reactions: number | null; comments: number | null; shares: number | null }>; totals: Record<string, { value: number; complete: boolean }>; insights: { mediaViews: number | null }; page: { name: string | null }; previous?: { mediaViews: number | null; posts: number | null; totals: Record<string, { value: number; complete: boolean }> } | null }
type ThMetric = { value: number | null; available: boolean }
type ThReport = { account: { username: string }; metrics: Record<string, ThMetric>; contentAvailable: boolean; posts: Array<{ id: string; text: string; timestamp: string }>; previous?: { metrics: Record<string, ThMetric>; posts: number | null } | null }

const fmt = (value: Num) => value == null ? "—" : Math.round(value).toLocaleString("pt-BR")
const pct = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
const date = (value: Date) => value.toLocaleDateString("pt-BR")
const FORMAT_NAMES: Record<string, string> = { IMAGE: "Imagem", CAROUSEL: "Carrossel", CAROUSEL_ALBUM: "Carrossel", REEL: "Reel", VIDEO: "Vídeo", STORY: "Story", TEXT: "Texto" }
const FORMAT_COLORS: Record<string, string> = { IMAGE: "#6366f1", CAROUSEL: "#0ea5e9", CAROUSEL_ALBUM: "#0ea5e9", REEL: "#ec4899", VIDEO: "#ec4899", STORY: "#f59e0b", TEXT: "#64748b" }
const metric = (post: IgPost, key: string) => post.metrics?.[key] ?? post.insights?.[0]?.[key] ?? null

/** Plain-language bullets built only from the numbers on the page; the user can edit them before exporting. */
function summarize(kpis: Kpi[], extra: string[] = []) {
  const lines = kpis.flatMap((kpi) => {
    const change = periodChange(kpi.value ?? null, kpi.previous ?? null)
    if (!change || change.percent == null || Math.abs(change.percent) < 5 || kpi.value == null) return []
    const shown = kpi.format ? kpi.format(kpi.value) : fmt(kpi.value)
    const word = change.direction === "up" ? "subiu" : "caiu"
    return [`• ${kpi.label}: ${shown} — ${word} ${Math.abs(Math.round(change.percent))}% em relação ao período anterior.`]
  })
  return [...lines.slice(0, 5), ...extra].join("\n") || "• Os números ficaram estáveis em relação ao período anterior."
}

export default function ReportPage() {
  const { accounts, activeAccount, isLoading } = useActiveAccount()
  const [accountId, setAccountId] = useState("")
  const [days, setDays] = useState(30)
  const [compare, setCompare] = useState(true)
  const [networks, setNetworks] = useState({ INSTAGRAM: true, FACEBOOK: true, THREADS: true })
  const account = accounts.find((item) => item.id === (accountId || activeAccount?.id)) || activeAccount
  const id = account?.id || ""
  const threadsQuery = useQuery({ queryKey: ["threads-accounts"], queryFn: api.getThreadsAccounts })
  const threadsId = ((threadsQuery.data || []) as Array<{ id: string }>)[0]?.id

  const ig = useQuery({
    queryKey: ["report-ig", id, days], enabled: !!id && networks.INSTAGRAM,
    queryFn: async ({ signal }) => {
      const get = <T,>(path: string, fallback: T) => (fetchApi(`/analytics/${encodeURIComponent(id)}/${path}`, { signal }) as Promise<T>).catch(() => fallback)
      const [profile, dashboard, top, types, growth, audience] = await Promise.all([
        get<InstagramProfileReport | null>(`profile-report?days=${days}`, null),
        get<{ followers: number | null } | null>(`dashboard?days=${days}`, null),
        get<{ data: IgPost[] }>(`top-posts?days=${days}&sortBy=interactions`, { data: [] }),
        get<Array<{ type: string; posts: number; views?: number | null; interactions?: number | null }>>(`content-types?days=${days}`, []),
        get<Array<{ date: string; reach: number | null; views: number | null }>>(`growth?days=${days}`, []),
        get<{ data: Array<{ name: string; values?: Array<{ value: Record<string, number> }> }> }>(`audience?audience=followers`, { data: [] }),
      ])
      return { profile, dashboard, top: top.data || [], types, growth, audience: audience.data || [] }
    },
  })
  const fb = useQuery({ queryKey: ["report-fb", id, days], enabled: !!id && !!account?.pageId && networks.FACEBOOK, retry: false,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/facebook/${encodeURIComponent(id)}?days=${Math.min(days, 90)}`, { signal }) as Promise<FbReport> })
  const th = useQuery({ queryKey: ["report-th", threadsId, days], enabled: !!threadsId && networks.THREADS, retry: false,
    queryFn: ({ signal }) => fetchApi(`/analytics/networks/threads/${encodeURIComponent(threadsId!)}?days=${days}`, { signal }) as Promise<ThReport> })

  const until = new Date(), since = new Date(until.getTime() - days * 864e5), prevSince = new Date(since.getTime() - days * 864e5)
  const loading = (networks.INSTAGRAM && ig.isLoading) || (networks.FACEBOOK && fb.isLoading) || (networks.THREADS && th.isLoading)

  if (isLoading) return <p className="text-sm text-slate-500">Carregando…</p>
  if (!account) return <p className="text-sm text-slate-500">Conecte uma conta para gerar relatórios.</p>

  return <div className="report-doc space-y-6">
    <div className="no-print space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="page-eyebrow">Desempenho</p><h1 className="page-title">Gerar relatório</h1><p className="page-subtitle">Monte o relatório, ajuste a análise escrita e baixe em PDF para enviar ao cliente.</p></div>
        <div className="flex gap-2"><Button variant="outline" asChild><Link href="/analytics"><ArrowLeft size={15} className="mr-1.5" />Relatórios</Link></Button><Button onClick={() => window.print()} disabled={loading} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Download size={15} />Baixar PDF</Button></div>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-semibold text-slate-600">Conta<select value={account.id} onChange={(event) => setAccountId(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm">{accounts.map((item) => <option key={item.id} value={item.id}>@{item.igUsername}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Período<select value={days} onChange={(event) => setDays(Number(event.target.value))} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm"><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select></label>
        <div className="flex flex-wrap gap-2">{(["INSTAGRAM", "FACEBOOK", "THREADS"] as const).map((network) => <label key={network} className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"><input type="checkbox" checked={networks[network]} onChange={(event) => setNetworks((current) => ({ ...current, [network]: event.target.checked }))} className="accent-indigo-600" />{{ INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads" }[network]}</label>)}</div>
        <label className="flex h-10 items-center gap-2 text-sm text-slate-700"><Switch checked={compare} onCheckedChange={setCompare} />Comparar com o período anterior</label>
        {loading && <span className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" />Buscando dados…</span>}
      </div>
    </div>

    <article className="report-paper mx-auto max-w-[1000px] rounded-2xl border border-slate-200 bg-white px-6 py-10 shadow-sm sm:px-10">
      <div className="text-center">
        {account.igProfilePicUrl ? <img src={account.igProfilePicUrl} alt="" className="mx-auto h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" /> : <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl font-bold text-white">{account.igUsername[0]?.toUpperCase()}</div>}
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Relatório de @{account.igUsername}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Análise de desempenho</p>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-slate-600">Relatório gerado com os dados de {date(since)} a {date(until)}{compare ? `, comparados com o período de ${date(prevSince)} a ${date(since)}` : ""}.</p>
      </div>

      {networks.INSTAGRAM && <InstagramSection data={ig.data} loading={ig.isLoading} compare={compare} username={account.igUsername} days={days} />}
      {networks.FACEBOOK && account.pageId && <FacebookSection data={fb.data} loading={fb.isLoading} failed={fb.isError} compare={compare} />}
      {networks.THREADS && threadsId && <ThreadsSection data={th.data} loading={th.isLoading} failed={th.isError} compare={compare} />}

      <p className="mt-10 text-center text-[11px] text-slate-400">Gerado pelo InstaCommand em {new Date().toLocaleString("pt-BR")} · Dados fornecidos pela Meta. “—” indica dado não fornecido pela rede.</p>
    </article>
  </div>
}

function Section({ icon, color, title, subtitle, children }: { icon: ReactNode; color: string; title: string; subtitle: string; children: ReactNode }) {
  return <section className="report-section mt-10 overflow-hidden rounded-2xl border border-slate-200">
    <div className="h-1" style={{ background: color }} />
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: color }}>{icon}</span><div><p className="font-bold text-slate-900">{title}</p><p className="text-xs text-slate-500">{subtitle}</p></div></div>
    <div className="space-y-8 px-5 py-6">{children}</div>
  </section>
}

function Analysis({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  useEffect(() => { setText(initial) }, [initial])
  return <div className="avoid-break">
    <h3 className="text-base font-semibold text-slate-900">Análise do período</h3>
    <textarea value={text} onChange={(event) => setText(event.target.value)} rows={Math.max(4, text.split("\n").length + 1)} className="no-print mt-2 w-full rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-3 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-400" aria-label="Análise escrita (editável)" />
    <p className="no-print mt-1 text-[11px] text-slate-400">Texto sugerido a partir dos números. Edite à vontade: é assim que vai sair no PDF.</p>
    <div className="print-only mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{text}</div>
  </div>
}

function KpiGrid({ items, compare }: { items: Kpi[]; compare: boolean }) {
  return <div className="avoid-break grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">{items.map((item) => {
    const change = compare ? periodChange(item.value ?? null, item.previous ?? null) : null
    const show = (value: Num) => value == null ? "—" : item.format ? item.format(value) : fmt(value)
    return <div key={item.label} className="text-center">
      <p className="text-sm font-medium text-slate-600">{item.label}</p>
      <div className="mt-1.5 flex items-center justify-center gap-2"><span className="text-2xl font-bold tabular-nums text-slate-900">{show(item.value)}</span>{change && <ChangeBadge direction={change.direction} percent={change.percent} />}</div>
      {change && <p className="mt-0.5 text-[11px] text-slate-500"><b className="font-semibold text-slate-700">{show(item.previous)}</b> no período anterior</p>}
    </div>
  })}</div>
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return null
  return <div className="avoid-break">
    <h3 className="mb-3 text-center text-sm font-semibold text-slate-900">{title}</h3>
    <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-xs">
      <thead className="bg-slate-50 text-slate-500"><tr>{head.map((cell, index) => <th key={cell} className={cn("px-3 py-2.5 font-semibold", index > 0 && "text-right")}>{cell}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cn("px-3 py-2.5 align-middle text-slate-700", cellIndex > 0 && "text-right tabular-nums")}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
  </div>
}

function Loading() { return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />Buscando dados da rede…</p> }

type IgData = { profile: InstagramProfileReport | null; dashboard: { followers: number | null } | null; top: IgPost[]; types: Array<{ type: string; posts: number; views?: number | null; interactions?: number | null }>; growth: Array<{ date: string; reach: number | null; views: number | null }>; audience: Array<{ name: string; values?: Array<{ value: Record<string, number> }> }> }

function InstagramSection({ data, loading, compare, username, days }: { data?: IgData; loading: boolean; compare: boolean; username: string; days: number }) {
  const m = data?.profile?.metrics, p = data?.profile?.previous?.metrics
  const followers = data?.dashboard?.followers ?? null
  const net = data?.profile?.followers.net ?? null
  const kpis: Kpi[] = [
    { label: "Seguidores", value: followers, previous: followers != null && net != null ? followers - net : null },
    { label: "Alcance", value: m?.reach, previous: p?.reach },
    { label: "Visualizações", value: m?.views, previous: p?.views },
    { label: "Interações", value: m?.interactions, previous: p?.interactions },
    { label: "Contas engajadas", value: m?.accountsEngaged, previous: p?.accountsEngaged },
    { label: "Taxa de engajamento", value: data?.profile?.engagementRate, previous: data?.profile?.previous?.engagementRate, format: pct },
    { label: "Curtidas", value: m?.likes, previous: p?.likes },
    { label: "Comentários", value: m?.comments, previous: p?.comments },
    { label: "Compartilhamentos", value: m?.shares, previous: p?.shares },
    { label: "Salvos", value: m?.saves, previous: p?.saves },
    { label: "Toques em links", value: m?.profileLinkTaps, previous: p?.profileLinkTaps },
    { label: "Frequência", value: data?.profile?.frequency, previous: data?.profile?.previous?.frequency, format: (value) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) },
  ]
  const formats = (data?.types || []).filter((row) => row.posts > 0 && row.interactions != null).map((row) => ({ name: FORMAT_NAMES[row.type] || row.type, type: row.type, value: Math.round((row.interactions || 0) / row.posts * 10) / 10 })).sort((a, b) => b.value - a.value)
  const ages = useMemo(() => {
    const entry = (data?.audience || []).find((item) => item.name.endsWith("_age")) || (data?.audience || [])[0]
    const values = entry?.values?.[0]?.value || {}
    return Object.entries(values).filter(([, value]) => typeof value === "number").map(([label, value]) => ({ label, value: value as number })).sort((a, b) => a.label.localeCompare(b.label))
  }, [data?.audience])
  const best = data?.top[0]
  const extra = [
    formats.length > 1 ? `• ${formats[0].name} foi o formato com mais interações por post (${formats[0].value.toLocaleString("pt-BR")}).` : "",
    best ? `• A publicação de maior destaque teve ${fmt(Number(metric(best, "interactions") ?? 0))} interações.` : "",
  ].filter(Boolean)
  const summary = data ? summarize(compare ? kpis : [], extra) : ""

  return <Section icon={<SiInstagram size={18} color="white" />} color="linear-gradient(120deg, #F0407A, #D6246E)" title="Instagram" subtitle={`@${username} · últimos ${Math.min(days, 30)} dias no resumo do perfil`}>
    {loading || !data ? <Loading /> : <>
      <Analysis initial={summary} />
      <KpiGrid items={kpis} compare={compare} />
      {data.growth.some((row) => row.reach != null) && <div className="avoid-break"><h3 className="mb-3 text-center text-sm font-semibold text-slate-900">Alcance e visualizações por dia</h3><div className="h-56"><ResponsiveContainer><AreaChart data={data.growth} margin={{ left: -10, right: 8 }}><defs><linearGradient id="rp-reach" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient><linearGradient id="rp-views" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ec4899" stopOpacity={0.25} /><stop offset="100%" stopColor="#ec4899" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#eef2f7" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => value.slice(8, 10) + "/" + value.slice(5, 7)} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={20} /><YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} /><Area type="monotone" dataKey="views" name="Visualizações" stroke="#ec4899" fill="url(#rp-views)" strokeWidth={2} isAnimationActive={false} /><Area type="monotone" dataKey="reach" name="Alcance" stroke="#6366f1" fill="url(#rp-reach)" strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div><p className="mt-1 text-center text-[11px] text-slate-500"><span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500" />Alcance</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500" />Visualizações</span></p></div>}
      <Table title="Publicações em destaque" head={["Publicação", "Formato", "Alcance", "Visualizações", "Curtidas", "Comentários", "Salvos", "Interações"]} rows={data.top.slice(0, 8).map((post) => [
        <div key="p" className="flex min-w-[220px] items-center gap-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100"><MediaPreview src={post.igMediaUrl} isVideo={post.mediaType === "REEL"} fallback="" /></div><div className="min-w-0"><p className="line-clamp-2 text-xs font-medium text-slate-800">{post.caption?.split("\n")[0] || "Sem legenda"}</p><p className="text-[10px] text-slate-400">{new Date(post.publishedAt).toLocaleDateString("pt-BR")}</p></div></div>,
        FORMAT_NAMES[post.mediaType] || post.mediaType, fmt(metric(post, "reach")), fmt(metric(post, "views")), fmt(metric(post, "likes")), fmt(metric(post, "comments")), fmt(metric(post, "saves")), <b key="i" className="text-slate-900">{fmt(metric(post, "interactions"))}</b>,
      ])} />
      <div className="grid gap-8 sm:grid-cols-2">
        {formats.length > 0 && <div className="avoid-break"><h3 className="mb-3 text-center text-sm font-semibold text-slate-900">Interações por post, por formato</h3><div style={{ height: Math.max(120, formats.length * 48) }}><ResponsiveContainer><BarChart data={formats} layout="vertical" margin={{ right: 40 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={80} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#334155" }} /><Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24} isAnimationActive={false}>{formats.map((row) => <Cell key={row.type} fill={FORMAT_COLORS[row.type] || "#64748b"} />)}<LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "#0f172a" }} /></Bar></BarChart></ResponsiveContainer></div></div>}
        {ages.length > 0 && <div className="avoid-break"><h3 className="mb-3 text-center text-sm font-semibold text-slate-900">Seguidores por idade</h3><div className="h-48"><ResponsiveContainer><BarChart data={ages} margin={{ left: -10 }}><CartesianGrid stroke="#eef2f7" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={40} /><Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div>}
      </div>
    </>}
  </Section>
}

function FacebookSection({ data, loading, failed, compare }: { data?: FbReport; loading: boolean; failed: boolean; compare: boolean }) {
  const prev = data?.previous
  const total = (source: FbReport["totals"] | undefined, key: string) => source?.[key]?.complete ? source[key].value : null
  const kpis: Kpi[] = data ? [
    { label: "Seguidores", value: data.followers },
    { label: "Curtidas da Página", value: data.pageLikes },
    { label: "Publicações", value: data.contentAvailable ? data.posts.length : null, previous: prev?.posts },
    { label: "Visualizações", value: data.insights.mediaViews, previous: prev?.mediaViews },
    { label: "Reações", value: total(data.totals, "reactions"), previous: total(prev?.totals, "reactions") },
    { label: "Comentários", value: total(data.totals, "comments"), previous: total(prev?.totals, "comments") },
    { label: "Compartilhamentos", value: total(data.totals, "shares"), previous: total(prev?.totals, "shares") },
  ] : []
  const posts = (data?.posts || []).map((post) => ({ ...post, total: (post.reactions ?? 0) + (post.comments ?? 0) + (post.shares ?? 0) })).sort((a, b) => b.total - a.total).slice(0, 8)
  return <Section icon={<SiFacebook size={18} color="white" />} color="#0866FF" title="Facebook" subtitle={data?.page.name || "Página vinculada"}>
    {failed ? <p className="text-sm text-slate-500">Não foi possível consultar a Página agora.</p> : loading || !data ? <Loading /> : <>
      <Analysis initial={summarize(compare ? kpis : [])} />
      <KpiGrid items={kpis} compare={compare} />
      <Table title="Publicações em destaque" head={["Publicação", "Reações", "Comentários", "Compartilhamentos"]} rows={posts.map((post) => [
        <div key="p" className="min-w-[240px]"><p className="line-clamp-2 text-xs font-medium text-slate-800">{post.text || "Sem texto"}</p><p className="text-[10px] text-slate-400">{new Date(post.createdAt).toLocaleDateString("pt-BR")}</p></div>, fmt(post.reactions), fmt(post.comments), fmt(post.shares),
      ])} />
    </>}
  </Section>
}

function ThreadsSection({ data, loading, failed, compare }: { data?: ThReport; loading: boolean; failed: boolean; compare: boolean }) {
  const value = (source: Record<string, ThMetric> | undefined, key: string) => source?.[key]?.available ? source[key].value : null
  const kpis: Kpi[] = data ? [
    { label: "Seguidores", value: value(data.metrics, "followers_count") },
    ...([["views", "Visualizações"], ["likes", "Curtidas"], ["replies", "Respostas"], ["reposts", "Republicações"], ["quotes", "Citações"]] as const).map(([key, label]) => ({ label, value: value(data.metrics, key), previous: value(data.previous?.metrics, key) })),
    { label: "Publicações", value: data.contentAvailable ? data.posts.length : null, previous: data.previous?.posts },
  ] : []
  return <Section icon={<SiThreads size={18} color="white" />} color="#111111" title="Threads" subtitle={data ? `@${data.account.username}` : "Perfil do Threads"}>
    {failed ? <p className="text-sm text-slate-500">Não foi possível consultar o Threads agora.</p> : loading || !data ? <Loading /> : <>
      <Analysis initial={summarize(compare ? kpis : [])} />
      <KpiGrid items={kpis} compare={compare} />
      <Table title="Publicações do período" head={["Publicação", "Data"]} rows={data.posts.slice(0, 8).map((post) => [<p key="t" className="line-clamp-2 min-w-[260px] text-xs font-medium text-slate-800">{post.text || "Sem texto"}</p>, new Date(post.timestamp).toLocaleDateString("pt-BR")])} />
    </>}
  </Section>
}
