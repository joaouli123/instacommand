"use client"

// Native-style previews of a post on Instagram, Facebook and Threads. Shared by
// the composer and the calendar so both show exactly what will be published.
import { useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { SiThreads, SiX } from "@icons-pack/react-simple-icons"
import twitterText from "twitter-text"
import { RiBarChartLine, RiChat1Line, RiShare2Line } from "@remixicon/react"
import { RiAccountCircleLine, RiAddLine, RiArrowLeftLine, RiBookmarkLine, RiChat3Line, RiCloseLine, RiEmotionHappyLine, RiHeartFill, RiHeartLine, RiImageLine, RiMore2Line, RiMusic2Line, RiPauseFill, RiPlayFill, RiRepeat2Line, RiSearchLine, RiSendPlaneLine, RiShareForwardLine, RiThumbUpFill, RiThumbUpLine, RiVolumeMuteLine, RiVolumeUpLine } from "@remixicon/react"
import { AvatarImage } from "@/components/ui/avatar-image"

export type PostType = "FEED" | "CAROUSEL" | "REEL" | "STORY" | "TEXT"
export type PreviewAccount = { igUsername: string; pageName?: string | null; igProfilePicUrl?: string | null }
export type PreviewThreadsAccount = { username: string }
export type PreviewXAccount = { username: string; name?: string | null; profilePicUrl?: string | null }
export type MediaItem = {
  id: string
  src: string
  name: string
  kind: "image" | "video"
  file?: File
  isObjectUrl: boolean
  width?: number
  height?: number
}

export function getMediaDimensions(src: string, kind: MediaItem["kind"]) {
  return new Promise<{ width: number; height: number } | undefined>((resolve) => {
    if (kind === "image") {
      const image = new Image()
      image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : undefined)
      image.onerror = () => resolve(undefined)
      image.src = src
      return
    }

    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => resolve(video.videoWidth && video.videoHeight ? { width: video.videoWidth, height: video.videoHeight } : undefined)
    video.onerror = () => resolve(undefined)
    video.src = src
  })
}

export type SocialPreviewProps = {
  postType: PostType
  previewPlatform: string
  selectedAccount?: PreviewAccount
  threadsAccount?: PreviewThreadsAccount
  xAccount?: PreviewXAccount
  media: MediaItem | null
  mediaItems: MediaItem[]
  activeMediaIndex: number
  onSelectMedia: (index: number) => void
  caption: string
  hashtags: string[]
  /** Instagram location chosen in the advanced options (shown under the username). */
  locationName?: string | null
}

