"use client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Plus, RefreshCw, Trash2 } from "lucide-react"

export default function AccountsPage() {
  const accounts = [
    {
      id: 1,
      username: "minha_empresa",
      followers: "124.5k",
      status: "active",
      lastSync: "Há 5 min",
      pic: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&q=80"
    },
    {
      id: 2,
      username: "produto_oficial",
      followers: "89.2k",
      status: "active",
      lastSync: "Há 2 horas",
      pic: "https://images.unsplash.com/photo-1523206489230-c012c64b2b48?w=100&q=80"
    }
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Contas Conectadas</h2>
        <Button className="gap-2">
          <Plus size={18} />
          Conectar Nova Conta
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map(acc => (
          <Card key={acc.id} className="p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div className="flex gap-4 items-center">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={acc.pic} />
                  <AvatarFallback>{acc.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-white">@{acc.username}</h3>
                  <p className="text-sm text-muted">{acc.followers} seguidores</p>
                </div>
              </div>
              <Badge variant="success">Ativo</Badge>
            </div>
            
            <div className="flex items-center text-xs text-muted mb-2">
              Sincronizado: {acc.lastSync}
            </div>

            <div className="flex gap-2 mt-auto">
              <Button variant="secondary" className="flex-1 gap-2">
                <RefreshCw size={16} />
                Sincronizar
              </Button>
              <Button variant="danger" size="icon">
                <Trash2 size={16} />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
