"use client"
import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ImagePlus, Hash, Calendar as CalendarIcon, Send, 
  Heart, MessageCircle, Bookmark, Share2, MoreHorizontal,
  Layers, Video, Image as ImageIcon, Sparkles, Crop, Ruler, FileImage, HardDrive,
  Copy, Timer, BadgeCheck, Scaling,
  Check, CheckCircle2, XCircle, ChevronDown, ChevronLeft, ChevronRight, Mic, Plus, Eye, PencilLine, PlusCircle, Search
} from "lucide-react"
import { SiInstagram, SiFacebook, SiThreads } from "@icons-pack/react-simple-icons"
import { RiAccountCircleLine, RiAddBoxLine, RiAddLine, RiArrowLeftLine, RiBatteryLine, RiBookmarkLine, RiChat3Line, RiCloseLine, RiEmotionHappyLine, RiFileGifLine, RiHeartFill, RiHeartLine, RiHome5Fill, RiImageLine, RiMore2Line, RiMusic2Line, RiMovieLine, RiPauseFill, RiPlayFill, RiRepeat2Line, RiSearchLine, RiSendPlaneLine, RiShareForwardLine, RiSignalWifiLine, RiThumbUpFill, RiThumbUpLine, RiUser3Line, RiVolumeMuteLine, RiVolumeUpLine, RiWifiLine } from "@remixicon/react"
import { useDropzone } from "react-dropzone"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { BACKEND_ORIGIN } from "@/lib/config"
import { DailyContentPlan } from "@/components/dashboard/DailyContentPlan"
import { ArtworkStudio } from "@/components/dashboard/ArtworkStudio"
import { selectAccount } from "@/lib/active-account-store"

type PostType = "FEED" | "CAROUSEL" | "REEL" | "STORY" | "TEXT"

const formatPlatforms: Record<PostType, string[]> = {
  FEED: ["INSTAGRAM", "FACEBOOK", "THREADS"],
  CAROUSEL: ["INSTAGRAM", "FACEBOOK", "THREADS"],
  REEL: ["INSTAGRAM", "FACEBOOK", "THREADS"],
  STORY: ["INSTAGRAM"],
  TEXT: ["THREADS"],
}

type PlatformFormatDetail = {
  name: string
  shape: string
  dimensions: string
  note: string
  acceptedRatio?: { min: number; max: number; tolerance?: number }
}

const networkFormatDetails: Record<string, Partial<Record<PostType, PlatformFormatDetail>>> = {
  INSTAGRAM: {
    FEED: { name: "Foto no feed", shape: "App 1,91:1–3:4 · API conservadora 1,91:1–4:5", dimensions: "4:5 · 1080 × 1350 px (API) · 3:4 · 1080 × 1440 px (app)", note: "O app Instagram também aceita 3:4. Como a validação da API pode divergir, 4:5 é a opção conservadora para autopublicar; a prévia mostra o ratio original." },
    CAROUSEL: { name: "Carrossel do feed", shape: "App 1,91:1–3:4 · API conservadora 1,91:1–4:5", dimensions: "4:5 · 1080 × 1350 px (API) · 3:4 · 1080 × 1440 px (app)", note: "O app Instagram aceita 3:4 em carrosséis; a API pode validar diferente. Use um ratio uniforme e 4:5 para a opção conservadora; confira cada item." },
    REEL: { name: "Reel", shape: "9:16 recomendado", dimensions: "1080 × 1920 px · 9:16", note: "API aceita outras proporções; 9:16 evita áreas vazias ou cortes. 3 s–15 min; este app limita o arquivo a 100 MB." },
    STORY: { name: "Story", shape: "9:16 recomendado", dimensions: "1080 × 1920 px · 9:16", note: "Vídeo de 3 a 60 s; publicação via API para conta Instagram Business. Upload deste app: até 100 MB." },
  },
  FACEBOOK: {
    FEED: { name: "Foto da Página", shape: "Proporção original · sem ratio único", dimensions: "4:5 · 1080 × 1350 px (referência)", note: "A API de publicação da Página não fixa um único canvas; o enquadramento pode variar por dispositivo e posicionamento." },
    CAROUSEL: { name: "Álbum de fotos da Página", shape: "Proporção original de cada foto", dimensions: "2 a 10 fotos · 1080 px de largura (referência)", note: "Este formato publica várias fotos anexadas à publicação, não o anúncio de carrossel. A prévia preserva o ratio do item selecionado." },
    REEL: { name: "Reel do Facebook", shape: "9:16 obrigatório", dimensions: "Mínimo 540 × 960 px · recomendado 1080 × 1920 px", note: "Vídeo de 4 a 60 s e pelo menos 23 fps. O limite de upload deste app é 100 MB.", acceptedRatio: { min: 9 / 16, max: 9 / 16, tolerance: 0.001 } },
  },
  THREADS: {
    FEED: { name: "Post com imagem", shape: "Proporção original", dimensions: "Sem dimensão fixa publicada pela API", note: "O texto acompanha a imagem; a prévia mantém as dimensões originais do arquivo." },
    CAROUSEL: { name: "Carrossel", shape: "Proporção original por item", dimensions: "2 a 10 mídias neste app", note: "Pode combinar imagens e vídeos. Threads publica um carrossel, não um Reel; confira cada item na prévia." },
    REEL: { name: "Post com vídeo", shape: "Proporção original · sem ratio fixo", dimensions: "Até 5 min · upload deste app até 100 MB", note: "É um post de vídeo no Threads (não Reel). A API não define um canvas vertical obrigatório." },
    TEXT: { name: "Post de texto", shape: "Somente texto", dimensions: "Até 500 caracteres", note: "Formato exclusivo do Threads; sem mídia anexada." },
  },
}

const platformNames: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads" }

type MediaItem = {
  id: string
  src: string
  name: string
  kind: "image" | "video"
  file?: File
  isObjectUrl: boolean
  width?: number
  height?: number
}