export function PreviewMedia({ media, emptyMessage, className = "", backgroundClassName = "bg-[#eef1f4]", preserveSourceRatio = false, aspectRatioOverride, onSwipe, fill = false }: { media: MediaItem | null; emptyMessage: string; className?: string; backgroundClassName?: string; preserveSourceRatio?: boolean; aspectRatioOverride?: string; onSwipe?: (direction: -1 | 1) => void; fill?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoErrorMessage, setVideoErrorMessage] = useState("")

  useEffect(() => {
    if (media?.kind !== "video") {
      setIsPlaying(false)
      setIsMuted(true)
      setIsVideoReady(false)
      setVideoError(false)
      setVideoErrorMessage("")
      return
    }

    const video = videoRef.current
    if (!video) return

    let isCurrentVideo = true
    video.muted = true
    setIsMuted(true)
    setIsVideoReady(false)
    setVideoError(false)
    setVideoErrorMessage("")
    try {
      // Let the browser inspect the actual file instead of trusting a guessed MIME
      // type; phone MOV/MP4 files may otherwise be rejected before decode is tried.
      video.load()
      const playRequest = video.play()
      playRequest?.then(() => {
        if (isCurrentVideo) setIsPlaying(true)
      }).catch(() => {
        // Autoplay may be blocked; the visible play control remains available.
        if (isCurrentVideo) setIsPlaying(false)
      })
    } catch {
      // Autoplay may be blocked; the visible play control remains available.
      if (isCurrentVideo) setIsPlaying(false)
    }

    return () => {
      isCurrentVideo = false
      video.pause()
    }
  }, [media?.id, media?.kind, media?.src])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      setVideoError(false)
      setVideoErrorMessage("")
      try {
        await video.play()
      } catch {
        setIsPlaying(false)
      }
    } else {
      video.pause()
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    if (video) video.muted = nextMuted
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onSwipe || !event.isPrimary || (event.target instanceof Element && event.target.closest("button"))) return
    swipeStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || !onSwipe) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    onSwipe(dx < 0 ? 1 : -1)
  }

  const aspectRatio = aspectRatioOverride || (preserveSourceRatio && media?.width && media.height ? `${media.width} / ${media.height}` : undefined)
  return <div
    style={{ ...(aspectRatio ? { aspectRatio } : {}), ...(onSwipe ? { touchAction: "pan-y" } : {}) }}
    className={`group/video ${fill ? "absolute inset-0" : "relative"} overflow-hidden ${backgroundClassName} ${onSwipe ? "cursor-grab select-none active:cursor-grabbing" : ""} ${className}`}
    onPointerDown={onSwipe ? handlePointerDown : undefined}
    onPointerUp={onSwipe ? handlePointerUp : undefined}
    onPointerCancel={() => { swipeStart.current = null }}
  >
    {media ? media.kind === "video"
      ? <>
        <video
          key={media.id}
          ref={videoRef}
          autoPlay
          muted={isMuted}
          loop
          playsInline
          preload="auto"
          onLoadStart={() => { setIsVideoReady(false); setVideoError(false) }}
          onLoadedMetadata={() => setIsVideoReady(true)}
          onCanPlay={(event) => {
            setIsVideoReady(true)
            const video = event.currentTarget
            if (!video.paused) return
            video.muted = true
            void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
          }}
          onPlay={() => { setIsVideoReady(true); setIsPlaying(true) }}
          onPause={() => setIsPlaying(false)}
          onError={(event) => {
            const code = event.currentTarget.error?.code
            setIsVideoReady(false)
            setVideoError(true)
            setIsPlaying(false)
            setVideoErrorMessage(code === 4
              ? "O navegador não reconhece o formato ou codec deste vídeo. Exporte como MP4 (H.264 + AAC) e tente novamente."
              : "Não foi possível carregar este vídeo. Confira se o arquivo está íntegro e tente novamente.")
          }}
          onLoadedData={() => { setIsVideoReady(true); setVideoError(false); setVideoErrorMessage("") }}
          className="absolute inset-0 h-full w-full object-contain"
          aria-label="Prévia do vídeo"
          src={media.src}
        />
        {!isVideoReady && !videoError && <div role="status" className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 text-center text-xs font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"><span className="mx-auto mb-2 block h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" />Carregando vídeo…</div>}
        {isVideoReady && !isPlaying && !videoError && <button
          type="button"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pausar prévia do vídeo" : "Reproduzir prévia do vídeo"}
          aria-pressed={isPlaying}
          className={`absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/50 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${isPlaying ? "opacity-0 group-hover/video:opacity-100" : "opacity-100"}`}
        >
          {isPlaying ? <RiPauseFill size={24} aria-hidden="true" /> : <RiPlayFill size={24} className="ml-0.5" aria-hidden="true" />}
        </button>}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? "Ativar som do vídeo" : "Desativar som do vídeo"}
          aria-pressed={!isMuted}
          className="absolute left-3 top-[19%] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-md ring-1 ring-white/30 transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {isMuted ? <RiVolumeMuteLine size={20} aria-hidden="true" /> : <RiVolumeUpLine size={20} aria-hidden="true" />}
        </button>
        {videoError && <p role="alert" className="absolute inset-x-3 bottom-3 z-20 rounded-lg bg-black/85 px-3 py-2 text-center text-[11px] leading-4 text-white shadow-lg">{videoErrorMessage || "Não foi possível reproduzir este vídeo. Tente MP4 com vídeo H.264 e áudio AAC."}</p>}
      </>
      : <img src={media.src} alt="Prévia da publicação" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      : <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#eef1f4] px-5 text-center text-[#536171]"><RiImageLine size={27} className="text-[#7b8da3]" aria-hidden="true" /><p className="mt-3 text-sm font-medium">{emptyMessage}</p><p className="mt-1 text-xs text-[#728197]">Adicione uma mídia para ver a prévia real.</p></div>}
  </div>
}

