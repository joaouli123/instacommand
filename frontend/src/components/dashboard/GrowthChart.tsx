"use client"
import { Card } from "@/components/ui/card"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { TrendingUp } from "lucide-react"

const data = [
  { date: '1 Set', followers: 120000 },
  { date: '5 Set', followers: 120800 },
  { date: '10 Set', followers: 121500 },
  { date: '15 Set', followers: 122400 },
  { date: '20 Set', followers: 123100 },
  { date: '25 Set', followers: 123900 },
  { date: '30 Set', followers: 124500 },
]

export function GrowthChart() {
  return (
    <Card className="p-6 h-[380px] flex flex-col border border-slate-200/80 bg-white rounded-2xl shadow-xs">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">Evolução de Seguidores</h3>
          <p className="text-xs text-slate-500 font-medium">Crescimento contínuo nos últimos 30 dias</p>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
          <TrendingUp size={13} />
          <span>+4.5k novos</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorFollowers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18}/>
                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000}k`} />
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
              formatter={(val: any) => [`${Number(val).toLocaleString('pt-BR')} seguidores`, 'Total']}
            />
            <Area type="monotone" dataKey="followers" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFollowers)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
