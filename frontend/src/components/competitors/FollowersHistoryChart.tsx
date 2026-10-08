"use client"

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

export function FollowersHistoryChart({ data, compact }: { data: Array<{ date: string; followers: number }>; compact: (value: number) => string }) {
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={56} domain={["dataMin", "dataMax"]} tickFormatter={(value: number) => compact(value)} /><Tooltip formatter={(value) => [Number(value).toLocaleString("pt-BR"), "Seguidores"]} /><Line type="monotone" dataKey="followers" stroke="#4f46e5" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
}
