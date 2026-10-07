"use client"

import { useEffect, useState } from "react"
import { ImageOff, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { isVideoUrl } from "@/lib/media"

/**
 * Still preview of Instagram media. Meta CDN links expire after a few days and
 * older video records point at the .mp4 file, so this renders the first video
 * frame for video URLs and a clean placeholder (never a broken image) when the
 * link no longer loads.
 */
export function MediaPreview({ src, isVideo, asVideo, className, fallback = "Prévia indisponível" }: {
  src?: string | null
  isVideo?: boolean
  /** Render src as a video even when the signed URL has no .mp4 extension. */
  asVideo?: boolean
  className?: string
  fallback?: string
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setFailed(false); setLoaded(false) }, [src])

  if (!src || failed) {
    return <div className={cn("flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-[11px] text-slate-400", className)}>
      <ImageOff size={18} aria-hidden />
      <span>{fallback}</span>
    </div>
  }

  if (asVideo || isVideoUrl(src)) {
    return <div className={cn("relative h-full w-full bg-slate-900", className)}>
      {/* #t asks the browser to seek to the first frame, so the poster is not black. */}
      <video src={`${src.split("#")[0]}#t=0.1`} muted playsInline preload="metadata" aria-hidden onError={() => setFailed(true)} className="h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/55 p-2 text-white"><Play size={14} fill="currentColor" /></span></span>
    </div>
  }

  return <div className={cn("relative h-full w-full", !loaded && "animate-pulse bg-slate-200", className)}>
    <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className="h-full w-full object-cover" />
    {isVideo && <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/55 p-2 text-white"><Play size={14} fill="currentColor" /></span></span>}
  </div>
}
