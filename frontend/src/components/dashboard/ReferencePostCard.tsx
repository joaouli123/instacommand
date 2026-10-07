"use client"

import { Copy, ExternalLink, Heart, MessageCircle, Eye, Wand2, Flame } from "lucide-react"
import toast from "react-hot-toast"
import { MediaPreview } from "@/components/dashboard/MediaPreview"

export type RankedPost = {
  id: string
  permalink: string | null
  caption: string | null
  mediaType: string | null
  format: "REELS" | "CAROUSEL" | "IMAGE"
  mediaUrl: string | null
  thumbnailUrl: string | null
  timestamp: string | null
  likes: number | null
  comments: number | null
  views: number | null
  interactions: number | null
  engagementRate: number | null
  velocity: number | null
  source: { type: "competitor" | "hashtag_top" | "hashtag_recent"; label: string; followers?: number | null }
}

export const formatLabel: Record<RankedPost["format"], string> = { REELS: "Reels", CAROUSEL: "Carrossel", IMAGE: "Imagem" }

export const compact = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("pt-BR", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 })

export const relativeTime = (iso: string | null) => {
  if (!iso) return null
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours < 1) return "agora"
  if (hours < 24) return `há ${Math.floor(hours)} h`
  const days = Math.floor(hours / 24)
  return days < 30 ? `há ${days} d` : new Date(iso).toLocaleDateString("pt-BR")
}

export const openAsReference = (post: RankedPost) => {
  if (!post.permalink) return toast.error("A Meta não retornou o link deste post.")
  window.location.href = `/composer?reference=${encodeURIComponent(post.permalink)}`
}

export const copyReference = async (post: RankedPost) => {
  if (!post.permalink) return toast.error("A Meta não retornou o link deste post.")
  try { await navigator.clipboard.writeText(post.permalink); toast.success("Link copiado.") } catch { toast.error("Não foi possível copiar o link.") }
}

const sourceLabel = (source: RankedPost["source"]) =>
  source.type === "competitor" ? `@${source.label}` : `#${source.label}${source.type === "hashtag_recent" ? " · 24 h" : ""}`

/** Thumbnail card for a public post used as content reference (trends and competitors). */
export function ReferencePostCard({ post, rank, highlight }: { post: RankedPost; rank?: number; highlight?: string }) {
  const isVideo = post.format === "REELS" && !post.thumbnailUrl
  return <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition hover:border-indigo-200 hover:shadow-sm">
    <a href={post.permalink || undefined} target="_blank" rel="noreferrer" aria-label="Abrir post no Instagram" className="relative block aspect-[4/5] overflow-hidden bg-slate-100">
      <MediaPreview src={post.thumbnailUrl || post.mediaUrl} isVideo={isVideo} fallback={post.format === "REELS" ? "Reels sem prévia" : "Prévia indisponível"} className="transition duration-300 group-hover:scale-105" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
        {rank !== undefined && <span className="rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-bold text-white">#{rank}</span>}
        <span className="ml-auto rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{formatLabel[post.format]}</span>
      </div>
      {highlight && <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white"><Flame size={11} />{highlight}</span>}
    </a>
    <div className="flex flex-1 flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500"><span className="truncate font-semibold text-slate-700">{sourceLabel(post.source)}</span><span className="shrink-0">{relativeTime(post.timestamp) || ""}</span></div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
        <span className="inline-flex items-center gap-1" title="Curtidas"><Heart size={12} className="text-rose-500" />{compact(post.likes)}</span>
        <span className="inline-flex items-center gap-1" title="Comentários"><MessageCircle size={12} className="text-sky-600" />{compact(post.comments)}</span>
        {post.views !== null && <span className="inline-flex items-center gap-1" title="Visualizações"><Eye size={12} className="text-violet-600" />{compact(post.views)}</span>}
        {post.engagementRate !== null && <span className="font-semibold text-emerald-700" title="(curtidas + comentários) / seguidores">{post.engagementRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>}
      </div>
      {post.caption && <p className="line-clamp-2 text-xs leading-5 text-slate-500">{post.caption}</p>}
      <div className="mt-auto flex gap-1.5 pt-1">
        <button type="button" onClick={() => openAsReference(post)} className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 text-[11px] font-semibold text-white hover:bg-indigo-700"><Wand2 size={12} />Usar como referência</button>
        <button type="button" onClick={() => void copyReference(post)} title="Copiar link" aria-label="Copiar link" className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-50"><Copy size={13} /></button>
        {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" title="Abrir no Instagram" aria-label="Abrir no Instagram" className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-50"><ExternalLink size={13} /></a>}
      </div>
    </div>
  </article>
}
