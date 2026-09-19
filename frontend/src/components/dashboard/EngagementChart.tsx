"use client"
import { Card } from "@/components/ui/card"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const data = [
  { date: '1 Jan', rate: 3.8 },
  { date: '5 Jan', rate: 4.1 },
  { date: '10 Jan', rate: 3.9 },
  { date: '15 Jan', rate: 4.5 },
  { date: '20 Jan', rate: 4.2 },
  { date: '25 Jan', rate: 4.8 },
  { date: '30 Jan', rate: 4.2 },
]

export function EngagementChart() {
  return (
    <Card className="p-6 h-[400px] flex flex-col">
      <h3 className="text-lg font-semibold text-white mb-6">Taxa de Engajamento (%)</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#12121a', borderColor: '#1e1e2e', color: '#e2e8f0' }}
              itemStyle={{ color: '#06b6d4' }}
            />
            <Line type="monotone" dataKey="rate" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4, fill: '#06b6d4', strokeWidth: 2, stroke: '#12121a' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
