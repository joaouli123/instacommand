import { StatsCards } from "@/components/dashboard/StatsCards"
import { GrowthChart } from "@/components/dashboard/GrowthChart"
import { EngagementChart } from "@/components/dashboard/EngagementChart"
import { Card } from "@/components/ui/card"
import { Heart, MessageCircle, Bookmark } from "lucide-react"

export default function DashboardPage() {
  const topPosts = [
    { id: 1, img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80', likes: '1.2k', comments: '340', saves: '150', er: '5.2%' },
    { id: 2, img: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?w=500&q=80', likes: '980', comments: '210', saves: '89', er: '4.8%' },
    { id: 3, img: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=500&q=80', likes: '850', comments: '120', saves: '45', er: '4.1%' },
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <StatsCards />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GrowthChart />
        <EngagementChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">Top Posts da Semana</h3>
          <div className="grid grid-cols-3 gap-4">
            {topPosts.map(post => (
              <div key={post.id} className="group relative rounded-lg overflow-hidden aspect-square border border-border">
                <img src={post.img} alt="Post" className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center text-white gap-2">
                  <div className="flex items-center gap-1"><Heart size={16}/> {post.likes}</div>
                  <div className="flex items-center gap-1"><MessageCircle size={16}/> {post.comments}</div>
                  <div className="flex items-center gap-1"><Bookmark size={16}/> {post.saves}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Próximos Posts</h3>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-md bg-surface border border-border">
                <div className="w-12 h-12 rounded bg-border animate-pulse shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Dicas de Marketing #0{i}</p>
                  <p className="text-xs text-muted">Amanhã, 18:00</p>
                </div>
                <div className="text-xs font-semibold text-primary">Em 24h</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
