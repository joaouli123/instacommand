"use client"
import { Card } from "@/components/ui/card"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const data = [
  { date: '1 Jan', followers: 120000 },
  { date: '5 Jan', followers: 120500 },
  { date: '10 Jan', followers: 121200 },
  { date: '15 Jan', followers: 122000 },
  { date: '20 Jan', followers: 122800 },
  { date: '25 Jan', followers: 123500 },
  { date: '30 Jan', followers: 124500 },
]

export function GrowthChart() {
  return (
    <Card className="p-6 h-[400px] flex flex-col">
      <h3 className="text-lg font-semibold text-white mb-6">Crescimento de Seguidores</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorFollowers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000}k`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#12121a', borderColor: '#1e1e2e', color: '#e2e8f0' }}
              itemStyle={{ color: '#8b5cf6' }}
            />
            <Area type="monotone" dataKey="followers" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorFollowers)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
