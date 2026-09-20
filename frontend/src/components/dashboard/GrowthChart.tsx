"use client"

import { Card } from "@/components/ui/card"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { TrendingUp } from "lucide-react"

type Point = { date: string; followers: number }

export function GrowthChart({ data }: { data: Point[] }) {
  const chartData = data.map((item) => ({ ...item, label: new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) }))
  return <Card className="flex h-[380px] flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
    <div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-900">Evolução de seguidores</h3><p className="text-xs font-medium text-slate-500">Snapshots reais importados da Meta</p></div>{chartData.length > 1 && <div className="flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><TrendingUp size={13} />{(chartData[chartData.length - 1].followers - chartData[0].followers).toLocaleString("pt-BR")}</div>}</div>
    {chartData.length ? <div className="min-h-0 flex-1"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><defs><linearGradient id="realFollowers" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/><XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/><YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${Number(value) / 1000}k`}/><Tooltip formatter={(value: number) => [`${value.toLocaleString("pt-BR")} seguidores`, "Total"]}/><Area type="monotone" dataKey="followers" stroke="#4f46e5" strokeWidth={2.5} fill="url(#realFollowers)"/></AreaChart></ResponsiveContainer></div> : <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">Sincronize a conta para começar o histórico de crescimento.</div>}
  </Card>
}