function getMediaDimensions(src: string, kind: MediaItem["kind"]) {
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

function formatAspectRatio(width: number, height: number) {
  const ratio = width / height
  const commonRatios: Array<[number, string]> = [
    [1, "1:1"], [3 / 4, "3:4"], [4 / 5, "4:5"], [9 / 16, "9:16"],
    [16 / 9, "16:9"], [1.91, "1,91:1"],
  ]
  const common = commonRatios.find(([value]) => Math.abs(value - ratio) < 0.015)
  return common?.[1] ?? `${ratio.toFixed(2).replace(".", ",")}:1`
}

type ConnectedAccount = { id: string; igUsername: string; pageName?: string | null; igProfilePicUrl?: string | null; isActive: boolean }
type ThreadsAccount = { id: string; username: string; name?: string | null; isActive: boolean }
type AiPlanItem = { day: string; format: string; topic: string; hook: string; cta: string; suggestedTime: string }
type HashtagMedia = { id: string; caption?: string }
type HashtagLookup = { igHashtagId: string; topMediaCount: number; recentMediaCount: number; topMedia: HashtagMedia[]; recentMedia: HashtagMedia[] }
type PublishOutcome = { succeeded: string[]; failed: Array<{ platform: string; message: string }> }

const normalizeHashtag = (value: string) => value.replace(/^#+/, "").trim()
const isVideoFile = (file: Pick<File, "type" | "name">) => file.type.toLowerCase().startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(file.name)
const isVideoUrl = (src: string) => /\.(mp4|m4v|mov|webm|ogv|ogg)(?:[?#].*)?$/i.test(src)
type SocialPreviewProps = {
  postType: PostType
  previewPlatform: string
  selectedAccount?: ConnectedAccount
  threadsAccount?: ThreadsAccount
  media: MediaItem | null
  mediaItems: MediaItem[]
  activeMediaIndex: number
  onSelectMedia: (index: number) => void
  caption: string
  hashtags: string[]
}

function PreviewMedia({ media, emptyMessage, className = "", preserveSourceRatio = false, aspectRatioOverride, onSwipe }: { media: MediaItem | null; emptyMessage: string; className?: string; preserveSourceRatio?: boolean; aspectRatioOverride?: string; onSwipe?: (direction: -1 | 1) => void }) {
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
    className={`group/video relative overflow-hidden bg-[#eef1f4] ${onSwipe ? "cursor-grab select-none active:cursor-grabbing" : ""} ${className}`}
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
          className="absolute inset-0 h-full w-full object-cover"
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

function PreviewAvatar({ src, name, ring = false, facebook = false, compact = false }: { src?: string | null; name: string; ring?: boolean; facebook?: boolean; compact?: boolean }) {
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9edf2] font-semibold text-[#43536a] ${compact ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"} ${ring ? compact ? "ring ring-[#c13584] ring-offset-1 ring-offset-white" : "ring-2 ring-[#c13584] ring-offset-2 ring-offset-white" : ""} ${facebook ? "bg-[#1877f2] text-white" : ""}`} aria-label={`Foto de ${name}`}>
    {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (name.replace(/^@/, "")[0] || "?").toUpperCase()}
  </span>
}

function ComposerSocialPreview({ postType, previewPlatform, selectedAccount, threadsAccount, media, mediaItems, activeMediaIndex, onSelectMedia, caption, hashtags }: SocialPreviewProps) {
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
      <PreviewMedia media={media} emptyMessage="Sua mídia de Story aparecerá aqui" className="absolute inset-0" />
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
      <PreviewMedia media={media} emptyMessage="Sua mídia do Story aparecerá aqui" className="absolute inset-0 bg-[#25262a]" />
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
      <PreviewMedia media={media} emptyMessage="Sua capa do Reel aparecerá aqui" className="absolute inset-0 bg-[#202126]" />
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
        <p className="mt-1.5 line-clamp-2 break-words pr-8 text-[10px] leading-[14px]">{allCaption || "Sua legenda aparecerá aqui."}</p>
      </div>
    </article>
  }

  if (isFacebook && postType === "REEL") {
    return <article data-preview="facebook-reel" aria-label="Prévia de Facebook Reels" className="relative isolate aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-lg bg-[#141519] text-white ring-1 ring-black/10">
      <PreviewMedia media={media} emptyMessage="Seu vídeo do Reel aparecerá aqui" className="absolute inset-0 bg-[#202126]" />
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
      {allCaption && <p className="px-3 pb-3 text-[13px] leading-5">{allCaption}</p>}
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
      <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{username}</p><p className="truncate text-[11px] leading-4 text-[#737373]">São Paulo, Brasil</p></div>
      <RiMore2Line size={22} className="text-[#262626]" />
    </header>
    <div className="relative">
      <PreviewMedia media={media} emptyMessage="Sua arte aparecerá aqui" preserveSourceRatio={!instagramCarouselRatio} aspectRatioOverride={instagramCarouselRatio} onSwipe={carouselSwipe} className="aspect-[3/4]" />
      {postType === "CAROUSEL" && mediaItems.length > 1 && <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">{activeMediaIndex + 1}/{mediaItems.length}</span>}
    </div>
    {postType === "CAROUSEL" && mediaItems.length > 1 && <nav aria-label="Itens do carrossel" className="flex items-center justify-center gap-0.5 py-1">{mediaItems.map((item, index) => <button key={item.id} type="button" aria-label={`Pré-visualizar item ${index + 1} de ${mediaItems.length}`} aria-pressed={index === activeMediaIndex} onClick={() => onSelectMedia(index)} className="flex h-7 w-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0095f6]"><span className={`h-1.5 w-1.5 rounded-full ${index === activeMediaIndex ? "bg-[#0095f6]" : "bg-[#c7c7c7]"}`} /></button>)}</nav>}
    <div className="px-3 pb-3 pt-2">
      <div className="flex items-center justify-between"><div className="flex items-center gap-4 text-[#262626]"><RiHeartLine size={25} /><RiChat3Line size={24} /><RiSendPlaneLine size={23} /></div><RiBookmarkLine size={23} className="text-[#262626]" /></div>
      {allCaption ? <p className="mt-2 line-clamp-3 break-words text-[12px] leading-[17px]"><span className="font-semibold">{username}</span>{" "}{allCaption}</p> : <p className="mt-2 text-[12px] leading-[17px]"><span className="font-semibold">{username}</span>{" "}<span className="text-[#737373]">{captionPlaceholder}</span></p>}
    </div>
  </article>
}

const getDefaultDate = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  // datetime-local expects wall-clock values, not UTC. Using toISOString()
  // here shifted the default by three hours for the Brazil deployment.
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function ComposerPage() {
  const [caption, setCaption] = useState("")
  const [draftId, setDraftId] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [editorialBrief, setEditorialBrief] = useState<{ creativeBrief?: string; storyIdea?: string; reason?: string } | null>(null)
  const [postType, setPostType] = useState<PostType>("FEED")
  const [selectedDate, setSelectedDate] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [hashtagLookup, setHashtagLookup] = useState<HashtagLookup | null>(null)
  const [hashtagLookupTerm, setHashtagLookupTerm] = useState("")
  const [hashtagSearching, setHashtagSearching] = useState(false)
  const [showAllTagSuggestions, setShowAllTagSuggestions] = useState(false)
  const [publishOutcome, setPublishOutcome] = useState<PublishOutcome | null>(null)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [threadsAccounts, setThreadsAccounts] = useState<ThreadsAccount[]>([])
  const [accountId, setAccountId] = useState("")
  const [threadsAccountId, setThreadsAccountId] = useState("")
  const [platforms, setPlatforms] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [aiTopic, setAiTopic] = useState("")
  const [aiAudience, setAiAudience] = useState("")
  const [aiTone, setAiTone] = useState("Profissional e próximo")
  const [aiObjective, setAiObjective] = useState("Atrair e gerar conversa")
  const [aiWorkflow, setAiWorkflow] = useState<"caption" | "daily" | "week">("caption")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPlan, setAiPlan] = useState<AiPlanItem[]>([])
  const [step, setStep] = useState(1)
  const [previewPlatform, setPreviewPlatform] = useState("INSTAGRAM")
  const [creationMode, setCreationMode] = useState<"manual" | "ai" | null>("manual")
  const mediaItemsRef = useRef<MediaItem[]>([])
  const hashtagLookupCache = useRef<Record<string, HashtagLookup>>({})

  useEffect(() => {
    setSelectedDate(getDefaultDate())
    const requestedDraft = new URLSearchParams(window.location.search).get('draft')
    setDraftLoading(!!requestedDraft)
    Promise.all([api.getAccounts(), api.getThreadsAccounts(), requestedDraft ? api.getPost(requestedDraft) : Promise.resolve(null)])
      .then(([instagramAccounts, threadAccounts, draft]) => {
        const nextAccounts = (instagramAccounts as ConnectedAccount[]).filter((account) => account.isActive)
        const nextThreads = (threadAccounts as ThreadsAccount[]).filter((account) => account.isActive)
        setAccounts(nextAccounts)
        setThreadsAccounts(nextThreads)
        if (!requestedDraft) setPlatforms(nextAccounts.length ? ["INSTAGRAM"] : [])
        const storedAccountId = window.localStorage.getItem("instacommand_active_account")
        if (nextAccounts.length) setAccountId(nextAccounts.find((account) => account.id === storedAccountId)?.id || nextAccounts[0].id)
        if (nextThreads[0]) setThreadsAccountId(nextThreads[0].id)
        if (draft) {
          if (!['DRAFT', 'FAILED'].includes(draft.status)) throw new Error('Cancele o agendamento antes de editar. Publicações concluídas não podem ser editadas aqui.')
          if (!nextAccounts.some(a => a.id === draft.accountId)) throw new Error('A conta deste rascunho não está ativa.')
          setDraftId(draft.id); setAccountId(draft.accountId); selectAccount(draft.accountId)
          setCaption(draft.caption || ''); setHashtags(draft.hashtags || []); setPlatforms(draft.platforms || ['INSTAGRAM'])
          setThreadsAccountId(draft.threadsAccountId || ''); setPostType(draft.mediaType === 'IMAGE' ? 'FEED' : draft.mediaType)
          setEditorialBrief(draft.editorialBrief || null)
          const date = new Date(draft.scheduledFor); const pad = (v: number) => String(v).padStart(2, '0')
          setSelectedDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`)
          setMediaItems((draft.mediaUrls || []).map((src: string, i: number) => ({ id: `saved-${i}`, src, name: `Mídia ${i + 1}`, kind: isVideoUrl(src) ? 'video' : 'image', isObjectUrl: false })))
        }
      })
      .catch((error) => {
        if (requestedDraft) setDraftError(error instanceof Error ? error.message : 'Não foi possível abrir o rascunho.')
        toast.error(error instanceof Error ? error.message : "Entre na plataforma e conecte uma conta antes de criar uma publicação.")
      })
      .finally(() => setDraftLoading(false))
  }, [])

  useEffect(() => {
    const syncSelectedAccount = () => {
      if (draftId) return
      const nextId = window.localStorage.getItem("instacommand_active_account")
      if (nextId && accounts.some((account) => account.id === nextId)) setAccountId(nextId)
    }
    window.addEventListener("instacommand-account-changed", syncSelectedAccount)
    return () => window.removeEventListener("instacommand-account-changed", syncSelectedAccount)
  }, [accounts, draftId])

  useEffect(() => {
    mediaItemsRef.current = mediaItems
  }, [mediaItems])

  useEffect(() => {
    const unmeasured = mediaItems.filter(item => !item.width || !item.height)
    if (!unmeasured.length) return

    let isCurrent = true
    Promise.all(unmeasured.map(async item => ({ item, dimensions: await getMediaDimensions(item.src, item.kind) })))
      .then(results => {
        if (!isCurrent || !results.some(result => result.dimensions)) return
        setMediaItems(current => current.map(item => {
          const result = results.find(entry => entry.item.id === item.id && entry.item.src === item.src)
          return !item.width && !item.height && result?.dimensions ? { ...item, ...result.dimensions } : item
        }))
      })

    return () => { isCurrent = false }
  }, [mediaItems])

  useEffect(() => {
    return () => {
      mediaItemsRef.current.forEach(item => {
        if (item.isObjectUrl) URL.revokeObjectURL(item.src)
      })
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [], "video/*": [] },
    multiple: true,
    maxFiles: 10,
    maxSize: 100 * 1024 * 1024,
    onDrop: async (acceptedFiles, fileRejections) => {
      if (postType === "TEXT") return
      if (fileRejections.length > 0) {
        toast.error("Alguns arquivos foram rejeitados. Use imagens ou vídeos de até 100MB.")
      }

      if (acceptedFiles.length === 0) return

      const incomingItems = await Promise.all(acceptedFiles.map(async (file, index): Promise<MediaItem> => {
        const src = URL.createObjectURL(file)
        const kind = isVideoFile(file) ? "video" : "image"
        const dimensions = await getMediaDimensions(src, kind)
        return {
          id: `${file.name}-${file.lastModified}-${index}`,
          src,
          name: file.name,
          kind,
          file,
          isObjectUrl: true,
          ...dimensions,
        }
      }))

      if (postType === "CAROUSEL") {
        const availableSlots = Math.max(0, 10 - mediaItems.length)
        const itemsToAdd = incomingItems.slice(0, availableSlots)
        incomingItems.slice(availableSlots).forEach(item => URL.revokeObjectURL(item.src))

        if (itemsToAdd.length === 0) {
          toast.error("O carrossel já está completo. Remova uma mídia para adicionar outra.")
          return
        }

        setMediaItems(current => [...current, ...itemsToAdd])
        toast.success(`${itemsToAdd.length} ${itemsToAdd.length === 1 ? "mídia adicionada" : "mídias adicionadas"} ao carrossel`)
        return
      }

      const nextItem = incomingItems[0]
      incomingItems.slice(1).forEach(item => URL.revokeObjectURL(item.src))
      mediaItems.forEach(item => {
        if (item.isObjectUrl) URL.revokeObjectURL(item.src)
      })
      setMediaItems([nextItem])
      setActiveMediaIndex(0)
      toast.success(`Mídia carregada: ${nextItem.name}`)
    },
  })

  const activeMedia = mediaItems[activeMediaIndex] ?? null
  const selectedAccount = accounts.find((account) => account.id === accountId)
  const resolvedPreviewPlatform = postType === "TEXT" ? "THREADS" : previewPlatform
  const previewDescription = {
    FEED: "Prévia da publicação única no feed, sem faixa de Stories.",
    CAROUSEL: "Prévia do carrossel no feed, com navegação entre os itens.",
    REEL: resolvedPreviewPlatform === "INSTAGRAM" ? "Prévia vertical da experiência de Reels." : `Prévia do vídeo em ${platformNames[resolvedPreviewPlatform] || resolvedPreviewPlatform}.`,
    STORY: resolvedPreviewPlatform === "FACEBOOK" ? "Prévia visual da interface de Facebook Stories." : "Prévia vertical de Story em tela cheia.",
    TEXT: "Prévia clara do post de texto no Threads.",
  }[postType]
  const connectedPlatforms = [
    ...(selectedAccount ? ["INSTAGRAM"] : []),
    ...(selectedAccount?.pageName ? ["FACEBOOK"] : []),
    ...(threadsAccounts.length ? ["THREADS"] : []),
  ]
  const compatiblePlatformsFor = (format: PostType) => {
    const connected = connectedPlatforms.filter((platform) => formatPlatforms[format].includes(platform))
    const selected = platforms.filter((platform) => connected.includes(platform))
    return selected.length ? selected : connected
  }

  const changePostType = (nextType: PostType) => {
    if (postType === nextType) return

    const nextPlatforms = compatiblePlatformsFor(nextType)
    if (!nextPlatforms.length) {
      setStep(1)
      toast.error(nextType === "TEXT"
        ? "Conecte uma conta do Threads para usar publicação somente de texto."
        : nextType === "STORY"
          ? "Conecte uma conta profissional do Instagram para publicar Stories."
          : "Conecte uma conta compatível com este formato.")
      return
    }

    const destinationsChanged = nextPlatforms.length !== platforms.length || nextPlatforms.some((platform, index) => platform !== platforms[index])
    if (destinationsChanged) setPlatforms(nextPlatforms)
    setPostType(nextType)
    if (nextType === "TEXT") {
      setThreadsAccountId(current => current || threadsAccounts[0]?.id || "")
      setPreviewPlatform("THREADS")
    } else if (!nextPlatforms.includes(previewPlatform)) setPreviewPlatform(nextPlatforms[0])

    if (nextType === "TEXT" || nextType === "STORY" || nextType === "REEL" || nextType === "FEED") {
      mediaItems.forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
      setMediaItems([])
      setActiveMediaIndex(0)
    } else if (mediaItems.length > 10) {
      mediaItems.slice(10).forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
      setMediaItems(mediaItems.slice(0, 10))
      setActiveMediaIndex(0)
    }

    if (destinationsChanged) {
      const removed = platforms.filter((platform) => !nextPlatforms.includes(platform))
      toast.success(removed.length
        ? `${nextType === "STORY" ? "Story" : nextType === "TEXT" ? "Post de texto" : "Formato"} ajustado para ${nextPlatforms.map((platform) => platformNames[platform] || platform).join(" e ")}; destinos incompatíveis removidos.`
        : `Destino ajustado para ${nextPlatforms.map((platform) => platformNames[platform] || platform).join(" e ")}.`)
    }
  }

  const removeMedia = (id: string) => {
    const itemToRemove = mediaItems.find(item => item.id === id)
    if (itemToRemove?.isObjectUrl) URL.revokeObjectURL(itemToRemove.src)

    const nextItems = mediaItems.filter(item => item.id !== id)
    setMediaItems(nextItems)
    setActiveMediaIndex(current => Math.min(current, Math.max(0, nextItems.length - 1)))
  }

  const moveActiveMedia = (direction: -1 | 1) => {
    const targetIndex = activeMediaIndex + direction
    if (targetIndex < 0 || targetIndex >= mediaItems.length) return

    const nextItems = [...mediaItems]
    ;[nextItems[activeMediaIndex], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[activeMediaIndex]]
    setMediaItems(nextItems)
    setActiveMediaIndex(targetIndex)
  }

  const addHashtag = () => {
    const clean = normalizeHashtag(tagInput)
    if (!clean) return
    if (!/^[\w\u00c0-\u024f]+$/i.test(clean)) {
      toast.error("Use uma hashtag por vez, sem espaços ou pontuação.")
      return
    }
    if (hashtags.some(tag => tag.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
      setTagInput("")
      return
    }
    setHashtags(current => [...current, clean])
    setTagInput("")
  }

  const removeHashtag = (tag: string) => {
    setHashtags(current => current.filter(t => t !== tag))
  }

  const lookupHashtag = async () => {
    const clean = normalizeHashtag(tagInput)
    if (!accountId) { toast.error("Conecte e selecione uma conta do Instagram para buscar hashtags."); return }
    if (!clean || !/^[\w\u00c0-\u024f]+$/i.test(clean)) { toast.error("Digite uma hashtag válida, sem espaços ou pontuação."); return }
    setHashtagSearching(true)
    setHashtagLookup(null)
    setHashtagLookupTerm(clean)
    const cacheKey = `${accountId}:${clean.toLocaleLowerCase()}`
    if (hashtagLookupCache.current[cacheKey]) {
      setHashtagLookup(hashtagLookupCache.current[cacheKey])
      setHashtagSearching(false)
      return
    }
    try {
      const result = await api.searchHashtag(accountId, clean) as HashtagLookup
      hashtagLookupCache.current[cacheKey] = result
      setHashtagLookup(result)
    } catch (error) {
      setHashtagLookupTerm("")
      toast.error(error instanceof Error ? error.message : "Não foi possível buscar essa hashtag no Instagram.")
    } finally {
      setHashtagSearching(false)
    }
  }

  const relatedHashtagSuggestions = (() => {
    if (!hashtagLookup) return [] as Array<{ tag: string; count: number }>
    const posts: Record<string, string[]> = Object.create(null)
    const media = [...(hashtagLookup.topMedia || []), ...(hashtagLookup.recentMedia || [])]
    for (const item of media) {
      const uniqueTags = (item.caption?.match(/#[\w\u00c0-\u024f]+/gi) || []).map(tag => normalizeHashtag(tag).toLocaleLowerCase())
      for (const tag of uniqueTags) {
        if (!tag || tag.toLocaleLowerCase() === hashtagLookupTerm.toLocaleLowerCase()) continue
        const items = posts[tag] || (posts[tag] = [])
        if (items.indexOf(item.id) === -1) items.push(item.id)
      }
    }
    return Object.keys(posts).map(tag => ({ tag, count: posts[tag].length })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  })()

  const addSuggestedHashtag = (tag: string) => {
    if (hashtags.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) return
    setHashtags(current => [...current, tag])
  }

  const speakCaption = () => {
    if (!caption.trim()) { toast.error("Escreva uma legenda antes de ouvir a prévia."); return }
    if (!("speechSynthesis" in window)) { toast.error("Seu navegador não oferece leitura de texto."); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(caption)
    utterance.lang = "pt-BR"
    window.speechSynthesis.speak(utterance)
  }

  const improveCaption = async () => {
    if (!caption.trim()) { toast.error("Escreva um texto antes de pedir uma melhoria."); return }
    setAiTopic(caption)
    setAiLoading(true)
    try {
      const response = await api.generateAi({ mode: "caption", accountId: accountId || undefined, topic: caption, audience: aiAudience || undefined, tone: aiTone, objective: aiObjective, mediaType: postType, platforms }) as { result?: { caption?: string; hashtags?: string[] } }
      if (response.result?.caption) setCaption(response.result.caption)
      if (response.result?.hashtags) setHashtags(response.result.hashtags.map(tag => tag.replace(/^#/, "")).filter(Boolean).slice(0, 8))
      toast.success("Texto revisado. Confira antes de publicar.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível melhorar o texto.") }
    finally { setAiLoading(false) }
  }

  const togglePlatform = (platform: string) => {
    const nextPlatforms = platforms.includes(platform)
      ? platforms.filter((item) => item !== platform)
      : [...platforms, platform]
    if (postType === "TEXT" && (nextPlatforms.length !== 1 || nextPlatforms[0] !== "THREADS")) {
      setPostType("FEED")
      setMediaItems([])
      toast("Formato ajustado para foto única, compatível com as redes escolhidas.")
    }
    setPlatforms(nextPlatforms)
    if (!nextPlatforms.includes(previewPlatform)) setPreviewPlatform(nextPlatforms[0] || "INSTAGRAM")
  }

  const generateWithAi = async (mode: "caption" | "plan") => {
    if (!aiTopic.trim()) {
      toast.error("Diga para a IA qual é o assunto do conteúdo.")
      return
    }

    setAiLoading(true)
    try {
      const response = await api.generateAi({
        mode,
        accountId: accountId || undefined,
        topic: aiTopic.trim() || undefined,
        audience: aiAudience.trim() || undefined,
        tone: aiTone,
        objective: aiObjective,
        mediaType: postType,
        platforms,
      }) as { result?: { caption?: string; hashtags?: string[]; plan?: AiPlanItem[] } }

      const result = response.result || {}
      if (mode === "caption") {
        if (result.caption) setCaption(result.caption)
        if (Array.isArray(result.hashtags)) setHashtags(result.hashtags.map((tag) => tag.replace(/^#/, "")).filter(Boolean).slice(0, 8))
        toast.success("Legenda, CTA e hashtags gerados pela IA.")
      } else {
        setAiPlan(Array.isArray(result.plan) ? result.plan : [])
        toast.success("Plano editorial de 7 dias gerado.")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível usar o assistente de IA.")
    } finally {
      setAiLoading(false)
    }
  }

  const submitPost = async (mode: "publish" | "schedule") => {
    const textOnlyThreads = postType === "TEXT" && platforms.length === 1 && platforms[0] === "THREADS"
    if (postType === "TEXT" && !textOnlyThreads) {
      toast.error("Post de texto sem mídia só pode ser publicado no Threads.")
      return
    }
    if (mediaItems.length === 0 && !textOnlyThreads) {
      toast.error(`Adicione pelo menos uma imagem ou vídeo antes de ${mode === "publish" ? "publicar" : "agendar"}.`)
      return
    }
    if (textOnlyThreads && !caption.trim()) {
      toast.error("Escreva um texto antes de publicar somente no Threads.")
      return
    }
    if (!accountId) {
      toast.error("Conecte uma conta do Instagram antes de continuar.")
      return
    }
    if (!platforms.length) {
      toast.error("Selecione pelo menos uma plataforma de publicação.")
      return
    }
    if (platforms.includes("THREADS") && !threadsAccountId) {
      toast.error("Conecte uma conta do Threads ou remova o Threads da seleção.")
      return
    }
    if (postType === "CAROUSEL" && mediaItems.length < 2) {
      toast.error("Um carrossel precisa ter pelo menos duas mídias.")
      return
    }
    if (postType === "FEED" && mediaItems.some((item) => item.kind !== "image")) {
      toast.error("Foto única aceita apenas uma imagem. Para vídeos, escolha o formato de vídeo/Reel.")
      return
    }
    if (textOnlyThreads && caption.length > 500) {
      toast.error("O texto do Threads tem limite de 500 caracteres.")
      return
    }
    if (postType === "REEL" && mediaItems.some((item) => item.kind !== "video")) {
      toast.error("Reels precisam usar um vídeo.")
      return
    }
    if (postType === "STORY" && platforms.some((platform) => platform !== "INSTAGRAM")) {
      toast.error("Stories só podem ser publicados pelo Instagram nesta versão da API.")
      return
    }
    if (platforms.includes("FACEBOOK") && !selectedAccount?.pageName) {
      toast.error("A conta selecionada não tem uma Página do Facebook vinculada.")
      return
    }
    const scheduledFor = mode === "publish" ? new Date() : new Date(selectedDate)
    if (Number.isNaN(scheduledFor.getTime()) || (mode === "schedule" && scheduledFor <= new Date())) {
      toast.error("Escolha uma data futura válida para o agendamento.")
      return
    }

    setIsSubmitting(true)
    let publishWasRequested = false
    try {
      const files = mediaItems.flatMap(item => item.file ? [item.file] : [])
      const upload = files.length
        ? await api.uploadMedia(files) as { urls: string[] }
        : { urls: [] as string[] }
      let uploadedIndex = 0
      const mediaUrls = mediaItems.map(item => item.file ? upload.urls[uploadedIndex++] : item.src)
      const existingTags = new Set((caption.match(new RegExp('#[\\p{L}\\p{N}_]+', 'gu')) || []).map(tag => tag.toLowerCase()))
      const finalCaption = [caption.trim(), hashtags.filter(tag => !existingTags.has(`#${tag}`.toLowerCase())).map((tag) => `#${tag}`).join(" ")]
        .filter(Boolean)
        .join("\n\n")
      if (textOnlyThreads && finalCaption.length > 500) {
        toast.error("Texto e hashtags juntos ultrapassam o limite de 500 caracteres do Threads.")
        return
      }
      const payload = {
        accountId,
        threadsAccountId: platforms.includes("THREADS") ? threadsAccountId : undefined,
        mediaType: postType === "FEED" ? "IMAGE" : postType,
        mediaUrls,
        caption: finalCaption,
        hashtags,
        platforms,
        scheduledFor: scheduledFor.toISOString(),
        status: mode === "schedule" ? "SCHEDULED" : "DRAFT",
      }
      const created = (draftId ? await api.updatePost(draftId, payload) : await api.createPost(payload)) as { id: string }

      let publishSummary: { succeeded?: string[]; failed?: { platform: string; message: string }[] } | undefined
      if (mode === "publish") {
        publishWasRequested = true
        const result = await api.publishPost(created.id) as { publishSummary?: typeof publishSummary }
        publishSummary = result.publishSummary
        setPublishOutcome({ succeeded: publishSummary?.succeeded || [], failed: publishSummary?.failed || [] })
      }
      if (mode === "schedule") {
        toast.success("Publicação agendada com sucesso.")
      } else if (publishSummary?.failed?.length) {
        const names: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads" }
        const succeeded = (publishSummary.succeeded || []).map((platform) => names[platform] || platform)
        const failed = publishSummary.failed.map(({ platform, message }) => `${names[platform] || platform}: ${message}`)
        toast.error(`${succeeded.length ? `Publicado em ${succeeded.join(", ")}. ` : ""}Falhou em ${failed.join("; ")}.`)
      } else if (publishSummary?.succeeded?.length === platforms.length) {
        toast.success(`Publicado em ${publishSummary.succeeded.map((platform) => ({ INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads" })[platform] || platform).join(", ")}.`)
      } else {
        toast.success("Solicitação de publicação concluída. Confira o resultado no calendário.")
      }
      if (mode === "publish") {
        setDraftId(''); setEditorialBrief(null); window.history.replaceState(null, '', '/composer')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir a publicação."
      if (publishWasRequested) {
        const platformErrors = message.split(" | ").map((entry) => {
          const separator = entry.indexOf(":")
          return separator > 0 ? { platform: entry.slice(0, separator).trim().toUpperCase(), message: entry.slice(separator + 1).trim() } : null
        }).filter((entry): entry is { platform: string; message: string } => Boolean(entry))
        setPublishOutcome({ succeeded: [], failed: platforms.map(platform => ({ platform, message: platformErrors.find(item => item.platform === platform)?.message || message })) })
      }
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveDraftChanges = async () => {
    if (isSubmitting) return
    if (!accountId) { toast.error('Selecione uma conta antes de salvar.'); return }
    const textOnlyThreads = postType === 'TEXT' && platforms.length === 1 && platforms[0] === 'THREADS'
    if (!draftId && !mediaItems.length && !textOnlyThreads) { toast.error('Adicione uma mídia ou escolha Post de texto no Threads antes de criar este rascunho.'); return }
    if (textOnlyThreads && !caption.trim()) { toast.error('Escreva o texto do post antes de salvar.'); return }
    if (textOnlyThreads && caption.length > 500) { toast.error('O texto do Threads tem limite de 500 caracteres.'); return }
    setIsSubmitting(true)
    try {
      const files = mediaItems.flatMap(item => item.file ? [item.file] : [])
      const upload = files.length ? await api.uploadMedia(files) as { urls: string[] } : { urls: [] }
      let index = 0
      const urls = mediaItems.map(item => item.file ? upload.urls[index++] : item.src)
      const data = { caption, hashtags, mediaUrls: urls, mediaType: postType === 'FEED' ? 'IMAGE' : postType,
        platforms, threadsAccountId: platforms.includes('THREADS') ? threadsAccountId : null, status: 'DRAFT' }
      const saved = draftId ? await api.updatePost(draftId, data) : await api.createPost({ ...data, accountId, scheduledFor: new Date(selectedDate || Date.now()).toISOString() })
      setDraftId(saved.id)
      window.history.replaceState(null, '', `/composer?draft=${encodeURIComponent(saved.id)}`)
      setMediaItems(current => current.map((item, i) => { if (item.isObjectUrl) URL.revokeObjectURL(item.src); return { ...item, src: urls[i], file: undefined, isObjectUrl: false } }))
      toast.success('Rascunho atualizado. Nada foi publicado ou agendado.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o rascunho.') }
    finally { setIsSubmitting(false) }
  }

  if (draftLoading) return <p role="status">Abrindo rascunho salvo...</p>
  if (draftError) return <Card className="p-6"><p role="alert">{draftError}</p><a href="/calendar" className="text-indigo-700 underline">Voltar ao calendário</a></Card>
  if (publishOutcome) {
    const platformNames: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads" }
    const allSucceeded = publishOutcome.succeeded.length > 0 && publishOutcome.failed.length === 0
    const hasPartialSuccess = publishOutcome.succeeded.length > 0 && publishOutcome.failed.length > 0
    const startAnother = () => {
      mediaItems.forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
      setPublishOutcome(null); setStep(1); setCaption(""); setHashtags([]); setTagInput(""); setMediaItems([]); setActiveMediaIndex(0); setDraftId(""); setEditorialBrief(null)
    }
    return <main className="mx-auto flex min-h-[65vh] w-full max-w-2xl items-center justify-center px-3 py-8">
      <Card className="w-full overflow-hidden rounded-3xl border-slate-200 shadow-sm">
        <div className={`h-2 w-full ${allSucceeded ? "bg-emerald-500" : hasPartialSuccess ? "bg-amber-400" : "bg-rose-500"}`} />
        <div className="px-6 py-9 text-center sm:px-10">
          <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${allSucceeded ? "bg-emerald-50 text-emerald-600" : hasPartialSuccess ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>
            {allSucceeded ? <BadgeCheck size={34} /> : hasPartialSuccess ? <Send size={30} /> : <XCircle size={32} />}
          </span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Resultado da publicação</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{allSucceeded ? "Publicado com sucesso!" : hasPartialSuccess ? "Publicado em algumas redes" : "Não foi possível publicar"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{allSucceeded ? "Seu conteúdo foi enviado para todas as redes selecionadas." : hasPartialSuccess ? "A publicação deu certo em parte das redes. Veja abaixo o resultado de cada uma." : "Nenhuma rede confirmou a publicação. Confira o motivo por rede antes de tentar novamente."}</p>

          <div className="mt-7 space-y-2 text-left">
            {publishOutcome.succeeded.map(platform => <div key={platform} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3"><CheckCircle2 size={18} className="shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-slate-800">{platformNames[platform] || platform} · Publicado</p><p className="text-xs text-slate-600">A plataforma confirmou o envio.</p></div></div>)}
            {publishOutcome.failed.map(({ platform, message }, index) => <div key={`${platform}-${index}`} className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3"><XCircle size={18} className="mt-0.5 shrink-0 text-rose-600" /><div><p className="text-sm font-semibold text-slate-800">{platformNames[platform] || platform} · Falhou</p><p className="mt-0.5 break-words text-xs leading-5 text-rose-700">{message}</p></div></div>)}
          </div>

          <div className="mt-7 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={startAnother} className="h-11 gap-2 px-5">Criar outra publicação</Button>
            <Button type="button" onClick={() => { window.location.href = "/calendar" }} className="h-11 gap-2 bg-indigo-600 px-5 text-white hover:bg-indigo-700">Ver no calendário<ChevronRight size={16} /></Button>
          </div>
        </div>
      </Card>
    </main>
  }
  return (
    <div className="space-y-5 animate-fade-in">
      <nav className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-xs md:flex md:items-center md:gap-0 md:px-7" aria-label="Etapas da publicação">
        {[
          { label: "Onde publicar", help: "Escolha a rede social" },
          { label: "Formato", help: "Defina o tipo de post" },
          { label: "Conteúdo", help: "Crie seu post" },
          { label: "Revisar", help: "Confira e publique" },
        ].map((item, index) => <div key={item.label} className="flex min-w-0 items-center md:flex-1">
          <button type="button" onClick={() => setStep(index + 1)} aria-current={step === index + 1 ? "step" : undefined} className="flex min-w-0 items-center gap-2.5 text-left">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${step === index + 1 ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : step > index + 1 ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-500"}`}>{index + 1}</span>
            <span className="min-w-0"><span className={`block truncate text-xs font-semibold md:text-sm ${step === index + 1 ? "text-indigo-700" : "text-slate-800"}`}>{item.label}</span><span className="hidden truncate text-[11px] text-slate-500 sm:block">{item.help}</span></span>
          </button>
          {index < 3 && <span aria-hidden="true" className={`mx-3 hidden h-px min-w-4 flex-1 md:block ${step > index + 1 ? "bg-indigo-300" : "bg-slate-300"}`} />}
        </div>)}
      </nav>
      <div className="grid min-h-[calc(100vh-14rem)] min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,1fr)]">
      {/* Editor Panel */}
      <div className="min-w-0 flex-1 flex flex-col gap-6">
        {draftId && <Card className="space-y-2 border-indigo-200 p-4"><p className="font-semibold">Editando rascunho salvo · @{accounts.find(a => a.id === accountId)?.igUsername}</p><p className="text-xs text-slate-500">Adicione as mídias antes de publicar ou agendar. Esta edição mantém a conta original.</p>{editorialBrief && <details><summary className="cursor-pointer text-sm font-semibold">Briefing e Story do plano</summary><p className="mt-2 whitespace-pre-wrap text-sm">{editorialBrief.creativeBrief}</p><p className="mt-2 whitespace-pre-wrap text-sm">Story: {editorialBrief.storyIdea}</p></details>}<Button type="button" variant="outline" disabled={isSubmitting} onClick={saveDraftChanges}>Salvar alterações do rascunho</Button><a href="/calendar" className="ml-3 text-sm text-indigo-700 underline">Calendário</a></Card>}
        <Card className="p-5 md:p-7 border border-slate-200/80 bg-white rounded-2xl shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Nova publicação · etapa {step} de 4</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-[28px]">{["Onde você quer publicar?", "Qual formato você deseja usar?", "Como você quer criar o conteúdo?", "Tudo pronto para publicar?"][step - 1]}</h2><p className="mt-1 text-sm text-slate-500">{["Selecione a rede social onde seu post será publicado.", "Escolha o formato ideal para o seu conteúdo.", "Escreva seu texto, adicione as mídias e personalize o post.", "Revise os detalhes e escolha quando publicar."][step - 1]}</p></div>
          {/* Post Type Selector */}
          {step === 2 && <div className="animate-fade-in">
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="text-xs font-semibold text-slate-600">Destinos escolhidos</span>
              {platforms.map((platform) => <span key={platform} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">{platformNames[platform] || platform}</span>)}
              {!platforms.length && <span className="text-xs text-slate-500">Volte à etapa 1 e escolha uma rede.</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { id: "FEED" as const, label: platforms.length === 1 && platforms[0] === "FACEBOOK" ? "Foto da Página" : platforms.length === 1 && platforms[0] === "THREADS" ? "Post com imagem" : "Foto única", description: "Uma imagem · feed ou post", icon: ImageIcon },
                { id: "CAROUSEL" as const, label: platforms.length === 1 && platforms[0] === "FACEBOOK" ? "Álbum de fotos" : "Carrossel", description: "2 a 10 mídias no mesmo post", icon: Copy },
                { id: "REEL" as const, label: platforms.length === 1 && platforms[0] === "INSTAGRAM" ? "Reel" : platforms.length === 1 && platforms[0] === "FACEBOOK" ? "Vídeo da Página" : platforms.length === 1 && platforms[0] === "THREADS" ? "Vídeo" : "Vídeo vertical", description: "Vídeo · nome muda por rede", icon: Video },
                { id: "STORY" as const, label: "Story", description: "Instagram Business apenas", icon: PlusCircle },
                { id: "TEXT" as const, label: "Post de texto", description: "Threads · até 500 caracteres", icon: PencilLine },
              ].map(type => (
                (() => {
                  const targetPlatforms = compatiblePlatformsFor(type.id)
                  const available = targetPlatforms.length > 0
                  const platformSpecific = targetPlatforms.length === 1 ? networkFormatDetails[targetPlatforms[0]]?.[type.id] : undefined
                  const willAdjustDestinations = available && (targetPlatforms.length !== platforms.length || targetPlatforms.some((platform, index) => platform !== platforms[index]))
                  const unavailableReason = type.id === "STORY" ? "Stories só podem ser publicados no Instagram." : type.id === "TEXT" ? "Post de texto sem mídia está disponível somente no Threads." : `Não disponível para todas as redes escolhidas: ${platforms.filter(platform => !formatPlatforms[type.id].includes(platform)).map(platform => platformNames[platform] || platform).join(", ")}.`
                  return <button
                  key={type.id}
                  type="button"
                  onClick={() => available && changePostType(type.id)}
                  disabled={!available}
                  aria-pressed={postType === type.id}
                  aria-describedby={!available ? `format-${type.id}-unavailable` : undefined}
                  className={`relative flex min-h-32 flex-col items-start rounded-2xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-55 md:min-h-36 md:p-4 ${
                    postType === type.id
                      ? "border-indigo-600 bg-indigo-50/70 text-indigo-700 shadow-xs ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${postType === type.id ? "bg-white text-indigo-600" : "bg-slate-50 text-slate-500"}`}><type.icon size={27} strokeWidth={1.9} /></span>
                  <span className="text-sm font-bold">{type.label}</span><span className="mt-1 text-[11px] leading-4 text-slate-500">{platformSpecific?.name || type.description}</span>
                  {!available && <span id={`format-${type.id}-unavailable`} className="mt-1 text-[10px] leading-4 text-slate-500">{unavailableReason}</span>}
                  {willAdjustDestinations && <span className="mt-2 text-[10px] font-medium leading-4 text-indigo-700">Usar em {targetPlatforms.map(platform => platformNames[platform] || platform).join(" e ")}</span>}
                  {postType === type.id && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white"><Check size={12} /></span>}
                </button>
                })()
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 md:p-5" role="note" aria-label="Requisitos do formato selecionado por rede">
              <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-xs"><ImageIcon size={20} /></span><div><h3 className="text-sm font-bold text-slate-900">Formato e dimensões por plataforma</h3><p className="mt-0.5 text-xs text-slate-500">Cada formato usa apenas as redes compatíveis; ao escolher Story, por exemplo, a publicação fica só no Instagram.</p></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                {platforms.map((platform) => {
                  const detail = networkFormatDetails[platform]?.[postType]
                  if (!detail) return null
                  const activeRatio = activeMedia?.width && activeMedia.height ? activeMedia.width / activeMedia.height : undefined
                  const ratioTolerance = detail.acceptedRatio?.tolerance ?? 0.002
                  const isOutsideAcceptedRatio = Boolean(detail.acceptedRatio && activeRatio !== undefined && (
                    activeRatio < detail.acceptedRatio.min - ratioTolerance || activeRatio > detail.acceptedRatio.max + ratioTolerance
                  ))
                  const firstCarouselRatio = mediaItems[0]?.width && mediaItems[0].height ? mediaItems[0].width / mediaItems[0].height : undefined
                  const instagramCarouselWillCrop = platform === "INSTAGRAM" && postType === "CAROUSEL" && activeRatio !== undefined && firstCarouselRatio !== undefined && Math.abs(activeRatio - firstCarouselRatio) > 0.002
                  const PlatformIcon = platform === "INSTAGRAM" ? SiInstagram : platform === "FACEBOOK" ? SiFacebook : SiThreads
                  const platformBg = platform === "INSTAGRAM" ? "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" : platform === "FACEBOOK" ? "bg-[#1877F2]" : "bg-[#101113]"
                  return <article key={platform} className="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-white bg-white/90 p-3">
                    <div className="flex items-center gap-2.5"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${platformBg}`}><PlatformIcon size={24} color="#fff" /></span><h4 className="text-sm font-bold text-slate-900">{platformNames[platform]}</h4></div>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{detail.name}</p>
                    <p className="flex w-full min-w-0 items-start gap-2 text-[11px] leading-4 text-slate-600"><Crop size={16} className="mt-0.5 shrink-0 text-indigo-600" /><span className="min-w-0 break-words">{detail.shape}</span></p>
                    <p className="flex w-full min-w-0 items-start gap-2 text-[11px] leading-4 text-slate-600"><Ruler size={16} className="mt-0.5 shrink-0 text-indigo-600" /><span className="min-w-0 break-words">{detail.dimensions}</span></p>
                    {activeMedia?.width && activeMedia.height && <p className={`w-full rounded-md px-2 py-1.5 text-[10px] leading-4 ${isOutsideAcceptedRatio ? "bg-rose-50 text-rose-700" : instagramCarouselWillCrop ? "bg-amber-50 text-amber-800" : detail.acceptedRatio ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                      Arquivo: {activeMedia.width} × {activeMedia.height} px · {formatAspectRatio(activeMedia.width, activeMedia.height)}
                      {isOutsideAcceptedRatio ? " · fora da faixa aceita" : instagramCarouselWillCrop ? " · o 1º item define o corte" : detail.acceptedRatio ? " · dentro da faixa aceita" : " · confira a recomendação acima"}
                    </p>}
                    <p className="text-[10px] leading-4 text-slate-500">{detail.note}</p>
                  </article>
                })}
              </div>
              {postType === "TEXT" && <p className="mt-3 text-[11px] leading-4 text-slate-500">O limite de texto do Threads é 500 caracteres. O compositor também permite hashtags dentro desse limite.</p>}
            </div>
          </div>
          }

          {/* Publication targets */}
          {step === 1 && <div className="animate-fade-in rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Onde publicar</p>
                <p className="mt-1 text-xs text-slate-500">Escolha uma ou várias redes para este conteúdo.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{selectedAccount ? `@${selectedAccount.igUsername}` : "Nenhuma conta do Instagram ativa"}</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "INSTAGRAM", label: "Instagram", Icon: SiInstagram, handle: selectedAccount ? `@${selectedAccount.igUsername}` : "Nenhuma conta selecionada", help: selectedAccount ? "Conectado" : "Conecte uma conta em Contas", color: "instagram" },
                { id: "FACEBOOK", label: "Facebook", Icon: SiFacebook, handle: selectedAccount?.pageName || "Página do Facebook", help: selectedAccount?.pageName ? "Conectado" : "Não conectado", color: "facebook" },
                { id: "THREADS", label: "Threads", Icon: SiThreads, handle: threadsAccounts[0] ? `@${threadsAccounts[0].username}` : "Conta do Threads", help: threadsAccounts.length ? "Conectado" : "Não conectado", color: "threads" },
              ].map((target) => {
                const selected = platforms.includes(target.id)
                const unavailable = (target.id === "INSTAGRAM" && (!selectedAccount || postType === "TEXT")) || (target.id === "THREADS" && (!threadsAccounts.length || postType === "STORY")) || (target.id === "FACEBOOK" && (!selectedAccount?.pageName || postType === "STORY" || postType === "TEXT"))
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => !unavailable && togglePlatform(target.id)}
                    aria-disabled={unavailable}
                    className={`flex min-h-[78px] w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all ${selected ? "border-indigo-600 bg-indigo-50/50 shadow-[0_0_0_1px_rgba(99,102,241,.16)]" : "border-slate-200 bg-white hover:border-slate-300"} ${unavailable ? "cursor-not-allowed opacity-60" : ""}`}
                    aria-pressed={selected}
                  >
                    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${target.color === "instagram" ? "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" : target.color === "facebook" ? "bg-[#1877F2]" : "bg-[#101113]"}`}>
                      <target.Icon size={34} color="#fff" title={`${target.label} logo`} />
                    </span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-4 text-slate-800">{target.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{target.handle}</span></span>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${!unavailable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}><span className={`h-2 w-2 rounded-full ${!unavailable ? "bg-emerald-500" : "bg-slate-300"}`} />{target.help}</span>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{selected && <Check size={16} strokeWidth={3} />}</span>
                  </button>
                )
              })}
            </div>
            {platforms.includes("THREADS") && threadsAccounts.length > 1 && (
              <select value={threadsAccountId} onChange={(event) => setThreadsAccountId(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700" aria-label="Conta do Threads">
                {threadsAccounts.map((account) => <option key={account.id} value={account.id}>Threads @{account.username}</option>)}
              </select>
            )}
            {!selectedAccount && <a href="/accounts" className="inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-800">Conectar Instagram em Contas →</a>}
            {!threadsAccounts.length && <a href={`${BACKEND_ORIGIN}/api/auth/threads`} className="ml-4 inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-800">Conectar conta do Threads →</a>}
            <p className="flex items-center gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold">i</span>Para trocar de perfil, use o seletor no topo da página.</p>
          </div>
          }

          {/* AI assistant */}
          {step === 3 && <div className="animate-fade-in space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {[{ id: "manual" as const, title: "Fazer por conta", detail: "Escreva o texto, adicione mídias e personalize do seu jeito.", Icon: PencilLine }, { id: "ai" as const, title: "Criar com IA", detail: "Gere uma legenda e hashtags a partir de um tema.", Icon: Sparkles }].map(option => <button key={option.id} type="button" onClick={() => setCreationMode(option.id)} aria-pressed={creationMode === option.id} className={`flex min-h-[88px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${creationMode === option.id ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${creationMode === option.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-indigo-600"}`}><option.Icon size={22} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{option.title}</span><span className="mt-1 block text-xs leading-4 text-slate-500">{option.detail}</span></span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${creationMode === option.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{creationMode === option.id && <Check size={12} />}</span></button>)}
          </div>
          {creationMode === "ai" && <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-fuchsia-50/50 shadow-xs" aria-labelledby="ai-assistant-title">
            <header className="flex items-center gap-3 border-b border-indigo-100/80 px-4 py-4 md:px-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"><Sparkles size={19} /></span>
              <div className="min-w-0"><h3 id="ai-assistant-title" className="text-sm font-bold text-slate-900">Assistente de conteúdo</h3><p className="mt-0.5 text-xs text-slate-500">Defina a ideia, ajuste se quiser e escolha o que a IA vai preparar.</p></div>
            </header>

            <div className="space-y-5 p-4 md:p-5">
              <section aria-labelledby="ai-brief-title">
                <div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">1</span><h4 id="ai-brief-title" className="text-sm font-semibold text-slate-900">Sobre o que vamos falar?</h4></div>
                <label htmlFor="ai-topic" className="mb-1.5 block text-xs font-medium text-slate-700">Ideia ou assunto <span className="text-rose-600">*</span></label>
                <Input id="ai-topic" value={aiTopic} onChange={(event) => { setAiTopic(event.target.value); setAiPlan([]) }} placeholder="Ex.: 3 formas de organizar as finanças do seu negócio" aria-label="Ideia ou assunto para a IA" />
                <label htmlFor="ai-audience" className="mb-1.5 mt-3 block text-xs font-medium text-slate-700">Para quem é este conteúdo <span className="font-normal text-slate-400">· opcional</span></label>
                <Input id="ai-audience" value={aiAudience} onChange={(event) => { setAiAudience(event.target.value); setAiPlan([]) }} placeholder="Ex.: donos de pequenos negócios" aria-label="Público para a IA" />
                <details className="group mt-3 rounded-xl border border-indigo-100 bg-white/80">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-indigo-800 marker:hidden"><span>Personalizar o resultado <span className="font-normal text-slate-500">· objetivo e tom</span></span><ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" /></summary>
                  <div className="grid gap-3 border-t border-indigo-50 p-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-700">Objetivo<select value={aiObjective} onChange={(event) => { setAiObjective(event.target.value); setAiPlan([]) }} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <option>Atrair e gerar conversa</option><option>Vender um produto ou serviço</option><option>Educar e gerar autoridade</option><option>Fortalecer relacionamento</option>
                    </select></label>
                    <label className="block text-xs font-medium text-slate-700">Tom de voz<select value={aiTone} onChange={(event) => { setAiTone(event.target.value); setAiPlan([]) }} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <option>Profissional e próximo</option><option>Direto e persuasivo</option><option>Leve e descontraído</option><option>Inspirador</option><option>Educativo</option>
                    </select></label>
                  </div>
                </details>
              </section>

              <section aria-labelledby="ai-output-title">
                <div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">2</span><h4 id="ai-output-title" className="text-sm font-semibold text-slate-900">O que você quer criar?</h4></div>
                <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Tipo de criação com IA">
                  {[
                    { id: "caption" as const, title: "Uma legenda", detail: "Para este post", Icon: PencilLine },
                    { id: "daily" as const, title: "Plano do dia", detail: "3 posts revisáveis", Icon: CalendarIcon },
                    { id: "week" as const, title: "Plano semanal", detail: "Ideias para 7 dias", Icon: Layers },
                  ].map(option => <button key={option.id} type="button" onClick={() => setAiWorkflow(option.id)} aria-pressed={aiWorkflow === option.id} className={`flex min-h-[68px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${aiWorkflow === option.id ? "border-indigo-600 bg-white text-indigo-800 shadow-[0_0_0_1px_rgba(99,102,241,.15)]" : "border-slate-200 bg-white/70 text-slate-600 hover:border-indigo-300"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${aiWorkflow === option.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}><option.Icon size={18} /></span><span className="min-w-0"><span className="block text-xs font-semibold">{option.title}</span><span className="mt-0.5 block text-[11px] text-slate-500">{option.detail}</span></span></button>)}
                </div>

                {aiWorkflow === "caption" && <div className="mt-3 rounded-xl border border-indigo-100 bg-white/90 p-3">
                  <p className="text-xs leading-5 text-slate-600">A IA vai criar uma legenda e hashtags para o formato e as redes escolhidas. Você poderá revisar e editar tudo.</p>
                  <Button type="button" onClick={() => generateWithAi("caption")} disabled={aiLoading || !aiTopic.trim()} className="mt-3 w-full justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"><Sparkles size={15} />{aiLoading ? "Criando sua legenda…" : "Criar legenda e hashtags"}</Button>
                </div>}

                {aiWorkflow === "week" && <div className="mt-3 rounded-xl border border-indigo-100 bg-white/90 p-3">
                  <p className="text-xs leading-5 text-slate-600">Receba uma ideia de conteúdo para cada dia. O plano é apenas uma sugestão; nada será publicado ou agendado.</p>
                  <Button type="button" onClick={() => generateWithAi("plan")} disabled={aiLoading || !aiTopic.trim()} className="mt-3 w-full justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"><CalendarIcon size={15} />{aiLoading ? "Montando seu plano…" : "Montar plano de 7 dias"}</Button>
                </div>}

                <div className={aiWorkflow === "daily" ? "mt-3 rounded-xl border border-indigo-100 bg-white/90 p-3" : "hidden"}>
                  <p className="mb-3 text-xs leading-5 text-slate-600">Crie três rascunhos para um dia. Você revisa cada legenda e escolhe se quer salvar — nada é agendado automaticamente.</p>
                  <DailyContentPlan accountId={accountId} topic={aiTopic} audience={aiAudience} tone={aiTone} objective={aiObjective} onEdit={post => {
                    if ((caption.trim() || mediaItems.length) && !window.confirm('Substituir a legenda, as hashtags e o formato atuais por este post do plano? As mídias anexadas serão mantidas; confira se combinam com o novo conteúdo.')) return
                    setCaption(post.caption)
                    setHashtags(post.hashtags.map(tag => tag.replace(/^#/, '')))
                    setPostType(post.format === 'IMAGE' ? 'FEED' : post.format)
                    toast.success('Texto aplicado ao compositor. Revise as mídias e escolha as redes antes de publicar.')
                  }} />
                </div>

                {aiWorkflow === "week" && aiPlan.length > 0 && <div className="mt-3 max-h-80 space-y-2 overflow-auto rounded-xl border border-indigo-100 bg-white p-3" aria-live="polite">{aiPlan.map((item, index) => <article key={`${item.day}-${index}`} className="rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-indigo-700">{item.day} · {item.format}</p><span className="text-[11px] text-slate-400">{item.suggestedTime}</span></div><p className="mt-1 text-sm font-semibold text-slate-800">{item.topic}</p><p className="mt-1 text-xs text-slate-500">{item.hook}</p><p className="mt-1 text-xs font-medium text-slate-600">CTA: {item.cta}</p></article>)}</div>}
              </section>
            </div>
          </section>}

          {/* Caption */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="post-caption" className="block text-sm font-semibold text-slate-800">Texto do post</label>
              <span className={`text-xs font-medium ${caption.length > (postType === "TEXT" ? 450 : 2100) ? "text-amber-700" : "text-slate-400"}`}>{caption.length.toLocaleString("pt-BR")}/{postType === "TEXT" ? "500" : "2.200"} caracteres</span>
            </div>
            <textarea id="post-caption" className="h-28 w-full resize-y rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-5 text-slate-900 shadow-xs transition placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 md:h-32" placeholder={postType === "TEXT" ? "Escreva seu post para o Threads..." : "Escreva sua legenda, conte a ideia e personalize o post..."} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={postType === "TEXT" ? 500 : 2200} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={speakCaption} disabled={!caption.trim()} className="h-9 gap-2 rounded-lg border-indigo-100 px-3 text-xs text-indigo-700"><Mic size={15} />Ouvir texto</Button>
              <Button type="button" variant="outline" disabled={aiLoading || !caption.trim()} onClick={improveCaption} className="h-9 gap-2 rounded-lg border-indigo-100 px-3 text-xs text-indigo-700"><Sparkles size={15} />{aiLoading ? "Revisando…" : "Melhorar com IA"}</Button>
            </div>
          </div>

          {/* Media upload */}
          {postType !== "TEXT" && <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <label className="block text-sm font-semibold text-slate-800">Mídias</label>
              <span className="text-xs font-medium text-slate-400">{mediaItems.length}{postType === "CAROUSEL" ? " de 10 itens" : mediaItems.length === 1 ? " arquivo" : " arquivos"}</span>
            </div>
            {mediaItems.length > 0 && (
              <div className="mb-3">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {mediaItems.map((item, index) => (
                    <div key={item.id} className="group relative aspect-[1.1]">
                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex(index)}
                        title={item.name}
                        className={`h-full w-full overflow-hidden rounded-xl border bg-slate-100 transition-all ${
                          index === activeMediaIndex
                            ? "border-indigo-600 ring-2 ring-indigo-500/25"
                            : "border-slate-200 hover:border-indigo-300"
                        }`}
                      >
                        {item.kind === "video" ? (
                          <video src={item.src} muted autoPlay loop playsInline preload="auto" className="w-full h-full object-cover" aria-label="Miniatura do vídeo" />
                        ) : (
                          <img src={item.src} alt={item.name} className="w-full h-full object-cover" />
                        )}
                      </button>
                      <span className="absolute bottom-2 left-2 flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-950/75 px-1 text-[10px] font-bold text-white">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        aria-label={`Remover ${item.name}`}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/75 text-sm leading-none text-white opacity-100 shadow-sm transition hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                      >
                        ×
                      </button>
                      {item.kind === "video" && (
                        <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/75 text-white text-[9px] font-bold px-1.5 py-0.5">
                          VÍDEO
                        </span>
                      )}
                    </div>
                  ))}
                  {mediaItems.length < (postType === "CAROUSEL" ? 10 : 1) && <div {...getRootProps()} className={`flex aspect-[1.1] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition ${isDragActive ? "border-indigo-500 bg-indigo-50" : "border-indigo-200 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/40"}`}><input {...getInputProps()} /><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ImagePlus size={18} /></span><span className="mt-2 text-[11px] font-semibold text-indigo-700">Adicionar mídia</span><span className="mt-1 text-[9px] leading-3 text-slate-500">Imagem ou vídeo<br />(até 100 MB)</span></div>}
                </div>

                {postType === "CAROUSEL" && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                    <span className="text-xs font-medium text-indigo-800">
                      {mediaItems.length}/10 itens • selecione uma miniatura para editar a ordem
                    </span>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveActiveMedia(-1)}
                        disabled={activeMediaIndex === 0}
                        className="w-7 h-7 rounded-lg border border-indigo-200 bg-white text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50"
                        aria-label="Mover mídia para a esquerda"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => moveActiveMedia(1)}
                        disabled={activeMediaIndex === mediaItems.length - 1}
                        className="w-7 h-7 rounded-lg border border-indigo-200 bg-white text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50"
                        aria-label="Mover mídia para a direita"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mediaItems.length === 0 && <div
              {...getRootProps()}
              className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                isDragActive
                  ? "border-indigo-500 bg-indigo-50/50"
                  : "border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              <input {...getInputProps()} />
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600 shadow-xs">
                <ImagePlus size={22} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">
                  {isDragActive ? "Solte os arquivos aqui" : mediaItems.length > 0 ? "Adicionar mais mídias" : "Arraste imagens ou vídeos aqui"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {platforms.length === 1 && platforms[0] === "THREADS" ? "Opcional no Threads quando você publicar somente texto • PNG, JPG, MP4 ou MOV" : postType === "CAROUSEL" ? "Até 10 itens • PNG, JPG, MP4 ou MOV" : "PNG, JPG, MP4 ou MOV até 100MB"}
                </p>
              </div>
            </div>}
          </div>}

          <ArtworkStudio disabled={isSubmitting} onUse={async files => {
            if (mediaItems.length && !window.confirm('Substituir as mídias selecionadas pelas artes do editor?')) return
            mediaItems.forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
            const artworkItems = await Promise.all(files.map(async file => {
              const src = URL.createObjectURL(file)
              const dimensions = await getMediaDimensions(src, "image")
              return { id: crypto.randomUUID(), file, src, name: file.name, kind: "image" as const, isObjectUrl: true, ...dimensions }
            }))
            setMediaItems(artworkItems)
            setPostType(files.length > 1 ? 'CAROUSEL' : 'FEED'); setActiveMediaIndex(0)
            toast.success('Artes anexadas. Revise a prévia e salve o rascunho; nada foi publicado.')
          }} />
          {!draftId && <Button type="button" variant="outline" disabled={isSubmitting || !accountId || !mediaItems.length} onClick={saveDraftChanges}>Salvar como rascunho</Button>}

          {/* Hashtags */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="composer-hashtag" className="block text-sm font-semibold text-slate-800">Hashtags <span className="font-normal text-slate-400">(opcional)</span></label><span className="text-xs text-slate-400">{hashtags.length} {hashtags.length === 1 ? "hashtag" : "hashtags"}</span></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Hash aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="composer-hashtag"
                  aria-label="Digite uma hashtag"
                  className="h-11 rounded-xl pl-10 text-sm"
                  placeholder="Digite uma hashtag, ex.: marketingdigital"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={addHashtag} disabled={!tagInput.trim()} className="h-11 flex-1 rounded-xl px-4 text-xs font-semibold sm:flex-none">Adicionar</Button>
                <Button type="button" variant="outline" onClick={lookupHashtag} disabled={!tagInput.trim() || hashtagSearching || !accountId} className="h-11 flex-1 gap-2 rounded-xl border-indigo-200 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 sm:flex-none">
                  <Search size={14} />{hashtagSearching ? "Buscando…" : "Sugestões do Instagram"}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Adicione uma tag manualmente ou busque sugestões reais. A busca é feita só quando você clicar, para evitar consultas desnecessárias à Meta.</p>

            {hashtagLookup && <section aria-live="polite" className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">Resultados para <span className="text-indigo-700">#{hashtagLookupTerm}</span></p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">A Meta retornou uma amostra de {hashtagLookup.recentMediaCount} posts recentes e {hashtagLookup.topMediaCount} em destaque. Não é o total de publicações existentes com essa tag.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => addSuggestedHashtag(hashtagLookupTerm)} disabled={hashtags.some(tag => tag.toLocaleLowerCase() === hashtagLookupTerm.toLocaleLowerCase())} className="shrink-0 gap-1.5 border-indigo-200 bg-white text-indigo-700">
                  <Plus size={14} />{hashtags.some(tag => tag.toLocaleLowerCase() === hashtagLookupTerm.toLocaleLowerCase()) ? "Adicionada" : "Adicionar tag"}
                </Button>
              </div>
              {relatedHashtagSuggestions.length > 0 && <div className="mt-3 border-t border-indigo-100 pt-3">
                <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">Tags encontradas nas legendas dessa amostra</p><span className="text-[11px] text-slate-500">{relatedHashtagSuggestions.length} sugestões</span></div>
                <div className="flex flex-wrap gap-2">
                  {(showAllTagSuggestions ? relatedHashtagSuggestions : relatedHashtagSuggestions.slice(0, 6)).map(({ tag, count }) => {
                    const added = hashtags.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase())
                    return <button key={tag} type="button" onClick={() => addSuggestedHashtag(tag)} disabled={added} title={`Encontrada em ${count} ${count === 1 ? "post desta amostra" : "posts desta amostra"}`} className="inline-flex min-h-8 items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-default disabled:bg-indigo-100 disabled:text-indigo-700"><span>#{tag}</span><span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{count}</span>{added && <Check size={12} />}</button>
                  })}
                </div>
                {relatedHashtagSuggestions.length > 6 && <button type="button" onClick={() => setShowAllTagSuggestions(value => !value)} className="mt-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900">{showAllTagSuggestions ? "Mostrar menos" : `Ver mais ${relatedHashtagSuggestions.length - 6} sugestões`}</button>}
                <p className="mt-2 text-[11px] text-slate-500">O número ao lado indica em quantas legendas da amostra a tag apareceu; não mede o volume total nem popularidade global.</p>
              </div>}
              {relatedHashtagSuggestions.length === 0 && <p className="mt-3 border-t border-indigo-100 pt-3 text-xs text-slate-500">Não encontrei outras hashtags nas legendas retornadas. Você ainda pode adicionar esta tag manualmente.</p>}
            </section>}

            {hashtags.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Hashtags adicionadas">
              {hashtags.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800">
                #{tag}{hashtagLookup && tag.toLocaleLowerCase() === hashtagLookupTerm.toLocaleLowerCase() && <span className="ml-1 font-normal text-indigo-600" title="Quantidade retornada pela Meta nesta consulta, não total global">· amostra {hashtagLookup.recentMediaCount}+{hashtagLookup.topMediaCount}</span>}
                <button type="button" onClick={() => removeHashtag(tag)} aria-label={`Remover hashtag ${tag}`} className="ml-1 rounded-full px-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-900">×</button>
              </span>)}
            </div>}
          </div>

          {/* Scheduling Date and Actions */}
          </div>}

          {step === 4 && <div className="animate-fade-in space-y-5">
            <section><h3 className="text-sm font-bold text-slate-900">Redes sociais selecionadas</h3><div className="mt-2 flex flex-wrap gap-2">{platforms.map(platform => { const network = platform === "INSTAGRAM" ? { label: `Instagram · @${selectedAccount?.igUsername || "conta"}`, Icon: SiInstagram, bg: "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" } : platform === "FACEBOOK" ? { label: `Facebook · ${selectedAccount?.pageName || "Página"}`, Icon: SiFacebook, bg: "bg-[#1877F2]" } : { label: `Threads · @${threadsAccounts.find(account => account.id === threadsAccountId)?.username || "conta"}`, Icon: SiThreads, bg: "bg-[#101113]" }; return <span key={platform} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${network.bg}`}><network.Icon size={17} color="#fff" title={network.label} /></span>{network.label}</span> })}</div></section>
            <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Formato</span><p className="mt-1 text-sm font-semibold text-slate-900">{postType === "FEED" ? "Foto única" : postType === "CAROUSEL" ? "Carrossel" : postType === "REEL" ? "Vídeo / Reel" : postType === "STORY" ? "Story" : "Post de texto · Threads"}</p></div><div className="rounded-xl border border-slate-200 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mídia</span><p className="mt-1 text-sm font-semibold text-slate-900">{postType === "TEXT" ? "Somente texto" : `${mediaItems.length} ${mediaItems.length === 1 ? "arquivo" : "arquivos"}`}</p></div></section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-bold text-slate-900">Resumo do conteúdo</h3><div className="mt-3 flex gap-3">{activeMedia && <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">{activeMedia.kind === "video" ? <video src={activeMedia.src} muted playsInline className="h-full w-full object-cover" /> : <img src={activeMedia.src} alt="Mídia selecionada" className="h-full w-full object-cover" />}</div>}<div className="min-w-0"><p className="line-clamp-4 whitespace-pre-wrap text-sm leading-5 text-slate-700">{caption || "Adicione a legenda na etapa Conteúdo."}</p>{hashtags.length > 0 && <p className="mt-1 line-clamp-1 text-xs text-indigo-600">{hashtags.map(tag => `#${tag} `)}</p>}</div></div></section>
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><label htmlFor="publish-date" className="text-sm font-semibold text-slate-900">Data e horário para agendar</label><p className="mb-2 mt-1 text-xs text-slate-500">A publicação imediata ignora este horário.</p><Input id="publish-date" type="datetime-local" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-11 rounded-xl bg-white text-sm font-medium" /></section>
          </div>}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" disabled={step === 1} onClick={() => setStep(current => Math.max(1, current - 1))} className="gap-1"><ChevronLeft size={16} />Voltar</Button>
            {step < 4 ? <Button type="button" onClick={() => { if (step === 1 && (!accountId || !platforms.length)) { toast.error("Selecione uma rede disponível antes de continuar."); return } if (step === 3 && !caption.trim() && !mediaItems.length) { toast.error("Adicione uma legenda ou mídia antes de revisar."); return } setStep(current => current + 1) }} className="gap-1 bg-indigo-600 text-white hover:bg-indigo-700">Continuar<ChevronRight size={16} /></Button> : <div className="flex flex-1 justify-end gap-2"><Button type="button" variant="outline" onClick={() => submitPost("schedule")} disabled={isSubmitting} className="gap-2"><CalendarIcon size={16} />Programar para depois</Button><Button type="button" onClick={() => submitPost("publish")} disabled={isSubmitting} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Send size={16} />{isSubmitting ? "Enviando..." : "Publicar agora"}</Button></div>}
          </div>
        </Card>
      </div>

      {/* Each social destination and post format gets its own native-style preview. */}
      <aside className="w-full min-w-0 xl:sticky xl:top-24 xl:h-fit">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs md:p-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900">Prévia da publicação</h3><p className="text-xs text-slate-500">{previewDescription}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><Eye size={17} /></span></div>
          <div className="mt-4 flex w-full gap-1 rounded-md bg-slate-100 p-1" role="tablist" aria-label="Prévia por plataforma">
            {[{ id: "INSTAGRAM", label: "Instagram", Icon: SiInstagram }, { id: "FACEBOOK", label: "Facebook", Icon: SiFacebook }, { id: "THREADS", label: "Threads", Icon: SiThreads }].filter(tab => postType === "TEXT" ? tab.id === "THREADS" : postType === "STORY" ? tab.id === "INSTAGRAM" || tab.id === "FACEBOOK" : true).map(tab => <button key={tab.id} type="button" role="tab" aria-label={postType === "STORY" && tab.id === "FACEBOOK" ? "Facebook (prévia visual)" : tab.label} aria-selected={resolvedPreviewPlatform === tab.id} onClick={() => setPreviewPlatform(tab.id)} className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-1.5 py-2 text-[11px] font-semibold transition sm:text-xs ${resolvedPreviewPlatform === tab.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><tab.Icon size={15} title={tab.label} />{postType === "STORY" && tab.id === "FACEBOOK" ? "Facebook · prévia" : tab.label}</button>)}
          </div>
          {postType === "STORY" && resolvedPreviewPlatform === "FACEBOOK" && <p role="note" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">Apenas prévia visual. Facebook Stories não está habilitado para publicação neste compositor.</p>}
          {postType === "CAROUSEL" && resolvedPreviewPlatform === "FACEBOOK" && (mediaItems.some(item => item.kind === "video")
            ? <p role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">Álbuns do Facebook aceitam apenas fotos neste compositor. Remova os vídeos ou desmarque Facebook antes de publicar.</p>
            : <p role="note" className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-900">As fotos serão publicadas juntas em uma única publicação da Página, como um álbum. Arraste a imagem ou toque nos pontos para conferir cada foto.</p>)}
          <div className="social-preview-native mt-4 flex justify-center">
            <ComposerSocialPreview
              key={resolvedPreviewPlatform}
              postType={postType}
              previewPlatform={resolvedPreviewPlatform}
              selectedAccount={selectedAccount}
              threadsAccount={threadsAccounts.find(account => account.id === threadsAccountId)}
              media={activeMedia}
              mediaItems={mediaItems}
              activeMediaIndex={activeMediaIndex}
              onSelectMedia={setActiveMediaIndex}
              caption={caption}
              hashtags={hashtags}
            />
          </div>
          <p className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">A prévia segue a estrutura visual da rede e do formato escolhidos. A aparência final pode variar conforme as atualizações do aplicativo.</p>
        </section>
      </aside>
      </div>
    </div>
  )
}
