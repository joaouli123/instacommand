"use client"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis, PieChart, Pie, Cell, CartesianGrid, Legend
} from "recharts"
import { Heart, MessageCircle, Bookmark, Share2, Eye, TrendingUp, Trophy } from "lucide-react"

// Mock data
const reachData = [
  { name: '01/09', alcance: 4200, impressoes: 8400 },
  { name: '05/09', alcance: 3800, impressoes: 7100 },
  { name: '09/09', alcance: 5100, impressoes: 9800 },
  { name: '13/09', alcance: 4600, impressoes: 8900 },
  { name: '17/09', alcance: 6200, impressoes: 11400 },
  { name: '21/09', alcance: 5800, impressoes: 10200 },
  { name: '25/09', alcance: 7100, impressoes: 13500 },
  { name: '30/09', alcance: 6800, impressoes: 12800 },
]

const engagementByDay = [
  { name: 'Seg', er: 4.2 }, { name: 'Ter', er: 3.8 }, { name: 'Qua', er: 5.1 },
  { name: 'Qui', er: 4.9 }, { name: 'Sex', er: 3.5 }, { name: 'Sáb', er: 2.8 }, { name: 'Dom', er: 3.2 },
]

const genderData = [
  { name: 'Mulheres', value: 62, color: '#4f46e5' },
  { name: 'Homens', value: 35, color: '#0284c7' },
  { name: 'Outros', value: 3, color: '#94a3b8' },
]

const ageData = [
  { faixa: '13-17', pct: 4 }, { faixa: '18-24', pct: 28 }, { faixa: '25-34', pct: 38 },
  { faixa: '35-44', pct: 18 }, { faixa: '45-54', pct: 8 }, { faixa: '55+', pct: 4 },
]

const cityData = [
  { cidade: 'São Paulo', pct: 22 }, { cidade: 'Rio de Janeiro', pct: 15 },
  { cidade: 'Belo Horizonte', pct: 8 }, { cidade: 'Curitiba', pct: 6 },
  { cidade: 'Porto Alegre', pct: 5 }, { cidade: 'Salvador', pct: 4 },
]

