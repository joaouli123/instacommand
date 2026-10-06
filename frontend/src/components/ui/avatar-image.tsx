"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Profile pictures from Meta are signed CDN links that expire. When one no
 * longer loads, show the fallback (usually the initial) instead of a broken image.
 */
export function AvatarImage({ src, alt = "", fallback, className = "h-full w-full object-cover" }: {
  src?: string | null
  alt?: string
  fallback: ReactNode
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  if (!src || failed) return <>{fallback}</>
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={className} />
}
