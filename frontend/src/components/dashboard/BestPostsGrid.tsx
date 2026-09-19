"use client"
import { Heart, MessageCircle, Bookmark } from "lucide-react"

export function BestPostsGrid() {
  const topPosts = [
    { id: 1, img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80', likes: '1.2k', comments: '340', saves: '150', er: '5.2%' },
    { id: 2, img: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?w=500&q=80', likes: '980', comments: '210', saves: '89', er: '4.8%' },
    { id: 3, img: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=500&q=80', likes: '850', comments: '120', saves: '45', er: '4.1%' },
  ]

  return (
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
  )
}
