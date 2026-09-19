"use client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, TrendingUp, Users } from "lucide-react"

export default function CompetitorsPage() {
  const competitors = [
    { name: "TechBrand", username: "@techbrand_br", followers: "250k", er: "5.4%", avatar: "" },
    { name: "Digital Solutions", username: "@digitalsol", followers: "120k", er: "3.2%", avatar: "" },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Análise de Concorrentes</h2>
      </div>

      <Card className="p-4 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-muted" />
          <Input className="pl-10 h-10" placeholder="Buscar por @username do concorrente..." />
        </div>
        <Button className="gap-2"><Plus size={18} /> Adicionar</Button>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {competitors.map((comp, i) => (
          <Card key={i} className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center text-xl font-bold text-muted">
                {comp.name[0]}
              </div>
              <div>
                <h3 className="font-semibold text-lg">{comp.name}</h3>
                <p className="text-muted text-sm">{comp.username}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-surface rounded-lg">
                <p className="text-xs text-muted flex items-center gap-1 mb-1"><Users size={14}/> Seguidores</p>
                <p className="text-lg font-semibold">{comp.followers}</p>
              </div>
              <div className="p-3 bg-surface rounded-lg">
                <p className="text-xs text-muted flex items-center gap-1 mb-1"><TrendingUp size={14}/> Engajamento</p>
                <p className="text-lg font-semibold text-primary">{comp.er}</p>
              </div>
            </div>

            <Button variant="outline" className="w-full">Ver Detalhes Comparativos</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
