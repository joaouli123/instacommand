"use client"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Hash, Flame } from "lucide-react"

export default function TrendsPage() {
  const hashtags = ["marketingdigital", "socialmedia", "empreendedorismo", "dicasdeinstagram"]
  const trends = [
    { title: "Vídeos curtos educacionais", type: "Reels", score: 98 },
    { title: "Carrossel passo a passo", type: "Carrossel", score: 85 },
    { title: "Bastidores da empresa", type: "Stories", score: 72 },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-white">Tendências e Insights</h2>

      <div className="relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-muted" />
        <Input className="pl-10 h-12 text-lg bg-surface/50 border-border focus:bg-surface transition-colors" placeholder="Pesquisar hashtags ou nichos..." />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wider">Hashtags Monitoradas</h3>
        <div className="flex gap-2 flex-wrap">
          {hashtags.map(tag => (
            <Badge key={tag} variant="secondary" className="px-3 py-1 text-sm gap-1 cursor-pointer hover:bg-primary/20 hover:text-primary">
              <Hash size={14} /> {tag}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="md:col-span-2 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Flame className="text-warning"/> Em Alta no Seu Nicho</h3>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="overflow-hidden group cursor-pointer">
                <div className="h-48 bg-surface relative">
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium">Post Inspirador #{i}</p>
                  <p className="text-xs text-muted mt-1">12k likes • 340 comentários</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Formatos Recomendados</h3>
          {trends.map((trend, i) => (
            <Card key={i} className="p-4 flex flex-col gap-2 border-l-4 border-l-primary">
              <div className="flex justify-between items-start">
                <h4 className="font-medium text-white">{trend.title}</h4>
                <Badge variant="outline" className="text-xs">{trend.type}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${trend.score}%` }} />
                </div>
                <span className="text-xs font-bold text-accent">{trend.score}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
