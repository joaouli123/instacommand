"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { SiFacebook, SiInstagram, SiThreads } from "@icons-pack/react-simple-icons"
import { getMediaDimensions, SocialPostPreview, type MediaItem, type PostType, type PreviewAccount, type PreviewThreadsAccount } from "@/components/preview/SocialPostPreview"
import { isVideoUrl } from "@/lib/media"
import { captionAsPublished } from "@/lib/caption"
import { cn } from "@/lib/utils"

export type PreviewablePost = {
  id: string
  mediaType: string
  mediaUrls?: string[]
  caption?: string | null
  hashtags?: string[]
  platforms: string[]
}

const NETWORKS: Record<string, { name: string; Icon: typeof SiInstagram }> = {
  INSTAGRAM: { name: "Instagram", Icon: SiInstagram },
  FACEBOOK: { name: "Facebook", Icon: SiFacebook },
  THREADS: { name: "Threads", Icon: SiThreads },
}

const toPostType = (mediaType: string): PostType => (mediaType === "IMAGE" ? "FEED" : (["CAROUSEL", "REEL", "STORY", "TEXT"].includes(mediaType) ? mediaType : "FEED") as PostType)

/** The same native-style preview the composer shows, for a saved post. */
export function PostPreviewPanel({ post, account, threadsAccount }: { post: PreviewablePost; account?: PreviewAccount; threadsAccount?: PreviewThreadsAccount }) {
  const platforms = post.platforms?.length ? post.platforms : ["INSTAGRAM"]
  const [platform, setPlatform] = useState(platforms[0])
  const [activeIndex, setActiveIndex] = useState(0)
  const urls = useMemo(() => post.mediaUrls || [], [post.mediaUrls])
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])

  useEffect(() => {
    setPlatform(platforms[0])
    setActiveIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  useEffect(() => {
    let active = true
    const items: MediaItem[] = urls.map((src, index) => ({ id: `${post.id}-${index}`, src, name: `Mídia ${index + 1}`, kind: isVideoUrl(src) ? "video" : "image", isObjectUrl: false }))
    setMediaItems(items)
    // Real dimensions keep the preview's proportions faithful, as in the composer.
    void Promise.all(items.map(async (item) => ({ ...item, ...(await getMediaDimensions(item.src, item.kind)) }))).then((measured) => {
      if (active) setMediaItems(measured)
    })
    return () => { active = false }
  }, [post.id, urls])

  const index = Math.min(activeIndex, Math.max(mediaItems.length - 1, 0))
  const caption = captionAsPublished(post.caption, post.hashtags)
  const many = mediaItems.length > 1

  return <div className="min-w-0">
    {platforms.length > 1 && <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Ver prévia em">
      {platforms.map((item) => {
        const network = NETWORKS[item] || { name: item, Icon: SiInstagram }
        return <button key={item} type="button" role="tab" aria-selected={platform === item} onClick={() => setPlatform(item)}
          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition", platform === item ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
          <network.Icon size={13} aria-hidden />{network.name}
        </button>
      })}
    </div>}
    <div className="flex justify-center rounded-2xl bg-slate-100/70 p-3 sm:p-4">
      <SocialPostPreview
        postType={toPostType(post.mediaType)}
        previewPlatform={platform}
        selectedAccount={account}
        threadsAccount={threadsAccount}
        media={mediaItems[index] || null}
        mediaItems={mediaItems}
        activeMediaIndex={index}
        onSelectMedia={setActiveIndex}
        caption={caption}
        hashtags={[]}
      />
    </div>
    {many && <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
      <button type="button" aria-label="Mídia anterior" disabled={index === 0} onClick={() => setActiveIndex(index - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white disabled:opacity-40"><ChevronLeft size={15} /></button>
      <span>Mídia {index + 1} de {mediaItems.length}</span>
      <button type="button" aria-label="Próxima mídia" disabled={index >= mediaItems.length - 1} onClick={() => setActiveIndex(index + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white disabled:opacity-40"><ChevronRight size={15} /></button>
    </div>}
  </div>
}
