"use client"
import { Card } from "@/components/ui/card"
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { Activity } from "lucide-react"

const data = [
  { date: '1 Set', rate: 3.8 },
  { date: '5 Set', rate: 4.1 },
  { date: '10 Set', rate: 3.9 },
  { date: '15 Set', rate: 4.5 },
  { date: '20 Set', rate: 4.2 },
  { date: '25 Set', rate: 4.8 },
  { date: '30 Set', rate: 4.2 },
]

export function EngagementChart() {
  return (
    <Card className="p-6 h-[380px] flex flex-col border border-slate-200/80 bg-white rounded-2xl shadow-xs">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">Taxa de Engajamento</h3>
          <p className="text-xs text-slate-500 font-medium">Interações totais divididas por impressões</p>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-100">
          <Activity size={13} />
          <span>Média 4.2%</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="%" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                border: '1px solid #e2e8f0', 
                borderRadius: '12px', 
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                color: '#0f172a',
                fontSize: '12px',
                fontWeight: 600
              }}
              formatter={(val: any) => [`${val}%`, 'Engajamento']}
            />
            <Line 
              type="monotone" 
              dataKey="rate" 
              stroke="#0284c7" 
              strokeWidth={2.5} 
              dot={{ r: 4, fill: '#0284c7', strokeWidth: 2, stroke: '#ffffff' }} 
              activeDot={{ r: 6, fill: '#0284c7' }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