export function PreviewAvatar({ src, name, ring = false, facebook = false, compact = false }: { src?: string | null; name: string; ring?: boolean; facebook?: boolean; compact?: boolean }) {
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9edf2] font-semibold text-[#43536a] ${compact ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"} ${ring ? compact ? "ring ring-[#c13584] ring-offset-1 ring-offset-white" : "ring-2 ring-[#c13584] ring-offset-2 ring-offset-white" : ""} ${facebook ? "bg-[#1877f2] text-white" : ""}`} aria-label={`Foto de ${name}`}>
    <AvatarImage src={src} fallback={(name.replace(/^@/, "")[0] || "?").toUpperCase()} />
  </span>
}

// Built with the constructor: the project targets an ES version without regex literal flags.
const TAG_PATTERN = new RegExp("^[#@][\\p{L}\\p{N}_]+", "u")

/** Post as it appears in the X timeline: header, text, up to 4 media in a grid and the action bar. */
function XPostPreview({ account, caption, hashtags, mediaItems, postType }: { account?: PreviewXAccount; caption: string; hashtags: string[]; mediaItems: MediaItem[]; postType: PostType }) {
  const handle = account?.username || "sua_conta"
  const name = account?.name || handle
  const text = [caption, hashtags.map((tag) => `#${tag}`).join(" ")].filter(Boolean).join("\n\n")
  const length = twitterText.parseTweet(text).weightedLength
  const items = postType === "TEXT" ? [] : mediaItems.slice(0, 4)
  // Hashtags and @mentions are blue on X.
  const rich = text.split(/(\s+)/).map((part, index) => TAG_PATTERN.test(part) ? <span key={index} className="text-[#1d9bf0]">{part}</span> : part)
  const grid = items.length === 1 ? "grid-cols-1" : "grid-cols-2"
  return <article data-preview="x-post" aria-label="Prévia de publicação no X" className="w-full max-w-[400px] border border-[#eff3f4] bg-white px-4 py-3 text-[#0f1419] font-[system-ui,-apple-system,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]">
    <div className="flex gap-3">
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#cfd9de]"><AvatarImage src={account?.profilePicUrl} fallback={(handle[0] || "X").toUpperCase()} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1 text-[15px] leading-5">
          <span className="truncate font-bold">{name}</span>
          <span className="truncate text-[#536471]">@{handle}</span>
          <span className="shrink-0 text-[#536471]">· agora</span>
          <SiX className="ml-auto h-4 w-4 shrink-0 text-[#0f1419]" title="X" />
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-5">{text ? rich : <span className="text-[#536471]">O texto do seu post aparecerá aqui.</span>}</p>
        {items.length > 0 && <div className={`mt-3 grid ${grid} gap-0.5 overflow-hidden rounded-2xl border border-[#cfd9de]`}>
          {items.map((item, index) => <div key={item.id} className={`relative bg-[#f7f9f9] ${items.length === 1 ? (postType === "REEL" ? "aspect-[9/16] max-h-[420px]" : "aspect-[4/3]") : items.length === 3 && index === 0 ? "row-span-2 aspect-auto" : "aspect-square"}`}>
            {item.kind === "video" ? <video src={item.src} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" /> : <img src={item.src} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            {item.kind === "video" && <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">Vídeo</span>}
          </div>)}
        </div>}
        <div className="mt-3 flex max-w-[360px] items-center justify-between text-[13px] text-[#536471]" aria-label="Ações do post no X">
          <span className="flex items-center gap-1"><RiChat1Line size={18} />0</span>
          <span className="flex items-center gap-1"><RiRepeat2Line size={18} />0</span>
          <span className="flex items-center gap-1"><RiHeartLine size={18} />0</span>
          <span className="flex items-center gap-1"><RiBarChartLine size={18} />0</span>
          <span className="flex items-center gap-2"><RiBookmarkLine size={18} /><RiShare2Line size={18} /></span>
        </div>
        <p className={`mt-2 text-right text-[11px] font-medium ${length > 280 ? "text-[#f4212e]" : "text-[#536471]"}`}>{length}/280 caracteres{length > 280 ? " · passa do limite do X" : ""}</p>
        {mediaItems.length > 4 && postType !== "TEXT" && <p className="mt-1 text-right text-[11px] font-medium text-[#f4212e]">O X mostra só as 4 primeiras mídias.</p>}
      </div>
    </div>
  </article>
}

export function SocialPostPreview({ postType, previewPlatform, selectedAccount, threadsAccount, xAccount, media, mediaItems, activeMediaIndex, onSelectMedia, caption, hashtags, locationName }: SocialPreviewProps) {
  if (previewPlatform === "X") return <XPostPreview account={xAccount} caption={caption} hashtags={hashtags} mediaItems={mediaItems} postType={postType} />
  const isInstagram = previewPlatform === "INSTAGRAM"
  const isFacebook = previewPlatform === "FACEBOOK"
  const username = isFacebook ? selectedAccount?.pageName || "Sua Página" : isInstagram ? selectedAccount?.igUsername || "sua_conta" : threadsAccount?.username || "sua_conta"
  const captionPlaceholder = "A legenda da publicação aparecerá aqui."
  const tagText = hashtags.map(tag => `#${tag}`).join(" ")
  const allCaption = [caption, tagText].filter(Boolean).join(" ")
  const accountPhoto = selectedAccount?.igProfilePicUrl
  const firstCarouselItem = mediaItems[0]
  const instagramCarouselRatio = isInstagram && postType === "CAROUSEL" && firstCarouselItem?.width && firstCarouselItem.height
    ? `${firstCarouselItem.width} / ${firstCarouselItem.height}`
    : undefined
  const carouselSwipe = postType === "CAROUSEL" && mediaItems.length > 1
    ? (direction: -1 | 1) => {
      const nextIndex = activeMediaIndex + direction
      if (nextIndex >= 0 && nextIndex < mediaItems.length) onSelectMedia(nextIndex)
    }
    : undefined

  if (isInstagram && postType === "STORY") {
    return <article data-preview="instagram-story" aria-label="Prévia de Instagram Story" className="relative aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-[10px] bg-[#16171b] text-white ring-1 ring-black/10 shadow-sm">
      <PreviewMedia media={media} emptyMessage="Sua mídia de Story aparecerá aqui" fill backgroundClassName="bg-[#16171b]" />
      <div className="absolute inset-x-3 top-2 flex gap-1" aria-hidden="true"><span className="h-[2px] flex-1 rounded bg-white" /><span className="h-[2px] flex-1 rounded bg-white/50" /><span className="h-[2px] flex-1 rounded bg-white/35" /></div>
      <header className="absolute inset-x-3 top-5 flex items-center gap-1.5 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
        <PreviewAvatar src={accountPhoto} name={username} ring compact />
        <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{username} <span className="font-normal text-white/75">· agora</span></p><p className="mt-0.5 truncate text-[9px] text-white/85">Story</p></div>
        <button type="button" aria-label="Mais opções" className="flex h-7 w-7 items-center justify-center"><RiMore2Line size={17} /></button><button type="button" aria-label="Fechar prévia" className="flex h-7 w-7 items-center justify-center"><RiCloseLine size={18} /></button>
      </header>
      {caption && <p className="absolute inset-x-4 bottom-[56px] line-clamp-4 whitespace-pre-wrap break-words text-center text-xs font-semibold leading-[17px] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">{caption}</p>}
      <footer className="absolute inset-x-3 bottom-2.5 flex items-center gap-1.5">
        <div className="flex h-8 min-w-0 flex-1 items-center rounded-full border border-white/80 px-2.5 text-[10px] text-white/90">Responder...</div><RiHeartLine size={19} /><RiSendPlaneLine size={18} />
      </footer>
    </article>
  }

  if (isFacebook && postType === "STORY") {
    return <article data-preview="facebook-story" aria-label="Prévia visual de Facebook Stories" className="relative isolate aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-[10px] bg-[#111217] text-white ring-1 ring-black/10 shadow-sm">
      <PreviewMedia media={media} emptyMessage="Sua mídia do Story aparecerá aqui" fill backgroundClassName="bg-[#25262a]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/65 via-black/30 to-transparent" />
      <div className="absolute inset-x-3 top-2 flex gap-1.5" aria-hidden="true">
        <span className="h-[2px] flex-1 rounded-full bg-white" /><span className="h-[2px] flex-1 rounded-full bg-white/55" /><span className="h-[2px] flex-1 rounded-full bg-white/45" /><span className="h-[2px] flex-1 rounded-full bg-white/35" />
      </div>
      <header className="absolute inset-x-3 top-4 flex items-center gap-1.5 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
        <PreviewAvatar src={accountPhoto} name={username} facebook compact />
        <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold">{username} <span className="font-normal text-white/75">· agora</span></p><p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[9px] text-white/85"><RiMusic2Line size={11} aria-hidden="true" />Áudio da publicação</p></div>
        <button type="button" aria-label="Mais opções do Story" className="flex h-7 w-7 items-center justify-center"><RiMore2Line size={17} /></button>
        <button type="button" aria-label="Fechar prévia do Story" className="flex h-7 w-7 items-center justify-center"><RiCloseLine size={18} /></button>
      </header>
      {allCaption && <p className="absolute inset-x-5 bottom-[66px] line-clamp-3 whitespace-pre-wrap break-words text-center text-[11px] font-medium leading-[15px] [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">{allCaption}</p>}
      <footer className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-1">
        <button type="button" aria-label="Enviar mensagem" className="flex h-8 min-w-0 flex-1 items-center justify-between rounded-full border border-white/25 bg-[#3a3b3c]/90 px-2.5 text-left text-[10px] text-white/90 shadow-sm"><span className="truncate">Enviar mensagem...</span><RiEmotionHappyLine size={17} className="ml-1.5 shrink-0" /></button>
        <button type="button" aria-label="Reagir com coração" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e1306c] text-white shadow-sm"><RiHeartFill size={17} /></button>
        <button type="button" aria-label="Reagir com curtir" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0866ff] text-white shadow-sm"><RiThumbUpFill size={17} /></button>
        <button type="button" aria-label="Reagir com emoção" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f7b928] text-white shadow-sm"><RiEmotionHappyLine size={17} /></button>
      </footer>
    </article>
  }

  if (isInstagram && postType === "REEL") {
    return <article data-preview="instagram-reel" aria-label="Prévia de Instagram Reel" className="relative aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-lg bg-[#101114] text-white ring-1 ring-black/10">
      <PreviewMedia media={media} emptyMessage="Sua capa do Reel aparecerá aqui" fill backgroundClassName="bg-[#202126]" />
      <header className="absolute inset-x-3 top-3 flex items-center justify-between text-white drop-shadow-sm"><button type="button" aria-label="Criar" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35"><RiAddLine size={20} /></button><div className="flex items-center gap-3 text-[11px] font-semibold"><span>Seguindo</span><span className="border-b-2 border-white pb-1">Para você</span></div><button type="button" aria-label="Curtir" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35"><RiHeartLine size={19} /></button></header>
      <nav aria-label="Ações do Reel" className="absolute right-2 top-[38%] flex flex-col items-center gap-2.5 text-white drop-shadow-sm">
        <span className="flex flex-col items-center gap-0.5"><RiHeartLine size={21} /><span className="text-[8px]">Curtir</span></span>
        <span className="flex flex-col items-center gap-0.5"><RiChat3Line size={20} /><span className="text-[8px]">Comentar</span></span>
        <span className="flex flex-col items-center gap-0.5"><RiRepeat2Line size={20} /><span className="text-[8px]">Repostar</span></span>
        <span className="flex flex-col items-center gap-0.5"><RiSendPlaneLine size={19} /><span className="text-[8px]">Enviar</span></span>
        <RiMore2Line size={18} />
      </nav>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent px-3 pb-3 pt-12 text-white">
        <div className="flex items-center gap-1.5"><PreviewAvatar src={accountPhoto} name={username} ring compact /><p className="truncate text-[10px] font-semibold">@{selectedAccount?.igUsername || "sua_conta"}</p><span className="rounded border border-white/80 px-1.5 py-0.5 text-[9px] font-semibold">Seguir</span></div>
        {locationName && <p className="mt-1 truncate text-[9px] text-white/90">{locationName}</p>}
        <p className="mt-1.5 line-clamp-2 break-words pr-8 text-[10px] leading-[14px]">{allCaption || "Sua legenda aparecerá aqui."}</p>
      </div>
    </article>
  }

  if (isFacebook && postType === "REEL") {
    return <article data-preview="facebook-reel" aria-label="Prévia de Facebook Reels" className="relative isolate aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-lg bg-[#141519] text-white ring-1 ring-black/10">
      <PreviewMedia media={media} emptyMessage="Seu vídeo do Reel aparecerá aqui" fill backgroundClassName="bg-[#202126]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 via-black/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
      <nav aria-label="Navegação do Facebook Reels" className="absolute inset-x-3 top-2 flex items-center justify-between text-white drop-shadow-sm">
        <button type="button" aria-label="Voltar" className="flex h-7 w-7 items-center justify-center"><RiArrowLeftLine size={20} /></button>
        <div className="flex items-center gap-2.5"><button type="button" aria-label="Pesquisar" className="flex h-7 w-7 items-center justify-center"><RiSearchLine size={19} /></button><button type="button" aria-label="Perfil" className="flex h-7 w-7 items-center justify-center"><RiAccountCircleLine size={19} /></button></div>
      </nav>
      <nav aria-label="Ações do Facebook Reel" className="absolute right-2 top-[39%] flex flex-col items-center gap-2.5 text-white drop-shadow-md">
        <span className="flex flex-col items-center gap-0.5"><RiThumbUpLine size={20} /><span className="text-[8px] leading-3">0</span></span>
        <span className="flex flex-col items-center gap-0.5"><RiChat3Line size={20} /><span className="text-[8px] leading-3">0</span></span>
        <span className="flex flex-col items-center gap-0.5"><RiShareForwardLine size={20} /><span className="text-[8px] leading-3">0</span></span>
        <span className="flex flex-col items-center gap-0.5"><RiBookmarkLine size={19} /><span className="text-[8px] leading-3">0</span></span>
        <RiMore2Line size={18} aria-label="Mais opções" />
      </nav>
      <div className="absolute inset-x-2.5 bottom-2 pr-8 text-white drop-shadow-sm">
        <div className="flex items-center gap-1.5"><PreviewAvatar src={accountPhoto} name={username} facebook compact /><p className="min-w-0 flex-1 truncate text-[10px] font-semibold">{username}</p><span className="shrink-0 rounded-full border border-white/80 px-2 py-0.5 text-[9px] font-semibold">Seguir</span></div>
        <p className="mt-1 flex items-center gap-1 truncate text-[9px] text-white/95"><RiMusic2Line size={11} aria-hidden="true" />Áudio original · {username}</p>
        <p className="mt-1 line-clamp-2 break-words text-[10px] leading-[14px]">{allCaption || "Sua legenda aparecerá aqui."}</p>
      </div>
    </article>
  }

  if (!isInstagram && !isFacebook) {
    return <article aria-label="Prévia de publicação no Threads" className="w-full max-w-[390px] border-y border-[#e4e6eb] bg-white px-4 py-4 text-[#101114] sm:px-5">
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5"><PreviewAvatar src={accountPhoto} name={username} /><span className="absolute -bottom-0.5 -right-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border-2 border-white bg-[#101114] text-white"><Plus size={12} strokeWidth={2.7} /></span></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><p className="truncate text-[13px] font-semibold">{username}</p><span className="shrink-0 text-xs text-[#777b83]">· agora</span><SiThreads className="ml-auto h-[19px] w-[19px] shrink-0 text-[#101114]" title="Threads" /></div>
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-[1.48] text-[#101114]">{caption || <span className="text-[#8b9098]">Seu texto aparecerá aqui, preservando as quebras de linha.</span>}</p>
          {tagText && <p className="mt-1 break-words text-[15px] leading-[1.48] text-[#101114]">{tagText}</p>}
          {media && <PreviewMedia media={media} emptyMessage="" preserveSourceRatio={postType !== "REEL" || (!isInstagram && !isFacebook)} className={`mx-auto mt-3 rounded-xl border border-[#e4e6eb] ${postType === "REEL" ? "aspect-[9/16] w-full max-w-[245px]" : "aspect-[4/5] w-full"}`} />}
          <div className="mt-5 flex items-center gap-6 text-[#34373d]" aria-label="Ações da publicação no Threads"><RiHeartLine size={22} /><RiChat3Line size={22} /><RiRepeat2Line size={22} /><RiSendPlaneLine size={21} /></div>
        </div>
      </div>
    </article>
  }

  if (isFacebook) {
    return <article data-preview={postType === "CAROUSEL" ? "facebook-carousel" : "facebook-feed"} aria-label={postType === "CAROUSEL" ? "Prévia de álbum do Facebook" : "Prévia de publicação no Facebook"} className="w-full max-w-[390px] overflow-hidden rounded-[10px] border border-[#e4e6eb] bg-white text-[#1c1e21] shadow-sm">
      <header className="flex items-center gap-2.5 px-3 py-3"><PreviewAvatar src={accountPhoto} name={username} facebook /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{username}</p><p className="text-[11px] text-[#65676b]">Agora · <span aria-label="Público">Público</span></p></div><RiMore2Line size={21} className="text-[#65676b]" /></header>
      {allCaption && <p className="whitespace-pre-wrap break-words px-3 pb-3 text-[13px] leading-5">{allCaption}</p>}
      <div className="relative">
        <PreviewMedia media={media} emptyMessage="Sua foto ou vídeo aparecerá aqui" preserveSourceRatio={postType !== "REEL"} onSwipe={carouselSwipe} className={`border-y border-[#e4e6eb] ${postType === "REEL" ? "mx-auto aspect-[9/16] w-full max-w-[245px]" : "aspect-[4/5]"}`} />
        {postType === "CAROUSEL" && mediaItems.length > 1 && <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">{activeMediaIndex + 1}/{mediaItems.length}</span>}
      </div>
      {postType === "CAROUSEL" && mediaItems.length > 1 && <nav aria-label="Itens do álbum do Facebook" className="flex items-center justify-center gap-0.5 py-1">
        {mediaItems.map((item, index) => <button key={item.id} type="button" aria-label={`Pré-visualizar foto ${index + 1} de ${mediaItems.length}`} aria-pressed={index === activeMediaIndex} onClick={() => onSelectMedia(index)} className="flex h-7 w-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0866ff]" data-testid="facebook-album-item"><span className={`h-1.5 w-1.5 rounded-full ${index === activeMediaIndex ? "bg-[#0866ff]" : "bg-[#bec3c9]"}`} /></button>)}
      </nav>}
      <div className="flex items-center justify-around px-2 py-2.5 text-[12px] font-semibold text-[#65676b]"><span className="flex items-center gap-1.5"><RiHeartLine size={18} />Curtir</span><span className="flex items-center gap-1.5"><RiChat3Line size={18} />Comentar</span><span className="flex items-center gap-1.5"><RiShareForwardLine size={18} />Compartilhar</span></div>
    </article>
  }

  return <article data-preview={postType === "CAROUSEL" ? "instagram-carousel" : "instagram-feed"} aria-label={postType === "CAROUSEL" ? "Prévia de carrossel do Instagram" : "Prévia de publicação do Instagram"} className="w-full max-w-[390px] overflow-hidden rounded-[10px] border border-[#dbdbdb] bg-white text-[#0f1419] shadow-sm">
    <header className="flex items-center gap-2.5 px-3 py-3">
      <PreviewAvatar src={accountPhoto} name={username} ring />
      <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{username}</p>{locationName && <p className="truncate text-[11px] leading-4 text-[#737373]">{locationName}</p>}</div>
      <RiMore2Line size={22} className="text-[#262626]" />
    </header>
    <div className="relative">
      <PreviewMedia media={media} emptyMessage="Sua arte aparecerá aqui" preserveSourceRatio={!instagramCarouselRatio} aspectRatioOverride={instagramCarouselRatio} onSwipe={carouselSwipe} className="aspect-[3/4]" />
      {postType === "CAROUSEL" && mediaItems.length > 1 && <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">{activeMediaIndex + 1}/{mediaItems.length}</span>}
    </div>
    {postType === "CAROUSEL" && mediaItems.length > 1 && <nav aria-label="Itens do carrossel" className="flex items-center justify-center gap-0.5 py-1">{mediaItems.map((item, index) => <button key={item.id} type="button" aria-label={`Pré-visualizar item ${index + 1} de ${mediaItems.length}`} aria-pressed={index === activeMediaIndex} onClick={() => onSelectMedia(index)} className="flex h-7 w-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0095f6]"><span className={`h-1.5 w-1.5 rounded-full ${index === activeMediaIndex ? "bg-[#0095f6]" : "bg-[#c7c7c7]"}`} /></button>)}</nav>}
    <div className="px-3 pb-3 pt-2">
      <div className="flex items-center justify-between"><div className="flex items-center gap-4 text-[#262626]"><RiHeartLine size={25} /><RiChat3Line size={24} /><RiSendPlaneLine size={23} /></div><RiBookmarkLine size={23} className="text-[#262626]" /></div>
      {allCaption ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-[17px]"><span className="font-semibold">{username}</span>{" "}{allCaption}</p> : <p className="mt-2 text-[12px] leading-[17px]"><span className="font-semibold">{username}</span>{" "}<span className="text-[#737373]">{captionPlaceholder}</span></p>}
    </div>
  </article>
}
