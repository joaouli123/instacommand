"use client"

import { Card } from "@/components/ui/card"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { Activity, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type Point = { date: string; engagement: number; interactions: number }

export function EngagementChart({ data, loading = false, error = false, onRetry }: { data: Point[]; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  const chartData = data.map((item) => ({ ...item, label: new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) }))
  const hasRate = chartData.some((item) => item.engagement > 0)
  const averageInteractions = chartData.length ? chartData.reduce((sum, item) => sum + item.interactions, 0) / chartData.length : 0
  const averageRate = chartData.length ? chartData.reduce((sum, item) => sum + item.engagement, 0) / chartData.length : 0
  return <Card className="flex h-[380px] flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
    <div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-900">Interações e engajamento</h3><p className="text-xs font-medium text-slate-500">Somente métricas reais das publicações importadas</p></div>{chartData.length > 0 && <div className="flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700"><Activity size={13}/>{averageInteractions.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} interações médias{hasRate ? ` · ${averageRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ER` : ""}</div>}</div>
    {loading ? <div className="flex flex-1 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">Carregando métricas…</div> : error ? <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-6 text-center text-sm text-slate-600"><p>Não foi possível carregar as métricas agora.</p>{onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="gap-2"><RefreshCw size={13}/> Tentar novamente</Button>}</div> : chartData.length ? <div className="min-h-0 flex-1"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/><XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/><YAxis yAxisId="interactions" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/><Tooltip formatter={(value: number, name: string) => [name === "interactions" ? `${value.toLocaleString("pt-BR")} interações` : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, name === "interactions" ? "Interações" : "ER"]}/><Line yAxisId="interactions" type="monotone" dataKey="interactions" name="interactions" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}/>{hasRate && <><YAxis yAxisId="rate" orientation="right" stroke="#0284c7" fontSize={12} tickLine={false} axisLine={false} unit="%"/><Line yAxisId="rate" type="monotone" dataKey="engagement" name="engagement" stroke="#0284c7" strokeWidth={2} dot={{ r: 3, fill: '#0284c7', strokeWidth: 2, stroke: '#fff' }}/></>}</LineChart></ResponsiveContainer></div> : <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">Ainda não há métricas de posts suficientes para exibir.</div>}
  </Card>
}