const postsMock = [
  { id: 1, type: 'REEL', date: '15/09', img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=100&q=80', likes: 1240, comments: 342, saves: 156, shares: 89, reach: 8200, er: 5.2, top: true },
  { id: 2, type: 'CAROUSEL', date: '12/09', img: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?w=100&q=80', likes: 980, comments: 210, saves: 89, shares: 45, reach: 6100, er: 4.8, top: true },
  { id: 3, type: 'IMAGE', date: '10/09', img: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=100&q=80', likes: 850, comments: 120, saves: 45, shares: 22, reach: 5300, er: 4.1, top: false },
  { id: 4, type: 'REEL', date: '08/09', img: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=100&q=80', likes: 620, comments: 85, saves: 32, shares: 18, reach: 4100, er: 3.2, top: false },
  { id: 5, type: 'CAROUSEL', date: '05/09', img: 'https://images.unsplash.com/photo-1585247226801-bc613c441316?w=100&q=80', likes: 530, comments: 68, saves: 28, shares: 12, reach: 3800, er: 2.9, top: false },
]

// Heatmap data: 7 days x 24 hours engagement intensity
const hours = Array.from({ length: 24 }, (_, i) => i)
const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const heatmapData: number[][] = [
  [1,1,0,0,0,0,2,4,5,4,3,5,5,4,3,4,5,5,4,5,4,3,2,1],
  [0,0,0,0,0,1,2,4,5,3,2,4,5,3,2,3,4,5,4,5,3,2,1,1],
  [1,0,0,0,0,1,3,5,5,4,3,5,5,5,4,4,5,5,5,5,4,3,2,1],
  [0,0,0,0,0,1,2,4,5,4,3,4,5,4,3,4,5,5,5,5,4,3,2,1],
  [1,0,0,0,0,1,2,3,4,3,2,3,4,3,2,3,4,4,3,4,3,2,1,0],
  [0,0,0,0,0,0,1,2,3,3,2,3,3,3,2,2,3,3,3,3,2,2,1,0],
  [0,0,0,0,0,0,1,2,3,3,3,4,4,3,2,3,3,4,4,3,3,2,1,0],
]

function getHeatColor(val: number) {
  const colors = ['bg-slate-100', 'bg-indigo-100', 'bg-indigo-200', 'bg-indigo-300', 'bg-indigo-500', 'bg-indigo-700']
  return colors[val] || colors[0]
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Performance</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Análise de desempenho</h2><p className="mt-1 text-sm text-slate-500">Acompanhe o que está gerando alcance, interação e crescimento.</p></div>
        <div className="w-48">
          <Select defaultValue="30d">
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="visao">
        <TabsList className="mb-6">
          <TabsTrigger value="visao">Visão Geral</TabsTrigger>
          <TabsTrigger value="posts">Conteúdo</TabsTrigger>
          <TabsTrigger value="audiencia">Audiência</TabsTrigger>
        </TabsList>

        {/* ============ VISÃO GERAL ============ */}
        <TabsContent value="visao" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Alcance', value: '12.5k', change: '+18%', icon: Eye, positive: true },
              { label: 'Impressões', value: '45.2k', change: '+12%', icon: TrendingUp, positive: true },
              { label: 'Visitas ao Perfil', value: '3.1k', change: '+8%', icon: Eye, positive: true },
              { label: 'Cliques no Link', value: '842', change: '-3%', icon: Share2, positive: false },
            ].map((stat) => (
              <Card key={stat.label} className="border-slate-200/80 bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <stat.icon size={16} className="text-slate-400" />
                </div>
                <h4 className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</h4>
                <span className={`text-xs font-medium ${stat.positive ? 'text-success' : 'text-danger'}`}>
                  {stat.change} vs período anterior
                </span>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-bold text-slate-900">Alcance e impressões</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={reachData}>
                  <defs>
                    <linearGradient id="colorAlcance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorImpress" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }} />
                  <Legend />
                  <Area type="monotone" dataKey="alcance" name="Alcance" stroke="#4f46e5" fill="url(#colorAlcance)" />
                  <Area type="monotone" dataKey="impressoes" name="Impressões" stroke="#0284c7" fill="url(#colorImpress)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <h3 className="mb-4 text-lg font-bold text-slate-900">Engajamento por dia</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={engagementByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }} />
                  <Bar dataKey="er" name="Taxa de Engajamento" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </TabsContent>

        {/* ============ CONTEÚDO / POSTS ============ */}
        <TabsContent value="posts" className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-bold text-slate-900">Performance de publicações</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="text-left py-3 px-2">Post</th>
                    <th className="text-left py-3 px-2">Tipo</th>
                    <th className="text-left py-3 px-2">Data</th>
                    <th className="text-right py-3 px-2"><Heart size={14} className="inline" /> Likes</th>
                    <th className="text-right py-3 px-2"><MessageCircle size={14} className="inline" /> Coment.</th>
                    <th className="text-right py-3 px-2"><Bookmark size={14} className="inline" /> Salvos</th>
                    <th className="text-right py-3 px-2"><Share2 size={14} className="inline" /> Compart.</th>
                    <th className="text-right py-3 px-2"><Eye size={14} className="inline" /> Alcance</th>
                    <th className="text-right py-3 px-2">ER</th>
                  </tr>
                </thead>
                <tbody>
                  {postsMock.map((post) => (
                    <tr key={post.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/80">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <img src={post.img} alt="" className="w-10 h-10 rounded object-cover" />
                          {post.top && <Trophy size={14} className="text-warning" />}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={post.type === 'REEL' ? 'default' : post.type === 'CAROUSEL' ? 'secondary' : 'outline'}>
                          {post.type === 'REEL' ? 'Reel' : post.type === 'CAROUSEL' ? 'Carrossel' : 'Imagem'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-slate-500">{post.date}</td>
                      <td className="py-3 px-2 text-right font-medium">{post.likes.toLocaleString('pt-BR')}</td>
                      <td className="py-3 px-2 text-right font-medium">{post.comments}</td>
                      <td className="py-3 px-2 text-right font-medium">{post.saves}</td>
                      <td className="py-3 px-2 text-right font-medium">{post.shares}</td>
                      <td className="py-3 px-2 text-right font-medium">{post.reach.toLocaleString('pt-BR')}</td>
                      <td className="py-3 px-2 text-right">
                        <span className={`font-bold ${post.er >= 4 ? 'text-success' : post.er >= 3 ? 'text-warning' : 'text-danger'}`}>
                          {post.er}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ============ AUDIÊNCIA ============ */}
        <TabsContent value="audiencia" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gênero */}
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-bold text-slate-900">Distribuição por gênero</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={genderData} innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                    {genderData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            {/* Faixas Etárias */}
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-bold text-slate-900">Faixas etárias</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ageData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} unit="%" />
                  <YAxis type="category" dataKey="faixa" stroke="#94a3b8" fontSize={12} width={50} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }} />
                  <Bar dataKey="pct" name="%" fill="#06b6d4" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Top Cidades */}
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-bold text-slate-900">Top cidades</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="cidade" stroke="#94a3b8" fontSize={11} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="#94a3b8" fontSize={12} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }} />
                  <Bar dataKey="pct" name="%" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Melhores Horários — Heatmap */}
            <Card className="p-6">
              <h3 className="mb-4 text-lg font-bold text-slate-900">Melhores horários para postar</h3>
              <div className="overflow-x-auto">
                <div className="min-w-[500px]">
                  <div className="flex gap-1 mb-1 pl-10">
                    {hours.filter((_, i) => i % 3 === 0).map(h => (
                      <div key={h} className="text-[10px] text-slate-400" style={{ width: `${(3/24)*100}%` }}>{String(h).padStart(2,'0')}h</div>
                    ))}
                  </div>
                  {days.map((day, di) => (
                    <div key={day} className="flex items-center gap-1 mb-1">
                      <span className="w-8 shrink-0 text-xs text-slate-500">{day}</span>
                      <div className="flex gap-[2px] flex-1">
                        {heatmapData[di].map((val, hi) => (
                          <div
                            key={hi}
                            className={`h-5 flex-1 rounded-sm ${getHeatColor(val)} transition-colors hover:ring-1 hover:ring-white/30`}
                            title={`${day} ${String(hi).padStart(2,'0')}:00 — Intensidade: ${val}/5`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-3 justify-end">
                    <span className="text-xs text-slate-500">Menos</span>
                    {[0,1,2,3,4,5].map(v => (
                      <div key={v} className={`w-4 h-4 rounded-sm ${getHeatColor(v)}`} />
                    ))}
                    <span className="text-xs text-slate-500">Mais</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
