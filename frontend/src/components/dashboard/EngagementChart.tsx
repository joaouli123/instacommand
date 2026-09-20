"use client"

import { Card } from "@/components/ui/card"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { Activity } from "lucide-react"

type Point = { date: string; engagement: number }

export function EngagementChart({ data }: { data: Point[] }) {
  const chartData = data.map((item) => ({ ...item, label: new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) }))
  return <Card className="flex h-[380px] flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
    <div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-900">Taxa de engajamento</h3><p className="text-xs font-medium text-slate-500">Interações reais por publicação importada</p></div>{chartData.length > 0 && <div className="flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700"><Activity size={13}/>Média {(chartData.reduce((sum, item) => sum + item.engagement, 0) / chartData.length).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</div>}</div>
    {chartData.length ? <div className="min-h-0 flex-1"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/><XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/><YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="%"/><Tooltip formatter={(value: number) => [`${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, "Engajamento"]}/><Line type="monotone" dataKey="engagement" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4, fill: '#0284c7', strokeWidth: 2, stroke: '#fff' }}/></LineChart></ResponsiveContainer></div> : <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">Ainda não há métricas de posts suficientes para calcular o engajamento.</div>}
  </Card>
}
