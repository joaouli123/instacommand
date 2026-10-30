"use client"
import { PageHeader } from "@/components/layout/PageHeader"
import { useEffect, useRef, useState, type MouseEvent } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ImagePlus, Hash, Calendar as CalendarIcon, Send, 
  Heart, MessageCircle, Bookmark, Share2, MoreHorizontal,
  Layers, Video, Image as ImageIcon, Sparkles, Crop, Ruler, FileImage, HardDrive,
  Copy, Timer, BadgeCheck, Scaling,
  Check, CheckCircle2, XCircle, ChevronDown, ChevronLeft, ChevronRight, Mic, Plus, Eye, PencilLine, PlusCircle, Search, Loader2
} from "lucide-react"
import { SiInstagram, SiFacebook, SiThreads, SiTiktok, SiX, SiYoutube } from "@icons-pack/react-simple-icons"
import twitterText from "twitter-text"
import { RiMore2Line, RiMusic2Line, RiPauseFill, RiPlayFill } from "@remixicon/react"
import { useDropzone } from "react-dropzone"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { DailyContentPlan } from "@/components/dashboard/DailyContentPlan"
import { ArtworkStudio } from "@/components/dashboard/ArtworkStudio"
import { selectAccount } from "@/lib/active-account-store"
import { isVideoUrl } from "@/lib/media"
import { getMediaDimensions, SocialPostPreview as ComposerSocialPreview, youtubeFormatOf, type MediaItem, type PostType, type YouTubeFormat } from "@/components/preview/SocialPostPreview"
import { acceptedKinds, FORMAT_PLATFORMS as formatPlatforms, incompatiblePlatforms, publishProblems } from "@/lib/publish-compat"
import { ofCompany } from "@/hooks/useCompanyProfiles"
import { emptyTikTokSettings, TikTokOptions, tiktokProblem, useTikTokCreatorInfo, type TikTokSettings } from "@/components/composer/TikTokOptions"
import { emptyYouTubeSettings, YOUTUBE_FORMAT_DETAILS, YouTubeFormatPicker, youtubeMediaProblem, YouTubeOptions, type YouTubeSettings } from "@/components/composer/YouTubeOptions"





type PlatformFormatDetail = {
  name: string
  shape: string
  dimensions: string
  note: string
  acceptedRatio?: { min: number; max: number; tolerance?: number }
}

const networkFormatDetails: Record<string, Partial<Record<PostType, PlatformFormatDetail>>> = {
  INSTAGRAM: {
    FEED: { name: "Foto no feed", shape: "Proporção: 1,91:1 a 3:4", dimensions: "1080 × 566 a 1440 px", note: "Fotos fora desse formato podem ser cortadas." },
    CAROUSEL: { name: "Carrossel do feed", shape: "Todas as fotos no mesmo formato", dimensions: "1080 × 1350 px · 4:5 recomendado", note: "Use o mesmo formato em todas as fotos para evitar cortes." },
    REEL: { name: "Reel", shape: "Vertical · proporção 9:16", dimensions: "1080 × 1920 px", note: "Vídeo de 3 s a 15 min · até 100 MB." },
    STORY: { name: "Story", shape: "Vertical · proporção 9:16", dimensions: "1080 × 1920 px", note: "Vídeo de 3 a 60 s · até 100 MB." },
  },
  FACEBOOK: {
    FEED: { name: "Foto da Página", shape: "Horizontal ou vertical", dimensions: "1080 × 1350 px · 4:5 recomendado", note: "A exibição pode variar conforme o local e o aparelho." },
    CAROUSEL: { name: "Álbum de fotos da Página", shape: "2 a 10 fotos", dimensions: "1080 px de largura recomendado", note: "As fotos aparecem juntas; cada uma mantém seu formato." },
    REEL: { name: "Reel do Facebook", shape: "Vertical · proporção 9:16", dimensions: "1080 × 1920 px · mínimo 540 × 960 px", note: "Vídeo de 4 a 60 s · até 100 MB.", acceptedRatio: { min: 9 / 16, max: 9 / 16, tolerance: 0.001 } },
  },
  THREADS: {
    FEED: { name: "Post com imagem", shape: "Mantém o formato original", dimensions: "Sem dimensão fixa", note: "A prévia mostra a imagem sem cortes." },
    CAROUSEL: { name: "Carrossel", shape: "Cada item mantém seu formato", dimensions: "2 a 10 fotos ou vídeos", note: "As mídias aparecem juntas na mesma publicação." },
    REEL: { name: "Post com vídeo", shape: "Mantém o formato original", dimensions: "Até 5 min · até 100 MB", note: "No Threads, o vídeo não é publicado como Reel." },
    TEXT: { name: "Post de texto", shape: "Somente texto", dimensions: "Até 500 caracteres", note: "Sem mídia anexada." },
  },
  X: {
    FEED: { name: "Post com imagem", shape: "16:9 ou 1:1 recomendado", dimensions: "Até 5 MB por imagem", note: "Texto de até 280 caracteres." },
    CAROUSEL: { name: "Post com até 4 imagens", shape: "As imagens aparecem em grade", dimensions: "2 a 4 imagens", note: "O X aceita no máximo 4 mídias por post." },
    REEL: { name: "Post com vídeo", shape: "Horizontal, quadrado ou vertical", dimensions: "Até 2 min 20 s · até 512 MB", note: "Vídeos mais longos exigem conta X Premium." },
    TEXT: { name: "Post de texto", shape: "Somente texto", dimensions: "Até 280 caracteres", note: "Sem mídia anexada." },
  },
  TIKTOK: {
    REEL: { name: "Vídeo do TikTok", shape: "Vertical 9:16 recomendado", dimensions: "1080 × 1920 px · duração máxima definida pelo perfil", note: "A legenda do post vira a legenda do TikTok. Privacidade e consentimento são obrigatórios." },
  },
  YOUTUBE: {
    REEL: { name: "Vídeo do YouTube", shape: "Vertical ou quadrado vira Short · horizontal vira vídeo", dimensions: "Short: 1080 × 1920 px, até 3 min · Vídeo: 1920 × 1080 px", note: "Título obrigatório; a legenda vira a descrição do vídeo." },
  },
}

const platformNames: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads", X: "X", YOUTUBE: "YouTube", TIKTOK: "TikTok" }
const TEXT_ONLY_NETWORKS = ["THREADS", "X"]
/** Limit of the strictest selected text network (X 280, Threads 500). */
const textLimitFor = (selected: string[]) => selected.includes("X") ? 280 : 500
/** X counts with weighted length (URLs, emoji, CJK); the other networks by code point. */
const textLength = (value: string, selected: string[] = []) => selected.includes("X") ? twitterText.parseTweet(value).weightedLength : Array.from(value).length

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
type ThreadsAccount = { id: string; username: string; name?: string | null; isActive: boolean; workspaceAccountId?: string | null }
type XAccount = { id: string; username: string; name?: string | null; workspaceAccountId?: string | null }
type YouTubeAccount = { id: string; title: string; handle?: string | null; thumbnailUrl?: string | null; subscriberCount?: number | null; workspaceAccountId?: string | null }
type TikTokAccount = { id: string; displayName: string; username?: string | null; avatarUrl?: string | null; workspaceAccountId?: string | null }
type AiPlanItem = { day: string; format: string; topic: string; hook: string; cta: string; suggestedTime: string }
type InstagramAudioTrack = { id: string; title: string; audioType?: string; durationInMs?: number | null; artist?: string | null; creatorUsername?: string | null; coverUrl?: string | null; previewUrl?: string | null; previewLink?: string | null }
type InstagramUserTag = { username: string; x: number; y: number; mediaIndex: number }
type InstagramTrialGraduation = "MANUAL" | "SS_PERFORMANCE"
type InstagramAdvancedSettings = {
  altTexts: string[]; collaborators: string[]; firstComment: string; disableComments: boolean; userTags: InstagramUserTag[]
  locationId: string | null; locationName: string | null
  shareToFeed: boolean; coverUrl: string | null; thumbOffset: number | null; trialGraduation: InstagramTrialGraduation | null
}
type InstagramLocation = { id: string; name: string; city: string | null; state: string | null; country: string | null; street: string | null; verified: boolean }
const reelDefaults = { shareToFeed: true, coverUrl: null, thumbOffset: null, trialGraduation: null } as const
/** Accepts a numeric Page ID or a facebook.com link and returns the numeric ID. */
const parseLocationInput = (value: string) => {
  const text = value.trim()
  if (/^\d{5,25}$/.test(text)) return text
  const match = text.match(/facebook\.com\/(?:[^?#]*?[-/])?(\d{5,25})(?:[/?#]|$)/i) || text.match(/[?&](?:id|place_id|page_id)=(\d{5,25})/i)
  return match ? match[1] : null
}
const formatLocationPlace = (location: InstagramLocation) => [location.city, location.state, location.country].filter(Boolean).join(", ")
type PublishOutcome = { succeeded: string[]; failed: Array<{ platform: string; message: string }>; warnings: Array<{ platform: string; message: string }> }
const emptyInstagramAdvancedSettings = (): InstagramAdvancedSettings => ({ altTexts: [], collaborators: [], firstComment: "", disableComments: false, userTags: [], locationId: null, locationName: null, ...reelDefaults })

const normalizeHashtag = (value: string) => value.replace(/^#+/, "").trim()
const isVideoFile = (file: Pick<File, "type" | "name">) => file.type.toLowerCase().startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(file.name)

const getDefaultDate = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  // datetime-local expects wall-clock values, not UTC. Using toISOString()
  // here shifted the default by three hours for the Brazil deployment.
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function ComposerPage() {
  const t = useT()
  const [caption, setCaption] = useState("")
  const [draftId, setDraftId] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [referenceUrl, setReferenceUrl] = useState("")
  const [editorialBrief, setEditorialBrief] = useState<{ creativeBrief?: string; storyIdea?: string; reason?: string } | null>(null)
  const [postType, setPostType] = useState<PostType>("FEED")
  const [selectedDate, setSelectedDate] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [publishOutcome, setPublishOutcome] = useState<PublishOutcome | null>(null)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [allThreadsAccounts, setThreadsAccounts] = useState<ThreadsAccount[]>([])
  const [accountId, setAccountId] = useState("")
  const [threadsAccountId, setThreadsAccountId] = useState("")
  const [allXAccounts, setXAccounts] = useState<XAccount[]>([])
  const [xAccountId, setXAccountId] = useState("")
  const [allYouTubeAccounts, setYouTubeAccounts] = useState<YouTubeAccount[]>([])
  const [youtubeAccountId, setYouTubeAccountId] = useState("")
  const [youtubeSettings, setYouTubeSettings] = useState<YouTubeSettings>(emptyYouTubeSettings)
  const [allTikTokAccounts, setTikTokAccounts] = useState<TikTokAccount[]>([])
  const [tiktokAccountId, setTikTokAccountId] = useState("")
  const [tiktokSettings, setTikTokSettings] = useState<TikTokSettings>(emptyTikTokSettings)
  const [youtubeThumbnailUploading, setYouTubeThumbnailUploading] = useState(false)
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
  const [isAiGenerated, setIsAiGenerated] = useState(false)
  const [advancedSettings, setAdvancedSettings] = useState<InstagramAdvancedSettings>(emptyInstagramAdvancedSettings)
  const [collaboratorInput, setCollaboratorInput] = useState("")
  const [personTagInput, setPersonTagInput] = useState("")
  const [locationQuery, setLocationQuery] = useState("")
  const [locationResults, setLocationResults] = useState<InstagramLocation[]>([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [locationSearchUnavailable, setLocationSearchUnavailable] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [reelDurationMs, setReelDurationMs] = useState(0)
  const reelFrameRef = useRef<HTMLVideoElement | null>(null)
  const [audioType, setAudioType] = useState<"music" | "original_sound">("music")
  const [audioSearchQuery, setAudioSearchQuery] = useState("")
  const [audioTracks, setAudioTracks] = useState<InstagramAudioTrack[]>([])
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<InstagramAudioTrack | null>(null)
  const [audioSearching, setAudioSearching] = useState(false)
  const [audioVolume, setAudioVolume] = useState(80)
  const [videoVolume, setVideoVolume] = useState(60)
  const [previewingAudioId, setPreviewingAudioId] = useState<string | null>(null)
  const mediaItemsRef = useRef<MediaItem[]>([])
  const audioPreviewRef = useRef<HTMLAudioElement>(null)
  const previousAccountIdRef = useRef(accountId)

  useEffect(() => {
    setSelectedDate(getDefaultDate())
    const requestedDraft = new URLSearchParams(window.location.search).get('draft')
    const requestedReference = new URLSearchParams(window.location.search).get('reference') || ''
    if (/^https:\/\/(www\.)?instagram\.com\//.test(requestedReference)) setReferenceUrl(requestedReference)
    setDraftLoading(!!requestedDraft)
    Promise.all([api.getAccounts(), api.getThreadsAccounts(), requestedDraft ? api.getPost(requestedDraft) : Promise.resolve(null), (api.getXAccounts() as Promise<{ accounts: XAccount[] }>).catch(() => ({ accounts: [] as XAccount[] })), (api.getYouTubeAccounts() as Promise<{ accounts: YouTubeAccount[] }>).catch(() => ({ accounts: [] as YouTubeAccount[] }))])
      .then(([instagramAccounts, threadAccounts, draft, xPayload, youtubePayload]) => {
        const nextX = xPayload.accounts || []
        setXAccounts(nextX)
        const nextYouTube = youtubePayload.accounts || []
        setYouTubeAccounts(nextYouTube)
        const nextAccounts = (instagramAccounts as ConnectedAccount[]).filter((account) => account.isActive)
        const nextThreads = (threadAccounts as ThreadsAccount[]).filter((account) => account.isActive)
        setAccounts(nextAccounts)
        setThreadsAccounts(nextThreads)
        if (!requestedDraft) setPlatforms(nextAccounts.length ? ["INSTAGRAM"] : [])
        const storedAccountId = window.localStorage.getItem("instacommand_active_account")
        if (nextAccounts.length) setAccountId(nextAccounts.find((account) => account.id === storedAccountId)?.id || nextAccounts[0].id)
        if (draft) {
          if (!['DRAFT', 'FAILED'].includes(draft.status)) throw new Error(t('Cancele o agendamento antes de editar. Publicações concluídas não podem ser editadas aqui.'))
          if (!nextAccounts.some(a => a.id === draft.accountId)) throw new Error(t('A conta deste rascunho não está ativa.'))
          setDraftId(draft.id); setAccountId(draft.accountId); selectAccount(draft.accountId)
          setCaption(draft.caption || ''); setHashtags(draft.hashtags || []); setPlatforms(draft.platforms || ['INSTAGRAM'])
          setThreadsAccountId(draft.threadsAccountId || ''); if (draft.xAccountId) setXAccountId(draft.xAccountId); if (draft.youtubeAccountId) setYouTubeAccountId(draft.youtubeAccountId); if (draft.tiktokAccountId) setTikTokAccountId(draft.tiktokAccountId)
          if (draft.youtubeSettings) setYouTubeSettings({ ...emptyYouTubeSettings(), ...draft.youtubeSettings }); if (draft.tiktokSettings) setTikTokSettings({ ...emptyTikTokSettings(), ...draft.tiktokSettings }); setPostType(draft.mediaType === 'IMAGE' ? 'FEED' : draft.mediaType)
          setEditorialBrief(draft.editorialBrief || null)
          setIsAiGenerated(draft.isAiGenerated === true)
          const savedAdvanced = draft.advancedSettings as Partial<InstagramAdvancedSettings> | null
          if (savedAdvanced) setAdvancedSettings({
            ...emptyInstagramAdvancedSettings(),
            ...savedAdvanced,
            altTexts: Array.isArray(savedAdvanced.altTexts) ? savedAdvanced.altTexts : [],
            collaborators: Array.isArray(savedAdvanced.collaborators) ? savedAdvanced.collaborators : [],
            userTags: Array.isArray(savedAdvanced.userTags) ? savedAdvanced.userTags : [],
          })
          if (draft.instagramAudioId) {
            setSelectedAudioTrack({ id: draft.instagramAudioId, title: draft.instagramAudioTitle || t('Áudio selecionado'), artist: draft.instagramAudioArtist || null })
            setAudioVolume(Number.isInteger(draft.instagramAudioVolume) ? draft.instagramAudioVolume : 80)
            setVideoVolume(Number.isInteger(draft.instagramVideoVolume) ? draft.instagramVideoVolume : 60)
          }
          const date = new Date(draft.scheduledFor); const pad = (v: number) => String(v).padStart(2, '0')
          setSelectedDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`)
          setMediaItems((draft.mediaUrls || []).map((src: string, i: number) => ({ id: `saved-${i}`, src, name: t("Mídia {n}", { n: i + 1 }), kind: isVideoUrl(src) ? 'video' : 'image', isObjectUrl: false })))
        }
      })
      .catch((error) => {
        if (requestedDraft) setDraftError(error instanceof Error ? error.message : t('Não foi possível abrir o rascunho.'))
        toast.error(error instanceof Error ? error.message : t("Entre na plataforma e conecte uma conta antes de criar uma publicação."))
      })
      .finally(() => setDraftLoading(false))
  }, [])

  // Threads, X and YouTube profiles of the selected company only: a post never goes to another company's profile.
  const threadsAccounts = ofCompany(allThreadsAccounts, accountId)
  const xAccounts = ofCompany(allXAccounts, accountId)
  const youtubeAccounts = ofCompany(allYouTubeAccounts, accountId)
  // TikTok profiles load on their own so the composer never waits for (or breaks on) TikTok.
  useEffect(() => {
    (api.getTikTokAccounts() as Promise<{ accounts?: TikTokAccount[] }>).then((payload) => setTikTokAccounts(payload.accounts || [])).catch(() => setTikTokAccounts([]))
  }, [])
  const tiktokAccounts = ofCompany(allTikTokAccounts, accountId)
  useEffect(() => {
    if (draftLoading) return
    const keep = (current: string, list: Array<{ id: string }>) => list.some(item => item.id === current) ? current : list[0]?.id || ""
    setThreadsAccountId(current => keep(current, threadsAccounts))
    setXAccountId(current => keep(current, xAccounts))
    setYouTubeAccountId(current => keep(current, youtubeAccounts))
    setTikTokAccountId(current => keep(current, tiktokAccounts))
    const available = (platform: string) => platform === "THREADS" ? threadsAccounts.length > 0 : platform === "X" ? xAccounts.length > 0 : platform === "YOUTUBE" ? youtubeAccounts.length > 0 : platform === "TIKTOK" ? tiktokAccounts.length > 0 : true
    setPlatforms(current => current.every(available) ? current : current.filter(available))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, allThreadsAccounts, allXAccounts, allYouTubeAccounts, allTikTokAccounts, draftLoading])

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
    if (previousAccountIdRef.current && accountId && previousAccountIdRef.current !== accountId) {
      audioPreviewRef.current?.pause()
      setSelectedAudioTrack(null)
      setAudioTracks([])
      setPreviewingAudioId(null)
    }
    previousAccountIdRef.current = accountId
  }, [accountId])

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
      audioPreviewRef.current?.pause()
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
        toast.error(t("Alguns arquivos foram rejeitados. Use imagens ou vídeos de até 100MB."))
      }

      const kinds = acceptedKinds(postType, platforms)
      const refused = acceptedFiles.filter(file => !kinds.includes(isVideoFile(file) ? "video" : "image"))
      if (refused.length) {
        toast.error(kinds.length === 1 && kinds[0] === "video" ? t("Este formato usa vídeo. Para fotos, volte e escolha Foto única ou Carrossel.") : postType === "CAROUSEL" ? t("No Facebook, o álbum aceita só fotos. Desmarque o Facebook para usar vídeos no carrossel.") : t("Este formato usa imagem. Para vídeo, volte e escolha o formato Vídeo."))
        acceptedFiles = acceptedFiles.filter(file => !refused.includes(file))
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
          toast.error(t("O carrossel já está completo. Remova uma mídia para adicionar outra."))
          return
        }

        setMediaItems(current => [...current, ...itemsToAdd])
        setAdvancedSettings(current => ({ ...current, altTexts: [...current.altTexts.slice(0, mediaItems.length), ...itemsToAdd.map(() => "")] }))
        toast.success(itemsToAdd.length === 1 ? t("1 mídia adicionada ao carrossel") : t("{count} mídias adicionadas ao carrossel", { count: itemsToAdd.length }))
        return
      }

      const nextItem = incomingItems[0]
      incomingItems.slice(1).forEach(item => URL.revokeObjectURL(item.src))
      mediaItems.forEach(item => {
        if (item.isObjectUrl) URL.revokeObjectURL(item.src)
      })
      setMediaItems([nextItem])
      setActiveMediaIndex(0)
      setAdvancedSettings(current => ({ ...current, altTexts: [""] , userTags: [] }))
      toast.success(t("Mídia carregada: {name}", { name: nextItem.name }))
    },
  })

  const activeMedia = mediaItems[activeMediaIndex] ?? null
  const formatConflicts = incompatiblePlatforms(postType, platforms)
  const compatibilityProblems = publishProblems({ format: postType, platforms, media: mediaItems, youtubeFormat: youtubeSettings.format })
  const selectedAccount = accounts.find((account) => account.id === accountId)
  const resolvedPreviewPlatform = postType === "TEXT" ? (previewPlatform === "X" || !platforms.includes("THREADS") ? "X" : "THREADS") : previewPlatform
  const selectedXAccount = xAccounts.find((account) => account.id === xAccountId)
  const selectedYouTubeAccount = youtubeAccounts.find((account) => account.id === youtubeAccountId)
  const selectedTikTokAccount = tiktokAccounts.find((account) => account.id === tiktokAccountId)
  const tiktokCreator = useTikTokCreatorInfo(platforms.includes("TIKTOK") ? selectedTikTokAccount?.id : undefined)
  const previewDescription = {
    FEED: t("Prévia da publicação única no feed, sem faixa de Stories."),
    CAROUSEL: t("Prévia do carrossel no feed, com navegação entre os itens."),
    REEL: resolvedPreviewPlatform === "INSTAGRAM" ? t("Prévia vertical da experiência de Reels.") : resolvedPreviewPlatform === "YOUTUBE" ? (youtubeSettings.format === "short" ? t("Prévia do Short no player do YouTube.") : t("Prévia da página do vídeo e do card na busca do YouTube.")) : t("Prévia do vídeo em {network}.", { network: platformNames[resolvedPreviewPlatform] || resolvedPreviewPlatform }),
    STORY: resolvedPreviewPlatform === "FACEBOOK" ? t("Prévia visual da interface de Facebook Stories.") : t("Prévia vertical de Story em tela cheia."),
    TEXT: t("Prévia clara do post de texto no Threads."),
  }[postType]
  const connectedPlatforms = [
    ...(selectedAccount ? ["INSTAGRAM"] : []),
    ...(selectedAccount?.pageName ? ["FACEBOOK"] : []),
    ...(threadsAccounts.length ? ["THREADS"] : []),
    ...(xAccounts.length ? ["X"] : []),
    ...(youtubeAccounts.length ? ["YOUTUBE"] : []),
    ...(tiktokAccounts.length ? ["TIKTOK"] : []),
  ]
  const compatiblePlatformsFor = (format: PostType) => {
    const connected = connectedPlatforms.filter((platform) => formatPlatforms[format].includes(platform))
    const selected = platforms.filter((platform) => connected.includes(platform))
    return selected.length ? selected : connected
  }

  const changePostType = (nextType: PostType) => {
    const sameType = postType === nextType
    if (sameType && !incompatiblePlatforms(nextType, platforms).length) return

    const nextPlatforms = compatiblePlatformsFor(nextType)
    if (!nextPlatforms.length) {
      setStep(1)
      toast.error(nextType === "TEXT"
        ? t("Conecte uma conta do Threads ou do X para usar publicação somente de texto.")
        : nextType === "STORY"
          ? t("Conecte uma conta profissional do Instagram para publicar Stories.")
          : t("Conecte uma conta compatível com este formato."))
      return
    }

    const destinationsChanged = nextPlatforms.length !== platforms.length || nextPlatforms.some((platform, index) => platform !== platforms[index])
    if (destinationsChanged) setPlatforms(nextPlatforms)
    setPostType(nextType)
    if (!['FEED', 'CAROUSEL', 'REEL'].includes(nextType)) {
      setAdvancedSettings(current => ({ ...current, collaborators: [], firstComment: "", disableComments: false, userTags: [], altTexts: [], locationId: null, locationName: null, ...reelDefaults }))
    } else if (nextType === 'REEL') {
      setAdvancedSettings(current => ({ ...current, userTags: [], altTexts: [] }))
    } else if (nextType === 'CAROUSEL') {
      setAdvancedSettings(current => ({ ...current, altTexts: [], userTags: [], ...reelDefaults }))
    } else if (nextType === 'FEED') {
      setAdvancedSettings(current => ({ ...current, altTexts: [], userTags: [], ...reelDefaults }))
    }
    if (nextType !== "REEL") {
      setSelectedAudioTrack(null)
      setAudioTracks([])
      setPreviewingAudioId(null)
      audioPreviewRef.current?.pause()
    }
    if (nextType === "TEXT") {
      setThreadsAccountId(current => current || threadsAccounts[0]?.id || "")
      setXAccountId(current => current || xAccounts[0]?.id || "")
      setPreviewPlatform(nextPlatforms.includes("THREADS") ? "THREADS" : "X")
    } else if (!nextPlatforms.includes(previewPlatform)) setPreviewPlatform(nextPlatforms[0])

    if (sameType) {
      // Same format: keep the media, only the destinations change.
    } else if (nextType === "TEXT" || nextType === "STORY" || nextType === "REEL" || nextType === "FEED") {
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
        ? t(nextType === "STORY" ? "Story ajustado para {networks}; destinos incompatíveis removidos." : nextType === "TEXT" ? "Post de texto ajustado para {networks}; destinos incompatíveis removidos." : "Formato ajustado para {networks}; destinos incompatíveis removidos.", { networks: nextPlatforms.map((platform) => platformNames[platform] || platform).join(t(" e ")) })
        : t("Destino ajustado para {networks}.", { networks: nextPlatforms.map((platform) => platformNames[platform] || platform).join(t(" e ")) }))
    }
  }

  const removeMedia = (id: string) => {
    const itemToRemove = mediaItems.find(item => item.id === id)
    if (itemToRemove?.isObjectUrl) URL.revokeObjectURL(itemToRemove.src)

    const nextItems = mediaItems.filter(item => item.id !== id)
    setMediaItems(nextItems)
    const removedIndex = mediaItems.findIndex(item => item.id === id)
    setAdvancedSettings(current => ({
      ...current,
      altTexts: current.altTexts.filter((_, index) => index !== removedIndex),
      userTags: current.userTags.flatMap(tag => tag.mediaIndex === removedIndex ? [] : [{ ...tag, mediaIndex: tag.mediaIndex > removedIndex ? tag.mediaIndex - 1 : tag.mediaIndex }]),
    }))
    setActiveMediaIndex(current => Math.min(current, Math.max(0, nextItems.length - 1)))
  }

  const moveActiveMedia = (direction: -1 | 1) => {
    const targetIndex = activeMediaIndex + direction
    if (targetIndex < 0 || targetIndex >= mediaItems.length) return

    const nextItems = [...mediaItems]
    ;[nextItems[activeMediaIndex], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[activeMediaIndex]]
    setMediaItems(nextItems)
    setAdvancedSettings(current => {
      const altTexts = [...current.altTexts]
      ;[altTexts[activeMediaIndex], altTexts[targetIndex]] = [altTexts[targetIndex], altTexts[activeMediaIndex]]
      const userTags = current.userTags.map(tag => tag.mediaIndex === activeMediaIndex
        ? { ...tag, mediaIndex: targetIndex }
        : tag.mediaIndex === targetIndex ? { ...tag, mediaIndex: activeMediaIndex } : tag)
      return { ...current, altTexts, userTags }
    })
    setActiveMediaIndex(targetIndex)
  }

  const addHashtag = () => {
    const clean = normalizeHashtag(tagInput)
    if (!clean) return
    if (!/^[\w\u00c0-\u024f]+$/i.test(clean)) {
      toast.error(t("Use uma hashtag por vez, sem espaços ou pontuação."))
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

  const speakCaption = () => {
    if (!caption.trim()) { toast.error(t("Escreva uma legenda antes de ouvir a prévia.")); return }
    if (!("speechSynthesis" in window)) { toast.error(t("Seu navegador não oferece leitura de texto.")); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(caption)
    utterance.lang = "pt-BR"
    window.speechSynthesis.speak(utterance)
  }

  const improveCaption = async () => {
    if (!caption.trim()) { toast.error(t("Escreva um texto antes de pedir uma melhoria.")); return }
    setAiTopic(caption)
    setAiLoading(true)
    try {
      const response = await api.generateAi({ mode: "caption", accountId: accountId || undefined, topic: caption, audience: aiAudience || undefined, tone: aiTone, objective: aiObjective, mediaType: postType, platforms }) as { result?: { caption?: string; hashtags?: string[] } }
      if (response.result?.caption) setCaption(response.result.caption)
      if (response.result?.hashtags) setHashtags(response.result.hashtags.map(tag => tag.replace(/^#/, "")).filter(Boolean).slice(0, 8))
      toast.success(t("Texto revisado. Confira antes de publicar."))
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Não foi possível melhorar o texto.")) }
    finally { setAiLoading(false) }
  }

  /** Choosing a YouTube format also moves the post to video and shows the YouTube preview. */
  const chooseYouTubeFormat = (format: YouTubeFormat) => {
    if (postType !== "REEL") changePostType("REEL")
    setYouTubeSettings(current => ({ ...current, format }))
    setPreviewPlatform("YOUTUBE")
  }

  const selectAllPlatforms = () => {
    const missing = connectedPlatforms.filter(platform => !platforms.includes(platform))
    if (missing.length) setPlatforms([...platforms, ...missing])
  }

  const togglePlatform = (platform: string) => {
    const nextPlatforms = platforms.includes(platform)
      ? platforms.filter((item) => item !== platform)
      : [...platforms, platform]
    // The format is chosen in step 2, where networks that cannot take it are pointed out.
    if (!nextPlatforms.includes("YOUTUBE")) setYouTubeSettings(emptyYouTubeSettings())
    if (!nextPlatforms.includes("TIKTOK")) setTikTokSettings(emptyTikTokSettings())
    if (!nextPlatforms.includes("INSTAGRAM")) {
      setIsAiGenerated(false)
      setAdvancedSettings(emptyInstagramAdvancedSettings())
      setSelectedAudioTrack(null)
      setAudioTracks([])
      setPreviewingAudioId(null)
      audioPreviewRef.current?.pause()
    }
    setPlatforms(nextPlatforms)
    if (!nextPlatforms.includes(previewPlatform)) setPreviewPlatform(nextPlatforms[0] || "INSTAGRAM")
  }

  const searchInstagramAudio = async () => {
    if (!accountId || !platforms.includes("INSTAGRAM") || postType !== "REEL") {
      toast.error(t("A biblioteca de áudio está disponível para Reels do Instagram."))
      return
    }
    setAudioSearching(true)
    try {
      const response = await api.searchInstagramAudio(accountId, audioType, audioSearchQuery.trim()) as { items?: InstagramAudioTrack[] }
      setAudioTracks(Array.isArray(response.items) ? response.items : [])
      if (!response.items?.length) toast(t("Não encontrei faixas para essa busca. Tente outro termo ou veja os áudios em alta."))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível buscar áudios do Instagram."))
      setAudioTracks([])
    } finally {
      setAudioSearching(false)
    }
  }

  const toggleAudioPreview = async (track: InstagramAudioTrack) => {
    const player = audioPreviewRef.current
    if (!player || !track.previewUrl) {
      toast(t("A Meta não forneceu uma prévia de áudio para esta faixa."))
      return
    }
    if (previewingAudioId === track.id) {
      player.pause()
      setPreviewingAudioId(null)
      return
    }
    player.pause()
    player.src = track.previewUrl
    player.currentTime = 0
    player.volume = audioVolume / 100
    try {
      await player.play()
      setPreviewingAudioId(track.id)
    } catch {
      setPreviewingAudioId(null)
      toast.error(t("Não foi possível reproduzir a prévia dessa faixa."))
    }
  }

  const searchLocations = async () => {
    const query = locationQuery.trim()
    if (query.length < 2) { toast.error(t("Digite pelo menos 2 letras do local.")); return }
    if (!accountId) { toast.error(t("Selecione uma conta do Instagram.")); return }
    setLocationLoading(true); setLocationMessage(null)
    try {
      const response = await api.searchInstagramLocations(accountId, query) as { items?: InstagramLocation[]; unavailable?: boolean; message?: string | null }
      setLocationResults(response.items || [])
      setLocationSearchUnavailable(response.unavailable === true)
      setLocationMessage(response.message || null)
    } catch (error) {
      setLocationResults([])
      setLocationMessage(error instanceof Error ? error.message : t("Não foi possível buscar locais agora."))
    } finally {
      setLocationLoading(false)
    }
  }

  const chooseLocation = (location: InstagramLocation) => {
    const place = formatLocationPlace(location)
    setAdvancedSettings(current => ({ ...current, locationId: location.id, locationName: place ? `${location.name}, ${place}` : location.name }))
    setLocationResults([]); setLocationQuery(""); setLocationMessage(null)
  }

  const applyManualLocation = () => {
    const id = parseLocationInput(locationQuery)
    if (!id) { toast.error(t("Cole o ID numérico ou o link da Página do Facebook do local.")); return }
    setAdvancedSettings(current => ({ ...current, locationId: id, locationName: current.locationId === id ? current.locationName : t("Local {id}", { id }) }))
    setLocationResults([]); setLocationQuery(""); setLocationMessage(null)
  }

  const uploadReelCover = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) { toast.error(t("A capa precisa ser uma imagem (JPG ou PNG).")); return }
    setCoverUploading(true)
    try {
      const response = await api.uploadMedia([file]) as { urls: string[] }
      if (!response.urls?.[0]) throw new Error(t("O envio da capa não retornou um link."))
      setAdvancedSettings(current => ({ ...current, coverUrl: response.urls[0], thumbOffset: null }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível enviar a capa."))
    } finally {
      setCoverUploading(false)
    }
  }

  const uploadYouTubeThumbnail = async (file: File | undefined) => {
    if (!file) return
    if (!["image/jpeg", "image/png"].includes(file.type)) { toast.error(t("A miniatura precisa ser JPG ou PNG.")); return }
    if (file.size > 2 * 1024 * 1024) { toast.error(t("A miniatura do YouTube pode ter até 2 MB.")); return }
    setYouTubeThumbnailUploading(true)
    try {
      const response = await api.uploadMedia([file]) as { urls: string[] }
      if (!response.urls?.[0]) throw new Error(t("O envio da miniatura não retornou um link."))
      setYouTubeSettings(current => ({ ...current, thumbnailUrl: response.urls[0] }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível enviar a miniatura."))
    } finally {
      setYouTubeThumbnailUploading(false)
    }
  }

  /** Problem that keeps the YouTube upload from being accepted, or null when it is ready. */
  const youtubeProblem = (text: string) => {
    if (!platforms.includes("YOUTUBE")) return null
    if (!selectedYouTubeAccount) return t("Conecte um canal do YouTube ou remova o YouTube da seleção.")
    if (postType !== "REEL" || mediaItems.length !== 1 || mediaItems[0].kind !== "video") return t("O YouTube publica somente um vídeo. Use o formato de vídeo ou desmarque o YouTube.")
    const mediaProblem = youtubeMediaProblem(youtubeSettings.format, mediaItems[0])
    if (mediaProblem) return mediaProblem
    if (!youtubeSettings.title.trim()) return t("Escreva o título do vídeo para o YouTube.")
    if (/[<>]/.test(youtubeSettings.title)) return t("O título do YouTube não pode conter < ou >.")
    if (youtubeSettings.madeForKids === null) return t("Informe se o vídeo do YouTube é feito para crianças.")
    if (youtubeSettings.newPlaylist && !youtubeSettings.newPlaylist.title.trim()) return t("Dê um nome à nova playlist do YouTube ou cancele a criação.")
    if (/[<>]/.test(text)) return t("O YouTube não aceita < ou > na descrição. Remova esses caracteres ou desmarque o YouTube.")
    return null
  }

  const addCollaborator = () => {
    const username = collaboratorInput.trim().replace(/^@+/, "").toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/i.test(username)) { toast.error(t("Digite um @usuário válido do Instagram.")); return }
    if (advancedSettings.collaborators.includes(username)) { setCollaboratorInput(""); return }
    if (advancedSettings.collaborators.length >= 3) { toast.error(t("A Meta permite até 3 colaboradores nesta publicação.")); return }
    setAdvancedSettings(current => ({ ...current, collaborators: [...current.collaborators, username] }))
    setCollaboratorInput("")
  }

  const addPersonTagAtPosition = (event: MouseEvent<HTMLSpanElement>) => {
    const username = personTagInput.trim().replace(/^@+/, "").toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/i.test(username)) { toast.error(t("Digite um @usuário válido antes de clicar na foto.")); return }
    if (advancedSettings.userTags.length >= 20) { toast.error(t("A Meta permite até 20 marcações nesta publicação.")); return }
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    if (advancedSettings.userTags.some(tag => tag.username === username && tag.mediaIndex === activeMediaIndex)) {
      toast(t("Esse perfil já está marcado neste item."))
      return
    }
    setAdvancedSettings(current => ({ ...current, userTags: [...current.userTags, { username, x, y, mediaIndex: activeMediaIndex }] }))
    setPersonTagInput("")
  }

  const addPersonTagAtCenter = () => {
    const username = personTagInput.trim().replace(/^@+/, "").toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/i.test(username)) { toast.error(t("Digite um @usuário válido antes de marcar.")); return }
    if (advancedSettings.userTags.length >= 20) { toast.error(t("A Meta permite até 20 marcações nesta publicação.")); return }
    if (advancedSettings.userTags.some(tag => tag.username === username && tag.mediaIndex === activeMediaIndex)) { toast(t("Esse perfil já está marcado neste item.")); return }
    setAdvancedSettings(current => ({ ...current, userTags: [...current.userTags, { username, x: 0.5, y: 0.5, mediaIndex: activeMediaIndex }] }))
    setPersonTagInput("")
  }

  const removePersonTag = (tagIndex: number) => setAdvancedSettings(current => ({
    ...current,
    userTags: current.userTags.filter((_, index) => index !== tagIndex),
  }))

  const generateWithAi = async (mode: "caption" | "plan") => {
    if (!aiTopic.trim()) {
      toast.error(t("Diga para a IA qual é o assunto do conteúdo."))
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
        toast.success(t("Legenda, CTA e hashtags gerados pela IA."))
      } else {
        setAiPlan(Array.isArray(result.plan) ? result.plan : [])
        toast.success(t("Plano editorial de 7 dias gerado."))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível usar o assistente de IA."))
    } finally {
      setAiLoading(false)
    }
  }

  const submitPost = async (mode: "publish" | "schedule") => {
    const textOnlyThreads = postType === "TEXT" && platforms.length > 0 && platforms.every((platform) => TEXT_ONLY_NETWORKS.includes(platform))
    const textLimit = textLimitFor(platforms)
    if (postType === "TEXT" && !textOnlyThreads) {
      toast.error(t("Post de texto sem mídia só pode ser publicado no Threads e no X."))
      return
    }
    if (mediaItems.length === 0 && !textOnlyThreads) {
      toast.error(mode === "publish" ? t("Adicione pelo menos uma imagem ou vídeo antes de publicar.") : t("Adicione pelo menos uma imagem ou vídeo antes de agendar."))
      return
    }
    if (textOnlyThreads && !caption.trim()) {
      toast.error(t("Escreva um texto antes de publicar só texto."))
      return
    }
    if (!accountId) {
      toast.error(t("Conecte uma conta do Instagram antes de continuar."))
      return
    }
    if (!platforms.length) {
      toast.error(t("Selecione pelo menos uma plataforma de publicação."))
      return
    }
    if (platforms.includes("THREADS") && !threadsAccountId) {
      toast.error(t("Conecte uma conta do Threads ou remova o Threads da seleção."))
      return
    }
    if (platforms.includes("X") && !selectedXAccount) {
      toast.error(t("Conecte uma conta do X ou remova o X da seleção."))
      return
    }
    if (compatibilityProblems.length) {
      toast.error(compatibilityProblems[0])
      return
    }
    if (platforms.includes("X") && mediaItems.length > 4) {
      toast.error(t("O X aceita até 4 mídias por post. Remova mídias ou desmarque o X."))
      return
    }
    const youtubeError = youtubeProblem(caption)
    if (youtubeError) {
      toast.error(youtubeError)
      return
    }
    if (platforms.includes("TIKTOK")) {
      const tiktokError = !selectedTikTokAccount ? t("Conecte o perfil do TikTok desta empresa ou desmarque o TikTok.") : tiktokProblem(tiktokSettings, tiktokCreator.data, mediaItems[0] ?? null)
      if (tiktokError) { toast.error(tiktokError); return }
    }
    if (postType === "CAROUSEL" && mediaItems.length < 2) {
      toast.error(t("Um carrossel precisa ter pelo menos duas mídias."))
      return
    }
    if (postType === "FEED" && mediaItems.some((item) => item.kind !== "image")) {
      toast.error(t("Foto única aceita apenas uma imagem. Para vídeos, escolha o formato de vídeo/Reel."))
      return
    }
    if ((textOnlyThreads || platforms.includes("X")) && textLength(caption, platforms) > textLimit) {
      toast.error(platforms.includes("X") ? t("O X tem limite de 280 caracteres.") : t("O texto do Threads tem limite de 500 caracteres."))
      return
    }
    if (postType === "REEL" && mediaItems.some((item) => item.kind !== "video")) {
      toast.error(t("Reels precisam usar um vídeo."))
      return
    }
    if (postType === "STORY" && platforms.some((platform) => platform !== "INSTAGRAM")) {
      toast.error(t("Stories só podem ser publicados pelo Instagram neste sistema."))
      return
    }
    if (platforms.includes("FACEBOOK") && !selectedAccount?.pageName) {
      toast.error(t("A conta selecionada não tem uma Página do Facebook vinculada."))
      return
    }
    const scheduledFor = mode === "publish" ? new Date() : new Date(selectedDate)
    if (Number.isNaN(scheduledFor.getTime()) || (mode === "schedule" && scheduledFor <= new Date())) {
      toast.error(t("Escolha uma data futura válida para o agendamento."))
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
      if ((textOnlyThreads || platforms.includes("X")) && textLength(finalCaption, platforms) > textLimit) {
        toast.error(t(platforms.includes("X") ? "Texto e hashtags juntos ultrapassam o limite de {limit} caracteres do X." : "Texto e hashtags juntos ultrapassam o limite de {limit} caracteres do Threads.", { limit: textLimit }))
        return
      }
      const payload = {
        accountId,
        threadsAccountId: platforms.includes("THREADS") ? threadsAccountId : undefined,
        xAccountId: platforms.includes("X") ? selectedXAccount?.id : undefined,
        youtubeAccountId: platforms.includes("YOUTUBE") ? selectedYouTubeAccount?.id : undefined,
        youtubeSettings: platforms.includes("YOUTUBE") ? youtubeSettings : undefined,
        tiktokAccountId: platforms.includes("TIKTOK") ? selectedTikTokAccount?.id : undefined,
        tiktokSettings: platforms.includes("TIKTOK") ? tiktokSettings : undefined,
        mediaType: postType === "FEED" ? "IMAGE" : postType,
        mediaUrls,
        caption: finalCaption,
        hashtags,
        platforms,
        isAiGenerated: platforms.includes("INSTAGRAM") && isAiGenerated,
        instagramAudioId: postType === "REEL" && platforms.includes("INSTAGRAM") ? selectedAudioTrack?.id ?? null : null,
        instagramAudioTitle: selectedAudioTrack?.title ?? null,
        instagramAudioArtist: selectedAudioTrack?.artist ?? null,
        instagramAudioVolume: audioVolume,
        instagramVideoVolume: videoVolume,
        advancedSettings,
        scheduledFor: scheduledFor.toISOString(),
        status: mode === "schedule" ? "SCHEDULED" : "DRAFT",
      }
      const created = (draftId ? await api.updatePost(draftId, payload) : await api.createPost(payload)) as { id: string }

      let publishSummary: { succeeded?: string[]; failed?: { platform: string; message: string }[]; warnings?: { platform: string; message: string }[] } | undefined
      if (mode === "publish") {
        publishWasRequested = true
        const result = await api.publishPost(created.id) as { publishSummary?: typeof publishSummary }
        publishSummary = result.publishSummary
        setPublishOutcome({ succeeded: publishSummary?.succeeded || [], failed: publishSummary?.failed || [], warnings: publishSummary?.warnings || [] })
      }
      if (mode === "schedule") {
        toast.success(t("Publicação agendada com sucesso."))
      } else if (publishSummary?.failed?.length) {
        const succeeded = (publishSummary.succeeded || []).map((platform) => platformNames[platform] || platform)
        const failed = publishSummary.failed.map(({ platform, message }) => `${platformNames[platform] || platform}: ${message}`)
        toast.error((succeeded.length ? t("Publicado em {networks}.", { networks: succeeded.join(", ") }) + " " : "") + t("Falhou em {errors}.", { errors: failed.join("; ") }))
      } else if (publishSummary?.succeeded?.length === platforms.length) {
        toast.success(t("Publicado em {networks}.", { networks: publishSummary.succeeded.map((platform) => platformNames[platform] || platform).join(", ") }))
      } else {
        toast.success(t("Solicitação de publicação concluída. Confira o resultado no calendário."))
      }
      if (mode === "publish") {
        setDraftId(''); setEditorialBrief(null); window.history.replaceState(null, '', '/composer')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Não foi possível concluir a publicação.")
      if (publishWasRequested) {
        const platformErrors = message.split(" | ").map((entry) => {
          const separator = entry.indexOf(":")
          return separator > 0 ? { platform: entry.slice(0, separator).trim().toUpperCase(), message: entry.slice(separator + 1).trim() } : null
        }).filter((entry): entry is { platform: string; message: string } => Boolean(entry))
        setPublishOutcome({ succeeded: [], failed: platforms.map(platform => ({ platform, message: platformErrors.find(item => item.platform === platform)?.message || message })), warnings: [] })
      }
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveDraftChanges = async () => {
    if (isSubmitting) return
    if (!accountId) { toast.error(t('Selecione uma conta antes de salvar.')); return }
    const textOnlyThreads = postType === 'TEXT' && platforms.length > 0 && platforms.every((platform) => TEXT_ONLY_NETWORKS.includes(platform))
    if (!draftId && !mediaItems.length && !textOnlyThreads) { toast.error(t('Adicione uma mídia ou escolha Post de texto (Threads ou X) antes de criar este rascunho.')); return }
    if (textOnlyThreads && !caption.trim()) { toast.error(t('Escreva o texto do post antes de salvar.')); return }
    const draftText = [caption.trim(), hashtags.map((tag) => `#${tag}`).join(' ')].filter(Boolean).join('\n\n')
    if ((textOnlyThreads || platforms.includes('X')) && textLength(draftText, platforms) > textLimitFor(platforms)) { toast.error(t(platforms.includes('X') ? 'Texto e hashtags passam do limite de {limit} caracteres do X.' : 'Texto e hashtags passam do limite de {limit} caracteres.', { limit: textLimitFor(platforms) })); return }
    setIsSubmitting(true)
    try {
      const files = mediaItems.flatMap(item => item.file ? [item.file] : [])
      const upload = files.length ? await api.uploadMedia(files) as { urls: string[] } : { urls: [] }
      let index = 0
      const urls = mediaItems.map(item => item.file ? upload.urls[index++] : item.src)
      const data = { caption, hashtags, mediaUrls: urls, mediaType: postType === 'FEED' ? 'IMAGE' : postType,
        platforms, threadsAccountId: platforms.includes('THREADS') ? threadsAccountId : null, xAccountId: platforms.includes('X') ? selectedXAccount?.id ?? null : null,
        youtubeAccountId: platforms.includes('YOUTUBE') ? selectedYouTubeAccount?.id ?? null : null, youtubeSettings: platforms.includes('YOUTUBE') ? youtubeSettings : null, tiktokAccountId: platforms.includes('TIKTOK') ? selectedTikTokAccount?.id ?? null : null, tiktokSettings: platforms.includes('TIKTOK') ? tiktokSettings : null, status: 'DRAFT',
        isAiGenerated: platforms.includes('INSTAGRAM') && isAiGenerated,
        instagramAudioId: postType === 'REEL' && platforms.includes('INSTAGRAM') ? selectedAudioTrack?.id ?? null : null,
        instagramAudioTitle: selectedAudioTrack?.title ?? null,
        instagramAudioArtist: selectedAudioTrack?.artist ?? null,
        instagramAudioVolume: audioVolume,
        instagramVideoVolume: videoVolume,
        advancedSettings }
      const saved = draftId ? await api.updatePost(draftId, data) : await api.createPost({ ...data, accountId, scheduledFor: new Date(selectedDate || Date.now()).toISOString() })
      setDraftId(saved.id)
      window.history.replaceState(null, '', `/composer?draft=${encodeURIComponent(saved.id)}`)
      setMediaItems(current => current.map((item, i) => { if (item.isObjectUrl) URL.revokeObjectURL(item.src); return { ...item, src: urls[i], file: undefined, isObjectUrl: false } }))
      toast.success(t('Rascunho atualizado. Nada foi publicado ou agendado.'))
    } catch (error) { toast.error(error instanceof Error ? error.message : t('Não foi possível salvar o rascunho.')) }
    finally { setIsSubmitting(false) }
  }

  if (draftLoading) return <p role="status">{t("Abrindo rascunho salvo...")}</p>
  if (draftError) return <Card className="p-6"><p role="alert">{draftError}</p><a href="/calendar" className="text-indigo-700 underline">{t("Voltar ao calendário")}</a></Card>
  if (publishOutcome) {
    const allSucceeded = publishOutcome.succeeded.length > 0 && publishOutcome.failed.length === 0
    const hasPartialSuccess = publishOutcome.succeeded.length > 0 && publishOutcome.failed.length > 0
    const startAnother = () => {
      mediaItems.forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
      setPublishOutcome(null); setStep(1); setCaption(""); setHashtags([]); setTagInput(""); setMediaItems([]); setActiveMediaIndex(0); setDraftId(""); setEditorialBrief(null)
      setIsAiGenerated(false); setAdvancedSettings(emptyInstagramAdvancedSettings()); setYouTubeSettings(emptyYouTubeSettings()); setTikTokSettings(emptyTikTokSettings()); setCollaboratorInput(""); setPersonTagInput(""); setSelectedAudioTrack(null); setAudioTracks([]); setAudioSearchQuery(""); setPreviewingAudioId(null); audioPreviewRef.current?.pause()
    }
    return <main className="mx-auto flex min-h-[65vh] w-full max-w-2xl items-center justify-center px-3 py-8">
      <Card className="w-full overflow-hidden rounded-3xl border-slate-200 shadow-sm">
        <div className={`h-2 w-full ${allSucceeded ? "bg-emerald-500" : hasPartialSuccess ? "bg-amber-400" : "bg-rose-500"}`} />
        <div className="px-6 py-9 text-center sm:px-10">
          <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${allSucceeded ? "bg-emerald-50 text-emerald-600" : hasPartialSuccess ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>
            {allSucceeded ? <BadgeCheck size={34} /> : hasPartialSuccess ? <Send size={30} /> : <XCircle size={32} />}
          </span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">{t("Resultado da publicação")}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{allSucceeded ? t("Publicado com sucesso!") : hasPartialSuccess ? t("Publicado em algumas redes") : t("Não foi possível publicar")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{allSucceeded ? t("Seu conteúdo foi enviado para todas as redes selecionadas.") : hasPartialSuccess ? t("A publicação deu certo em parte das redes. Veja abaixo o resultado de cada uma.") : t("Nenhuma rede confirmou a publicação. Confira o motivo por rede antes de tentar novamente.")}</p>

          <div className="mt-7 space-y-2 text-left">
            {publishOutcome.succeeded.map(platform => <div key={platform} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3"><CheckCircle2 size={18} className="shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-slate-800">{platformNames[platform] || platform} · {t("Publicado")}</p><p className="text-xs text-slate-600">{t("A plataforma confirmou o envio.")}</p></div></div>)}
            {publishOutcome.failed.map(({ platform, message }, index) => <div key={`${platform}-${index}`} className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3"><XCircle size={18} className="mt-0.5 shrink-0 text-rose-600" /><div><p className="text-sm font-semibold text-slate-800">{platformNames[platform] || platform} · {t("Falhou")}</p><p className="mt-0.5 break-words text-xs leading-5 text-rose-700">{message}</p></div></div>)}
            {publishOutcome.warnings.map(({ platform, message }, index) => <div key={`${platform}-${index}`} className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3"><span className="mt-0.5 shrink-0 text-amber-600">!</span><div><p className="text-sm font-semibold text-slate-800">{platformNames[platform] || platform} · {t("Ajuste pendente")}</p><p className="mt-0.5 break-words text-xs leading-5 text-amber-800">{message}</p></div></div>)}
          </div>

          <div className="mt-7 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={startAnother} className="h-11 gap-2 px-5">{t("Criar outra publicação")}</Button>
            <Button type="button" onClick={() => { window.location.href = "/calendar" }} className="h-11 gap-2 bg-indigo-600 px-5 text-white hover:bg-indigo-700">{t("Ver no calendário")}<ChevronRight size={16} /></Button>
          </div>
        </div>
      </Card>
    </main>
  }
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader eyebrow={t("Criação")} title={t("Nova publicação")} description={t("Crie, visualize e agende para Instagram, Facebook, Threads, X, YouTube e TikTok.")} />
      {referenceUrl && <Card className="flex flex-col gap-2 border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold text-amber-900">{t("Criando a partir de uma referência")}</p><p className="truncate text-xs text-amber-800">{t("Use o post como inspiração de formato e gancho, sem copiar o conteúdo.")} {referenceUrl}</p></div><div className="flex shrink-0 gap-2"><a href={referenceUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">{t("Abrir referência")}</a><button type="button" onClick={() => setReferenceUrl("")} className="rounded-lg px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100">{t("Ocultar")}</button></div></Card>}
      <nav className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-xs md:flex md:items-center md:gap-0 md:px-7" aria-label={t("Etapas da publicação")}>
        {[
          { label: "Onde publicar", help: "Escolha a rede social" },
          { label: "Formato", help: "Defina o tipo de post" },
          { label: "Conteúdo", help: "Crie seu post" },
          { label: "Revisar", help: "Confira e publique" },
        ].map((item, index) => <div key={item.label} className="flex min-w-0 items-center md:flex-1">
          <button type="button" onClick={() => setStep(index + 1)} aria-current={step === index + 1 ? "step" : undefined} className="flex min-w-0 items-center gap-2.5 text-left">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${step === index + 1 ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : step > index + 1 ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-500"}`}>{index + 1}</span>
            <span className="min-w-0"><span className={`block truncate text-xs font-semibold md:text-sm ${step === index + 1 ? "text-indigo-700" : "text-slate-800"}`}>{t(item.label)}</span><span className="hidden truncate text-[11px] text-slate-500 sm:block">{t(item.help)}</span></span>
          </button>
          {index < 3 && <span aria-hidden="true" className={`mx-3 hidden h-px min-w-4 flex-1 md:block ${step > index + 1 ? "bg-indigo-300" : "bg-slate-300"}`} />}
        </div>)}
      </nav>
      <div className="grid min-h-[calc(100vh-14rem)] min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,1fr)]">
      {/* Editor Panel */}
      <div className="min-w-0 flex-1 flex flex-col gap-6">
        {draftId && <Card className="space-y-2 border-indigo-200 p-4"><p className="font-semibold">{t("Editando rascunho salvo")} · @{accounts.find(a => a.id === accountId)?.igUsername}</p><p className="text-xs text-slate-500">{t("Adicione as mídias antes de publicar ou agendar. Esta edição mantém a conta original.")}</p>{editorialBrief && <details><summary className="cursor-pointer text-sm font-semibold">{t("Briefing e Story do plano")}</summary><p className="mt-2 whitespace-pre-wrap text-sm">{editorialBrief.creativeBrief}</p><p className="mt-2 whitespace-pre-wrap text-sm">Story: {editorialBrief.storyIdea}</p></details>}<Button type="button" variant="outline" disabled={isSubmitting} onClick={saveDraftChanges}>{t("Salvar alterações do rascunho")}</Button><a href="/calendar" className="ml-3 text-sm text-indigo-700 underline">{t("Calendário")}</a></Card>}
        <Card className="p-5 md:p-7 border border-slate-200/80 bg-white rounded-2xl shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4"><p className="page-eyebrow">{t("Etapa {step} de 4", { step })}</p><h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{[t("Onde você quer publicar?"), t("Qual formato você deseja usar?"), t("Como você quer criar o conteúdo?"), t("Tudo pronto para publicar?")][step - 1]}</h3><p className="mt-1 text-sm text-slate-500">{[t("Selecione a rede social onde seu post será publicado."), t("Escolha o formato ideal para o seu conteúdo."), t("Escreva seu texto, adicione as mídias e personalize o post."), t("Revise os detalhes e escolha quando publicar.")][step - 1]}</p></div>
          {/* Post Type Selector */}
          {step === 2 && <div className="animate-fade-in">
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="text-xs font-semibold text-slate-600">{t("Destinos escolhidos")}</span>
              {platforms.map((platform) => <span key={platform} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">{platformNames[platform] || platform}</span>)}
              {!platforms.length && <span className="text-xs text-slate-500">{t("Volte à etapa 1 e escolha uma rede.")}</span>}
            </div>
            {formatConflicts.length > 0 && <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900"><p className="font-semibold">{t("Escolha um formato que sirva para as redes selecionadas.")}</p><p className="mt-0.5">{t(formatConflicts.length > 1 ? "{networks} não publicam {format}. Ao escolher um formato, as redes que não aceitam ficam de fora desta publicação." : "{networks} não publica {format}. Ao escolher um formato, as redes que não aceitam ficam de fora desta publicação.", { networks: formatConflicts.map(platform => platformNames[platform] || platform).join(t(" e ")), format: t(postType === "FEED" ? "foto única" : postType === "CAROUSEL" ? "carrossel" : postType === "REEL" ? "vídeo" : postType === "STORY" ? "Story" : "post só de texto") })}</p></div>}
            {platforms.length === 1 && platforms[0] === "YOUTUBE" ? <YouTubeFormatPicker value={postType === "REEL" ? youtubeSettings.format : "video"} onChange={chooseYouTubeFormat} media={activeMedia} /> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { id: "FEED" as const, label: platforms.length === 1 && platforms[0] === "FACEBOOK" ? "Foto da Página" : platforms.length === 1 && platforms[0] === "THREADS" ? "Post com imagem" : "Foto única", description: "Uma imagem · feed ou post", icon: ImageIcon },
                { id: "CAROUSEL" as const, label: platforms.length === 1 && platforms[0] === "FACEBOOK" ? "Álbum de fotos" : "Carrossel", description: "2 a 10 mídias no mesmo post", icon: Copy },
                { id: "REEL" as const, label: platforms.length === 1 && platforms[0] === "INSTAGRAM" ? "Reel" : platforms.length === 1 && platforms[0] === "FACEBOOK" ? "Vídeo da Página" : platforms.length === 1 && platforms[0] === "THREADS" ? "Vídeo" : "Vídeo vertical", description: "Vídeo · nome muda por rede", icon: Video },
                { id: "STORY" as const, label: "Story", description: "Instagram Business apenas", icon: PlusCircle },
                { id: "TEXT" as const, label: "Post de texto", description: platforms.includes("X") ? "Threads e X · até 280 caracteres" : "Threads e X · sem mídia", icon: PencilLine },
              ].map(type => (
                (() => {
                  const targetPlatforms = compatiblePlatformsFor(type.id)
                  const available = targetPlatforms.length > 0
                  const platformSpecific = targetPlatforms.length === 1 ? networkFormatDetails[targetPlatforms[0]]?.[type.id] : undefined
                  const typeLabel = type.id === "REEL" ? platformSpecific?.name || type.label : type.label
                  const typeDescription = type.id === "REEL" ? platformSpecific?.shape || type.description : platformSpecific?.name || type.description
                  const willAdjustDestinations = available && (targetPlatforms.length !== platforms.length || targetPlatforms.some((platform, index) => platform !== platforms[index]))
                  const unavailableReason = type.id === "STORY" ? t("Stories só podem ser publicados no Instagram.") : type.id === "TEXT" ? t("Post de texto sem mídia está disponível somente no Threads e no X.") : t("Não disponível para todas as redes escolhidas: {networks}.", { networks: platforms.filter(platform => !formatPlatforms[type.id].includes(platform)).map(platform => platformNames[platform] || platform).join(", ") })
                  return <button
                  key={type.id}
                  type="button"
                  onClick={() => available && changePostType(type.id)}
                  disabled={!available}
                  aria-pressed={postType === type.id && !formatConflicts.length}
                  aria-describedby={!available ? `format-${type.id}-unavailable` : undefined}
                  className={`relative flex min-h-32 flex-col items-start rounded-2xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-55 md:min-h-36 md:p-4 ${
                    postType === type.id && !formatConflicts.length
                      ? "border-indigo-600 bg-indigo-50/70 text-indigo-700 shadow-xs ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${postType === type.id ? "bg-white text-indigo-600" : "bg-slate-50 text-slate-500"}`}><type.icon size={27} strokeWidth={1.9} /></span>
                  <span className="text-sm font-bold">{t(typeLabel)}</span><span className="mt-1 text-[11px] leading-4 text-slate-500">{t(typeDescription)}</span>
                  {!available && <span id={`format-${type.id}-unavailable`} className="mt-1 text-[10px] leading-4 text-slate-500">{unavailableReason}</span>}
                  {willAdjustDestinations && <span className="mt-2 text-[10px] font-medium leading-4 text-indigo-700">{t("Publica em")} {targetPlatforms.map(platform => platformNames[platform] || platform).join(", ")}<span className="block text-amber-700">{t("Fica de fora:")} {platforms.filter(platform => !targetPlatforms.includes(platform)).map(platform => platformNames[platform] || platform).join(", ")}</span></span>}
                  {postType === type.id && !formatConflicts.length && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white"><Check size={12} /></span>}
                </button>
                })()
              ))}
            </div>}
            {platforms.includes("YOUTUBE") && platforms.length > 1 && postType === "REEL" && <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-700">{t("No YouTube, publicar como")}</p><YouTubeFormatPicker value={youtubeSettings.format} onChange={chooseYouTubeFormat} media={activeMedia} compact /></div>}
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 md:p-5" role="note" aria-label={t("Requisitos do formato selecionado por rede")}>
              <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-xs"><ImageIcon size={20} /></span><div><h3 className="text-sm font-bold text-slate-900">{t("Formato e dimensões por plataforma")}</h3><p className="mt-0.5 text-xs text-slate-500">{t("Cada formato usa apenas as redes compatíveis; ao escolher Story, por exemplo, a publicação fica só no Instagram.")}</p></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                {platforms.map((platform) => {
                  const detail: PlatformFormatDetail | undefined = platform === "YOUTUBE" && postType === "REEL" ? YOUTUBE_FORMAT_DETAILS[youtubeSettings.format] : networkFormatDetails[platform]?.[postType]
                  if (!detail) return null
                  const activeRatio = activeMedia?.width && activeMedia.height ? activeMedia.width / activeMedia.height : undefined
                  const ratioTolerance = detail.acceptedRatio?.tolerance ?? 0.002
                  const isOutsideAcceptedRatio = Boolean(detail.acceptedRatio && activeRatio !== undefined && (
                    activeRatio < detail.acceptedRatio.min - ratioTolerance || activeRatio > detail.acceptedRatio.max + ratioTolerance
                  ))
                  const firstCarouselRatio = mediaItems[0]?.width && mediaItems[0].height ? mediaItems[0].width / mediaItems[0].height : undefined
                  const instagramCarouselWillCrop = platform === "INSTAGRAM" && postType === "CAROUSEL" && activeRatio !== undefined && firstCarouselRatio !== undefined && Math.abs(activeRatio - firstCarouselRatio) > 0.002
                  const PlatformIcon = platform === "INSTAGRAM" ? SiInstagram : platform === "FACEBOOK" ? SiFacebook : platform === "X" ? SiX : platform === "YOUTUBE" ? SiYoutube : platform === "TIKTOK" ? SiTiktok : SiThreads
                  const platformBg = platform === "INSTAGRAM" ? "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" : platform === "FACEBOOK" ? "bg-[#1877F2]" : platform === "X" || platform === "TIKTOK" ? "bg-black" : platform === "YOUTUBE" ? "bg-[#ff0033]" : "bg-[#101113]"
                  return <article key={platform} className="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-white bg-white/90 p-3">
                    <div className="flex items-center gap-2.5"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${platformBg}`}><PlatformIcon size={24} color="#fff" /></span><h4 className="text-sm font-bold text-slate-900">{platformNames[platform]}</h4></div>
                    <p className="mt-1 text-xs font-semibold text-slate-700">{t(detail.name)}</p>
                    <p className="flex w-full min-w-0 items-start gap-2 text-[11px] leading-4 text-slate-600"><Crop size={16} className="mt-0.5 shrink-0 text-indigo-600" /><span className="min-w-0 break-words">{t(detail.shape)}</span></p>
                    <p className="flex w-full min-w-0 items-start gap-2 text-[11px] leading-4 text-slate-600"><Ruler size={16} className="mt-0.5 shrink-0 text-indigo-600" /><span className="min-w-0 break-words">{t(detail.dimensions)}</span></p>
                    {activeMedia?.width && activeMedia.height && <p className={`w-full rounded-md px-2 py-1.5 text-[10px] leading-4 ${isOutsideAcceptedRatio ? "bg-rose-50 text-rose-700" : instagramCarouselWillCrop ? "bg-amber-50 text-amber-800" : detail.acceptedRatio ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                      {t("Arquivo:")} {activeMedia.width} × {activeMedia.height} px · {formatAspectRatio(activeMedia.width, activeMedia.height)}
                      {isOutsideAcceptedRatio ? t(" · fora da faixa aceita") : instagramCarouselWillCrop ? t(" · o 1º item define o corte") : detail.acceptedRatio ? t(" · dentro da faixa aceita") : t(" · confira a recomendação acima")}
                    </p>}
                    {detail.note && <p className="text-[10px] leading-4 text-slate-500">{t(detail.note)}</p>}
                  </article>
                })}
              </div>
              {postType === "TEXT" && <p className="mt-3 text-[11px] leading-4 text-slate-500">{t("Limite de texto: {limit}, incluindo as hashtags.", { limit: platforms.includes("X") ? t("280 caracteres (X)") : t("500 caracteres (Threads)") })}</p>}
            </div>
          </div>
          }

          {/* Publication targets */}
          {step === 1 && <div className="animate-fade-in rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("Onde publicar")}</p>
                <p className="mt-1 text-xs text-slate-500">{t("Escolha uma ou várias redes para este conteúdo.")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {connectedPlatforms.length > 1 && <button type="button" onClick={selectAllPlatforms} className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{connectedPlatforms.every(platform => platforms.includes(platform)) ? t("Todas selecionadas") : t("Selecionar todas")}</button>}
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{selectedAccount ? `@${selectedAccount.igUsername}` : t("Nenhuma conta do Instagram ativa")}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: "INSTAGRAM", label: "Instagram", Icon: SiInstagram, handle: selectedAccount ? `@${selectedAccount.igUsername}` : "Nenhuma conta selecionada", help: selectedAccount ? "Conectado" : "Conecte uma conta em Contas", color: "instagram" },
                { id: "FACEBOOK", label: "Facebook", Icon: SiFacebook, handle: selectedAccount?.pageName || "Página do Facebook", help: selectedAccount?.pageName ? "Conectado" : "Não conectado", color: "facebook" },
                { id: "THREADS", label: "Threads", Icon: SiThreads, handle: threadsAccounts[0] ? `@${threadsAccounts[0].username}` : "Conta do Threads", help: threadsAccounts.length ? "Conectado" : "Sem perfil nesta empresa", color: "threads" },
                { id: "X", label: "X", Icon: SiX, handle: selectedXAccount ? `@${selectedXAccount.username}` : "Conta do X", help: xAccounts.length ? "Conectado · até 280 caracteres" : "Sem perfil nesta empresa", color: "x" },
                { id: "YOUTUBE", label: "YouTube", Icon: SiYoutube, handle: selectedYouTubeAccount ? selectedYouTubeAccount.title : "Canal do YouTube", help: youtubeAccounts.length ? "Conectado · vídeos e Shorts" : "Sem canal nesta empresa", color: "youtube" },
                { id: "TIKTOK", label: "TikTok", Icon: SiTiktok, handle: selectedTikTokAccount ? selectedTikTokAccount.displayName : "Perfil do TikTok", help: tiktokAccounts.length ? "Conectado · vídeos" : "Sem perfil nesta empresa", color: "tiktok" },
              ].map((target) => {
                const selected = platforms.includes(target.id)
                const unavailable = !connectedPlatforms.includes(target.id)
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => !unavailable && togglePlatform(target.id)}
                    aria-disabled={unavailable}
                    className={`relative grid min-h-[76px] w-full grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-3 text-left transition-all sm:grid-cols-[48px_minmax(0,1fr)_auto_28px] sm:gap-4 sm:px-4 ${selected ? "border-indigo-600 bg-indigo-50/50 shadow-[0_0_0_1px_rgba(99,102,241,.16)]" : "border-slate-200 bg-white hover:border-slate-300"} ${unavailable ? "cursor-not-allowed opacity-60" : ""}`}
                    aria-pressed={selected}
                  >
                    <span className={`row-span-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:row-span-1 sm:h-12 sm:w-12 ${target.color === "instagram" ? "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" : target.color === "facebook" ? "bg-[#1877F2]" : target.color === "x" ? "bg-black" : target.color === "youtube" ? "bg-[#ff0033]" : target.color === "tiktok" ? "bg-black" : "bg-[#101113]"}`}>
                      <target.Icon size={25} color="#fff" title={`${target.label} logo`} />
                    </span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-4 text-slate-800">{target.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{t(target.handle)}</span></span>
                    <span className={`col-start-2 row-start-2 inline-flex w-fit items-center gap-1 text-[10px] font-medium sm:col-start-auto sm:row-start-auto sm:rounded-full sm:px-2 sm:py-1 sm:text-xs ${!unavailable ? "text-emerald-700 sm:bg-emerald-50" : "text-slate-500 sm:bg-slate-100"}`}><span className={`h-1.5 w-1.5 rounded-full ${!unavailable ? "bg-emerald-500" : "bg-slate-300"}`} />{t(target.help)}</span>
                    <span className={`col-start-3 row-span-2 row-start-1 flex h-6 w-6 items-center justify-center rounded-full border sm:col-start-4 sm:row-span-1 sm:h-7 sm:w-7 ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{selected && <Check size={14} strokeWidth={3} />}</span>
                  </button>
                )
              })}
            </div>
            {platforms.includes("THREADS") && threadsAccounts.length > 1 && (
              <select value={threadsAccountId} onChange={(event) => setThreadsAccountId(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700" aria-label={t("Conta do Threads")}>
                {threadsAccounts.map((account) => <option key={account.id} value={account.id}>Threads @{account.username}</option>)}
              </select>
            )}
            {!selectedAccount && <a href="/accounts" className="inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t("Conectar Instagram em Contas →")}</a>}
            {!threadsAccounts.length && <a href="/accounts" className="ml-4 inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t("Conectar conta do Threads →")}</a>}
            {!youtubeAccounts.length && <a href="/accounts" className="ml-4 inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t("Conectar canal do YouTube →")}</a>}
            {platforms.includes("TIKTOK") && tiktokAccounts.length > 1 && <select value={selectedTikTokAccount?.id || ""} onChange={(event) => setTikTokAccountId(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700" aria-label={t("Perfil do TikTok")}>{tiktokAccounts.map((account) => <option key={account.id} value={account.id}>TikTok · {account.displayName}</option>)}</select>}
            {platforms.includes("YOUTUBE") && youtubeAccounts.length > 1 && (
              <select value={selectedYouTubeAccount?.id || ""} onChange={(event) => setYouTubeAccountId(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700" aria-label={t("Canal do YouTube")}>
                {youtubeAccounts.map((account) => <option key={account.id} value={account.id}>YouTube · {account.title}</option>)}
              </select>
            )}
            <p className="flex items-center gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold">i</span>{t("Para trocar de perfil, use o seletor no topo da página.")}</p>
          </div>
          }

          {/* AI assistant */}
          {step === 3 && <div className="animate-fade-in space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {[{ id: "manual" as const, title: "Fazer por conta", detail: "Escreva o texto, adicione mídias e personalize do seu jeito.", Icon: PencilLine }, { id: "ai" as const, title: "Criar com IA", detail: "Gere uma legenda e hashtags a partir de um tema.", Icon: Sparkles }].map(option => <button key={option.id} type="button" onClick={() => setCreationMode(option.id)} aria-pressed={creationMode === option.id} className={`flex min-h-[88px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${creationMode === option.id ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${creationMode === option.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-indigo-600"}`}><option.Icon size={22} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{t(option.title)}</span><span className="mt-1 block text-xs leading-4 text-slate-500">{t(option.detail)}</span></span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${creationMode === option.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{creationMode === option.id && <Check size={12} />}</span></button>)}
          </div>
          {creationMode === "ai" && <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-fuchsia-50/50 shadow-xs" aria-labelledby="ai-assistant-title">
            <header className="flex items-center gap-3 border-b border-indigo-100/80 px-4 py-4 md:px-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"><Sparkles size={19} /></span>
              <div className="min-w-0"><h3 id="ai-assistant-title" className="text-sm font-bold text-slate-900">{t("Assistente de conteúdo")}</h3><p className="mt-0.5 text-xs text-slate-500">{t("Defina a ideia, ajuste se quiser e escolha o que a IA vai preparar.")}</p></div>
            </header>

            <div className="space-y-5 p-4 md:p-5">
              <section aria-labelledby="ai-brief-title">
                <div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">1</span><h4 id="ai-brief-title" className="text-sm font-semibold text-slate-900">{t("Sobre o que vamos falar?")}</h4></div>
                <label htmlFor="ai-topic" className="mb-1.5 block text-xs font-medium text-slate-700">{t("Ideia ou assunto")} <span className="text-rose-600">*</span></label>
                <Input id="ai-topic" value={aiTopic} onChange={(event) => { setAiTopic(event.target.value); setAiPlan([]) }} placeholder={t("Ex.: 3 formas de organizar as finanças do seu negócio")} aria-label={t("Ideia ou assunto para a IA")} />
                <label htmlFor="ai-audience" className="mb-1.5 mt-3 block text-xs font-medium text-slate-700">{t("Para quem é este conteúdo")} <span className="font-normal text-slate-400">· {t("opcional")}</span></label>
                <Input id="ai-audience" value={aiAudience} onChange={(event) => { setAiAudience(event.target.value); setAiPlan([]) }} placeholder={t("Ex.: donos de pequenos negócios")} aria-label={t("Público para a IA")} />
                <details className="group mt-3 rounded-xl border border-indigo-100 bg-white/80">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-indigo-800 marker:hidden"><span>{t("Personalizar o resultado")} <span className="font-normal text-slate-500">· {t("objetivo e tom")}</span></span><ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" /></summary>
                  <div className="grid gap-3 border-t border-indigo-50 p-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-700">{t("Objetivo")}<select value={aiObjective} onChange={(event) => { setAiObjective(event.target.value); setAiPlan([]) }} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <option value="Atrair e gerar conversa">{t("Atrair e gerar conversa")}</option><option value="Vender um produto ou serviço">{t("Vender um produto ou serviço")}</option><option value="Educar e gerar autoridade">{t("Educar e gerar autoridade")}</option><option value="Fortalecer relacionamento">{t("Fortalecer relacionamento")}</option>
                    </select></label>
                    <label className="block text-xs font-medium text-slate-700">{t("Tom de voz")}<select value={aiTone} onChange={(event) => { setAiTone(event.target.value); setAiPlan([]) }} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                      <option value="Profissional e próximo">{t("Profissional e próximo")}</option><option value="Direto e persuasivo">{t("Direto e persuasivo")}</option><option value="Leve e descontraído">{t("Leve e descontraído")}</option><option value="Inspirador">{t("Inspirador")}</option><option value="Educativo">{t("Educativo")}</option>
                    </select></label>
                  </div>
                </details>
              </section>

              <section aria-labelledby="ai-output-title">
                <div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">2</span><h4 id="ai-output-title" className="text-sm font-semibold text-slate-900">{t("O que você quer criar?")}</h4></div>
                <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label={t("Tipo de criação com IA")}>
                  {[
                    { id: "caption" as const, title: "Uma legenda", detail: "Para este post", Icon: PencilLine },
                    { id: "daily" as const, title: "Plano do dia", detail: "3 posts revisáveis", Icon: CalendarIcon },
                    { id: "week" as const, title: "Plano semanal", detail: "Ideias para 7 dias", Icon: Layers },
                  ].map(option => <button key={option.id} type="button" onClick={() => setAiWorkflow(option.id)} aria-pressed={aiWorkflow === option.id} className={`flex min-h-[68px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${aiWorkflow === option.id ? "border-indigo-600 bg-white text-indigo-800 shadow-[0_0_0_1px_rgba(99,102,241,.15)]" : "border-slate-200 bg-white/70 text-slate-600 hover:border-indigo-300"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${aiWorkflow === option.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}><option.Icon size={18} /></span><span className="min-w-0"><span className="block text-xs font-semibold">{t(option.title)}</span><span className="mt-0.5 block text-[11px] text-slate-500">{t(option.detail)}</span></span></button>)}
                </div>

                {aiWorkflow === "caption" && <div className="mt-3 rounded-xl border border-indigo-100 bg-white/90 p-3">
                  <p className="text-xs leading-5 text-slate-600">{t("A IA vai criar uma legenda e hashtags para o formato e as redes escolhidas. Você poderá revisar e editar tudo.")}</p>
                  <Button type="button" onClick={() => generateWithAi("caption")} disabled={aiLoading || !aiTopic.trim()} className="mt-3 w-full justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"><Sparkles size={15} />{aiLoading ? t("Criando sua legenda…") : t("Criar legenda e hashtags")}</Button>
                </div>}

                {aiWorkflow === "week" && <div className="mt-3 rounded-xl border border-indigo-100 bg-white/90 p-3">
                  <p className="text-xs leading-5 text-slate-600">{t("Receba uma ideia de conteúdo para cada dia. O plano é apenas uma sugestão; nada será publicado ou agendado.")}</p>
                  <Button type="button" onClick={() => generateWithAi("plan")} disabled={aiLoading || !aiTopic.trim()} className="mt-3 w-full justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 sm:w-auto"><CalendarIcon size={15} />{aiLoading ? t("Montando seu plano…") : t("Montar plano de 7 dias")}</Button>
                </div>}

                <div className={aiWorkflow === "daily" ? "mt-3 rounded-xl border border-indigo-100 bg-white/90 p-3" : "hidden"}>
                  <p className="mb-3 text-xs leading-5 text-slate-600">{t("Crie três rascunhos para um dia. Você revisa cada legenda e escolhe se quer salvar — nada é agendado automaticamente.")}</p>
                  <DailyContentPlan accountId={accountId} topic={aiTopic} audience={aiAudience} tone={aiTone} objective={aiObjective} onEdit={post => {
                    if ((caption.trim() || mediaItems.length) && !window.confirm(t('Substituir a legenda, as hashtags e o formato atuais por este post do plano? As mídias anexadas serão mantidas; confira se combinam com o novo conteúdo.'))) return
                    setCaption(post.caption)
                    setHashtags(post.hashtags.map(tag => tag.replace(/^#/, '')))
                    setPostType(post.format === 'IMAGE' ? 'FEED' : post.format)
                    toast.success(t('Texto aplicado ao compositor. Revise as mídias e escolha as redes antes de publicar.'))
                  }} />
                </div>

                {aiWorkflow === "week" && aiPlan.length > 0 && <div className="mt-3 max-h-80 space-y-2 overflow-auto rounded-xl border border-indigo-100 bg-white p-3" aria-live="polite">{aiPlan.map((item, index) => <article key={`${item.day}-${index}`} className="rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-indigo-700">{item.day} · {item.format}</p><span className="text-[11px] text-slate-400">{item.suggestedTime}</span></div><p className="mt-1 text-sm font-semibold text-slate-800">{item.topic}</p><p className="mt-1 text-xs text-slate-500">{item.hook}</p><p className="mt-1 text-xs font-medium text-slate-600">CTA: {item.cta}</p></article>)}</div>}
              </section>
            </div>
          </section>}

          {/* Caption */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="post-caption" className="block text-sm font-semibold text-slate-800">{t("Texto do post")}</label>
              {platforms.includes("X") ? <span className={`text-xs font-medium ${textLength(caption, platforms) > 280 ? "text-rose-700" : textLength(caption, platforms) > 260 ? "text-amber-700" : "text-slate-400"}`}>{textLength(caption, platforms)}/280 {t("caracteres (X)")}</span> : <span className={`text-xs font-medium ${caption.length > (postType === "TEXT" ? 450 : 2100) ? "text-amber-700" : "text-slate-400"}`}>{caption.length.toLocaleString("pt-BR")}/{postType === "TEXT" ? "500" : "2.200"} {t("caracteres")}</span>}
            </div>
            <textarea id="post-caption" className="h-28 w-full resize-y rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-5 text-slate-900 shadow-xs transition placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 md:h-32" placeholder={postType === "TEXT" ? t("Escreva seu post para o Threads...") : t("Escreva sua legenda, conte a ideia e personalize o post...")} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={postType === "TEXT" ? 500 : 2200} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={speakCaption} disabled={!caption.trim()} className="h-9 gap-2 rounded-lg border-indigo-100 px-3 text-xs text-indigo-700"><Mic size={15} />{t("Ouvir texto")}</Button>
              <Button type="button" variant="outline" disabled={aiLoading || !caption.trim()} onClick={improveCaption} className="h-9 gap-2 rounded-lg border-indigo-100 px-3 text-xs text-indigo-700"><Sparkles size={15} />{aiLoading ? t("Revisando…") : t("Melhorar com IA")}</Button>
            </div>
          </div>

          {/* Media upload */}
          {postType !== "TEXT" && <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <label className="block text-sm font-semibold text-slate-800">{t("Mídias")}</label>
              <span className="text-xs font-medium text-slate-400">{mediaItems.length}{postType === "CAROUSEL" ? t(" de 10 itens") : mediaItems.length === 1 ? t(" arquivo") : t(" arquivos")}</span>
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
                          <video src={item.src} muted autoPlay loop playsInline preload="auto" className="w-full h-full object-cover" aria-label={t("Miniatura do vídeo")} />
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
                        aria-label={t("Remover {name}", { name: item.name })}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/75 text-sm leading-none text-white opacity-100 shadow-sm transition hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                      >
                        ×
                      </button>
                      {item.kind === "video" && (
                        <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/75 text-white text-[9px] font-bold px-1.5 py-0.5">
                          {t("VÍDEO")}
                        </span>
                      )}
                    </div>
                  ))}
                  {mediaItems.length < (postType === "CAROUSEL" ? 10 : 1) && <div {...getRootProps()} className={`flex aspect-[1.1] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition ${isDragActive ? "border-indigo-500 bg-indigo-50" : "border-indigo-200 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/40"}`}><input {...getInputProps()} /><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><ImagePlus size={18} /></span><span className="mt-2 text-[11px] font-semibold text-indigo-700">{t("Adicionar mídia")}</span><span className="mt-1 text-[9px] leading-3 text-slate-500">{t("Imagem ou vídeo")}<br />{t("(até 100 MB)")}</span></div>}
                </div>

                {postType === "CAROUSEL" && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                    <span className="text-xs font-medium text-indigo-800">
                      {mediaItems.length}/10 {t("itens • selecione uma miniatura para editar a ordem")}
                    </span>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveActiveMedia(-1)}
                        disabled={activeMediaIndex === 0}
                        className="w-7 h-7 rounded-lg border border-indigo-200 bg-white text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50"
                        aria-label={t("Mover mídia para a esquerda")}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => moveActiveMedia(1)}
                        disabled={activeMediaIndex === mediaItems.length - 1}
                        className="w-7 h-7 rounded-lg border border-indigo-200 bg-white text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50"
                        aria-label={t("Mover mídia para a direita")}
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
                  {isDragActive ? t("Solte os arquivos aqui") : mediaItems.length > 0 ? t("Adicionar mais mídias") : t("Arraste imagens ou vídeos aqui")}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {platforms.length === 1 && platforms[0] === "THREADS" ? t("Opcional no Threads quando você publicar somente texto • PNG, JPG, MP4 ou MOV") : postType === "CAROUSEL" ? t("Até 10 itens • PNG, JPG, MP4 ou MOV") : t("PNG, JPG, MP4 ou MOV até 100MB")}
                </p>
              </div>
            </div>}
          </div>}

          <ArtworkStudio disabled={isSubmitting} onUse={async files => {
            if (mediaItems.length && !window.confirm(t('Substituir as mídias selecionadas pelas artes do editor?'))) return
            mediaItems.forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
            const artworkItems = await Promise.all(files.map(async file => {
              const src = URL.createObjectURL(file)
              const dimensions = await getMediaDimensions(src, "image")
              return { id: crypto.randomUUID(), file, src, name: file.name, kind: "image" as const, isObjectUrl: true, ...dimensions }
            }))
            setMediaItems(artworkItems)
            setAdvancedSettings(current => ({ ...current, altTexts: artworkItems.map(() => ""), userTags: [] }))
            setPostType(files.length > 1 ? 'CAROUSEL' : 'FEED'); setActiveMediaIndex(0)
            toast.success(t('Artes anexadas. Revise a prévia e salve o rascunho; nada foi publicado.'))
          }} />
          {!draftId && <Button type="button" variant="outline" disabled={isSubmitting || !accountId || !mediaItems.length} onClick={saveDraftChanges}>{t("Salvar como rascunho")}</Button>}

          {/* Hashtags */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="composer-hashtag" className="block text-sm font-semibold text-slate-800">Hashtags <span className="font-normal text-slate-400">({t("opcional")})</span></label><span className="text-xs text-slate-400">{hashtags.length} {hashtags.length === 1 ? "hashtag" : "hashtags"}</span></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Hash aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="composer-hashtag"
                  aria-label={t("Digite uma hashtag")}
                  className="h-11 rounded-xl pl-10 text-sm"
                  placeholder={t("Digite uma hashtag, ex.: marketingdigital")}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={addHashtag} disabled={!tagInput.trim()} className="h-11 flex-1 rounded-xl px-4 text-xs font-semibold sm:flex-none">{t("Adicionar")}</Button>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{t("Digite uma hashtag e clique em Adicionar ou pressione Enter.")}</p>

            {hashtags.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label={t("Hashtags adicionadas")}>
              {hashtags.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800">
                #{tag}
                <button type="button" onClick={() => removeHashtag(tag)} aria-label={t("Remover hashtag {tag}", { tag })} className="ml-1 rounded-full px-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-900">×</button>
              </span>)}
            </div>}
          </div>

          {platforms.includes("YOUTUBE") && <YouTubeOptions channelId={selectedYouTubeAccount?.id} settings={youtubeSettings} onChange={setYouTubeSettings} media={activeMedia} hashtags={hashtags} onUploadThumbnail={(file) => { void uploadYouTubeThumbnail(file) }} thumbnailUploading={youtubeThumbnailUploading} />}
          {platforms.includes("TIKTOK") && <TikTokOptions accountId={selectedTikTokAccount?.id} settings={tiktokSettings} onChange={setTikTokSettings} media={activeMedia} />}

          <details className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 marker:hidden">
              <span className="flex items-center gap-2"><RiMore2Line size={18} className="text-indigo-600" />{t("Configurações avançadas")}</span>
              <ChevronDown size={16} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
            </summary>
            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              {platforms.includes("INSTAGRAM") ? <>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input type="checkbox" checked={isAiGenerated} onChange={(event) => setIsAiGenerated(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{t('Rótulo "Feito com IA"')}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{t("Marca a publicação do Instagram como conteúdo gerado ou alterado por IA. Usar IA apenas para escrever a legenda não exige esta marcação.")}</span></span>
                </label>

                {(postType === "FEED" || postType === "CAROUSEL" || postType === "REEL") ? <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-location-heading">
                  <div><h3 id="instagram-location-heading" className="text-sm font-semibold text-slate-800">{t("Localização")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("Busque o local pelo nome. O Instagram usa Páginas do Facebook com endereço como locais; se a busca não estiver liberada, cole o link ou o ID da Página do local.")}</p></div>
                  {advancedSettings.locationId && <div className="flex flex-wrap items-center gap-2"><span className="inline-flex max-w-full items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800"><span className="truncate">{advancedSettings.locationName || t("Local {id}", { id: advancedSettings.locationId })}</span><button type="button" onClick={() => setAdvancedSettings(current => ({ ...current, locationId: null, locationName: null }))} aria-label={t("Remover localização")} className="rounded-full px-1 text-indigo-500 hover:bg-indigo-100">×</button></span></div>}
                  <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={t("Buscar local ou colar link da Página")} value={locationQuery} maxLength={300} onChange={(event) => setLocationQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (parseLocationInput(locationQuery)) applyManualLocation(); else void searchLocations() } }} placeholder={t("Ex.: Parque Ibirapuera ou facebook.com/…")} className="h-10 min-w-0 rounded-lg text-sm" /><Button type="button" variant="outline" onClick={() => parseLocationInput(locationQuery) ? applyManualLocation() : void searchLocations()} disabled={locationLoading || locationQuery.trim().length < 2} className="h-10 shrink-0 border-indigo-200 text-indigo-700">{locationLoading ? <Loader2 size={15} className="animate-spin" /> : parseLocationInput(locationQuery) ? t("Usar este ID") : t("Buscar")}</Button></div>
                  {locationMessage && <p role="status" className={`rounded-lg px-3 py-2 text-[11px] leading-4 ${locationSearchUnavailable ? "border border-amber-200 bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>{locationMessage}</p>}
                  {locationResults.length > 0 && <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200" aria-label={t("Locais encontrados")}>{locationResults.map(location => <li key={location.id}><button type="button" onClick={() => chooseLocation(location)} className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-indigo-50"><span className="text-sm font-medium text-slate-800">{location.name}{location.verified ? " ✓" : ""}</span>{(formatLocationPlace(location) || location.street) && <span className="text-[11px] text-slate-500">{[location.street, formatLocationPlace(location)].filter(Boolean).join(" · ")}</span>}</button></li>)}</ul>}
                </section> : <p className="rounded-xl border border-slate-200 bg-slate-100/70 p-3 text-[11px] leading-4 text-slate-500">{t("Localização não está disponível para Stories pela API do Instagram.")}</p>}

                {postType === "REEL" && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-reel-options-heading">
                  <div><h3 id="instagram-reel-options-heading" className="text-sm font-semibold text-slate-800">{t("Opções do Reel")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("Capa, exibição no feed e Reel de teste.")}</p></div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3"><input type="checkbox" checked={advancedSettings.shareToFeed} onChange={(event) => setAdvancedSettings(current => ({ ...current, shareToFeed: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><span className="block text-xs font-semibold text-slate-800">{t("Mostrar também no feed")}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{t("Desmarcado, o Reel aparece só na aba Reels do perfil.")}</span></span></label>
                  <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-800">{t("Capa")}</p>
                    <div className="flex flex-wrap gap-2 text-xs" role="radiogroup" aria-label={t("Tipo de capa do Reel")}>
                      {([["auto", "Automática"], ["frame", "Quadro do vídeo"]] as const).map(([mode, label]) => {
                        const currentMode = advancedSettings.thumbOffset !== null ? "frame" : "auto"
                        return <button key={mode} type="button" role="radio" aria-checked={currentMode === mode && !advancedSettings.coverUrl} onClick={() => setAdvancedSettings(current => ({ ...current, coverUrl: null, thumbOffset: mode === "frame" ? (current.thumbOffset ?? 0) : null }))} className={`rounded-full border px-3 py-1.5 font-medium ${currentMode === mode && !advancedSettings.coverUrl ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600"}`}>{t(label)}</button>
                      })}
                    </div>
                    {advancedSettings.thumbOffset !== null && !advancedSettings.coverUrl && (activeMedia?.kind === "video" ? <div className="space-y-2">
                      <video ref={reelFrameRef} src={activeMedia.src} muted playsInline preload="metadata" onLoadedMetadata={(event) => { setReelDurationMs(Math.floor(event.currentTarget.duration * 1000) || 0); event.currentTarget.currentTime = (advancedSettings.thumbOffset || 0) / 1000 }} className="mx-auto max-h-56 rounded-lg bg-black" aria-label={t("Quadro escolhido para a capa")} />
                      <label className="block text-[11px] text-slate-600">{t("Quadro em {seconds} s", { seconds: ((advancedSettings.thumbOffset || 0) / 1000).toFixed(1) })}
                        <input type="range" min={0} max={Math.max(reelDurationMs, 1000)} step={100} value={advancedSettings.thumbOffset || 0} onChange={(event) => { const value = Number(event.target.value); setAdvancedSettings(current => ({ ...current, thumbOffset: value })); if (reelFrameRef.current) reelFrameRef.current.currentTime = value / 1000 }} className="mt-1 w-full accent-indigo-600" />
                      </label>
                    </div> : <p className="text-[11px] text-slate-500">{t("Adicione o vídeo do Reel para escolher o quadro.")}</p>)}
                    {advancedSettings.coverUrl && <div className="flex items-center gap-3"><img src={advancedSettings.coverUrl || ""} alt={t("Capa escolhida para o Reel")} className="h-24 w-[54px] rounded-md object-cover" /><button type="button" onClick={() => setAdvancedSettings(current => ({ ...current, coverUrl: null }))} className="text-xs text-slate-500 underline">{t("Remover capa")}</button></div>}
                    {!advancedSettings.coverUrl && advancedSettings.thumbOffset === null && <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-indigo-700">{coverUploading ? <Loader2 size={13} className="animate-spin" /> : null}<span className="underline">{t("Enviar imagem de capa")}</span><input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={coverUploading} onChange={(event) => { void uploadReelCover(event.target.files?.[0]); event.target.value = "" }} /></label>}
                    <p className="text-[10px] leading-4 text-slate-400">{t("Automática: o Instagram escolhe o quadro. Ou envie uma imagem própria; ela substitui o quadro. A imagem de capa é recomendada em 9:16 (1080×1920).")}</p>
                  </div>
                  <label className="block rounded-lg bg-slate-50 p-3 text-xs"><span className="block font-semibold text-slate-800">{t("Reel de teste — mostrar só para não seguidores")}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{t("O Instagram mostra o Reel primeiro para quem não segue a conta. Depois ele pode ir para os seguidores manualmente (no app) ou automaticamente se for bem.")}</span>
                    <select value={advancedSettings.trialGraduation || ""} onChange={(event) => { const value = (event.target.value || null) as InstagramTrialGraduation | null; setAdvancedSettings(current => ({ ...current, trialGraduation: value })) }} className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800">
                      <option value="">{t("Não, publicar normalmente")}</option>
                      <option value="MANUAL">{t("Sim — eu decido no app quando mostrar aos seguidores")}</option>
                      <option value="SS_PERFORMANCE">{t("Sim — mostrar aos seguidores automaticamente se for bem")}</option>
                    </select>
                  </label>
                </section>}

                {(postType === "FEED" || postType === "CAROUSEL" || postType === "REEL") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-collaborators-heading">
                  <div><h3 id="instagram-collaborators-heading" className="text-sm font-semibold text-slate-800">{t("Colaboradores")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("Convide até 3 perfis para aparecerem como coautores. A Meta pode exigir que cada perfil aceite o convite.")}</p></div>
                  <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={t("Usuário do Instagram para convidar como colaborador")} value={collaboratorInput} maxLength={32} onChange={(event) => setCollaboratorInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCollaborator() } }} placeholder={t("Ex.: @parceiro")} className="h-10 min-w-0 rounded-lg text-sm" /><Button type="button" variant="outline" onClick={addCollaborator} disabled={!collaboratorInput.trim() || advancedSettings.collaborators.length >= 3} className="h-10 shrink-0 border-indigo-200 text-indigo-700">{t("Adicionar")}</Button></div>
                  {advancedSettings.collaborators.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={t("Colaboradores escolhidos")}>{advancedSettings.collaborators.map(username => <li key={username} className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800">@{username}<button type="button" onClick={() => setAdvancedSettings(current => ({ ...current, collaborators: current.collaborators.filter(item => item !== username) }))} aria-label={t("Remover @{username}", { username })} className="rounded-full px-1 text-indigo-500 hover:bg-indigo-100">×</button></li>)}</ul>}
                </section>}

                {(postType === "FEED" || postType === "CAROUSEL") && mediaItems.some(item => item.kind === "image") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-alt-text-heading">
                  <div><h3 id="instagram-alt-text-heading" className="text-sm font-semibold text-slate-800">{t("Descrição das fotos (acessibilidade)")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("Descreva o que aparece em cada imagem para pessoas que usam leitor de tela. Até 1.000 caracteres por foto.")}</p></div>
                  <div className="space-y-3">{mediaItems.map((item, index) => item.kind === "image" && <label key={item.id} className="block text-xs font-medium text-slate-700">{postType === "CAROUSEL" ? t("Foto {n}", { n: index + 1 }) : t("Foto")}<textarea maxLength={1000} value={advancedSettings.altTexts[index] || ""} onChange={(event) => setAdvancedSettings(current => { const altTexts = [...current.altTexts]; altTexts[index] = event.target.value; return { ...current, altTexts } })} placeholder={t("Ex.: João apresenta o projeto em uma sala iluminada.")} className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal leading-5 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" /><span className="mt-1 block text-right text-[10px] text-slate-400">{(advancedSettings.altTexts[index] || "").length}/1.000</span></label>)}</div>
                </section>}

                {(postType === "FEED" || postType === "CAROUSEL") && mediaItems.some(item => item.kind === "image") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-user-tags-heading">
                  <div><h3 id="instagram-user-tags-heading" className="text-sm font-semibold text-slate-800">{t("Marcar pessoas nas fotos")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("Digite o @perfil e clique no lugar da foto onde a marcação deve aparecer. Em carrosséis, selecione primeiro a miniatura que quer marcar.")}</p></div>
                  <Input aria-label={t("Perfil do Instagram para marcar na foto")} value={personTagInput} maxLength={32} onChange={(event) => setPersonTagInput(event.target.value)} placeholder={t("Ex.: @pessoa")} className="h-10 rounded-lg text-sm" />
                  {activeMedia?.kind === "image" ? <div className="flex justify-center overflow-hidden rounded-lg bg-slate-100 p-2"><span role="button" tabIndex={0} aria-label={t("Clique na foto {n} para posicionar a marcação", { n: activeMediaIndex + 1 })} onClick={addPersonTagAtPosition} onKeyDown={(event) => { if (event.key === "Enter") addPersonTagAtCenter() }} className="relative inline-block max-w-full cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"><img src={activeMedia.src} alt={t("Foto para posicionar as marcações de pessoas")} className="block max-h-72 max-w-full object-contain" />{advancedSettings.userTags.filter(tag => tag.mediaIndex === activeMediaIndex).map((tag, index) => <span key={`${tag.username}-${index}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow" style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}>@{tag.username}</span>)}</span></div> : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{t("Selecione uma foto para posicionar a marcação. Vídeos e Stories não aceitam esta marcação neste compositor.")}</p>}
                  {advancedSettings.userTags.length > 0 && <ul className="flex flex-wrap gap-2" aria-label={t("Pessoas marcadas")}>{advancedSettings.userTags.map((tag, index) => <li key={`${tag.username}-${tag.mediaIndex}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">@{tag.username} · {t("foto {n}", { n: tag.mediaIndex + 1 })}<button type="button" onClick={() => removePersonTag(index)} aria-label={t("Remover marcação de @{username}", { username: tag.username })} className="rounded-full px-1 text-slate-500 hover:bg-slate-200">×</button></li>)}</ul>}
                </section>}

                {(postType === "FEED" || postType === "CAROUSEL" || postType === "REEL") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-comments-heading">
                  <div><h3 id="instagram-comments-heading" className="text-sm font-semibold text-slate-800">{t("Comentários da publicação")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("O primeiro comentário é enviado depois do post. Esse recurso depende de uma liberação da Meta; se ela ainda não estiver ativa, o sistema avisa e não envia o post para o Instagram.")}</p></div>
                  <label htmlFor="instagram-first-comment" className="block text-xs font-medium text-slate-700">{t("Primeiro comentário")} <span className="font-normal text-slate-400">· {t("opcional")}</span></label><textarea id="instagram-first-comment" maxLength={2200} value={advancedSettings.firstComment} onChange={(event) => setAdvancedSettings(current => ({ ...current, firstComment: event.target.value }))} placeholder={t("Escreva o comentário que será enviado após a publicação.")} className="min-h-20 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-5 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3"><input type="checkbox" checked={advancedSettings.disableComments} onChange={(event) => setAdvancedSettings(current => ({ ...current, disableComments: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><span className="block text-xs font-semibold text-slate-800">{t("Desativar comentários depois de publicar")}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{t("O primeiro comentário, se preenchido, será enviado antes de fechar os comentários.")}</span></span></label>
                </section>}

                <section className="grid gap-2 sm:grid-cols-3" aria-label={t("Recursos do app do Instagram que a API não oferece")}>
                  <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3"><p className="text-xs font-semibold text-slate-700">{t("Parceria paga")}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{t("Ainda não disponível nesta conexão Meta. O post não será marcado como parceria sem essa liberação.")}</p></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3"><p className="text-xs font-semibold text-slate-700">{t("Produtos da loja")}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{t("Ainda não há um seletor ligado ao catálogo nesta tela; nenhum produto será marcado.")}</p></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3"><p className="text-xs font-semibold text-slate-700">{t("Ocultar curtidas, filtros e figurinhas")}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{t("A API oficial do Instagram não oferece essas opções; ajuste no app depois de publicar.")}</p></div>
                </section>
              </> : <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">{t("Selecione Instagram para configurar os recursos avançados desta publicação.")}</p>}

              {postType === "REEL" && platforms.includes("INSTAGRAM") ? <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-audio-heading">
                <div><h3 id="instagram-audio-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800"><RiMusic2Line size={17} className="text-indigo-600" />{t("Música ou áudio do Instagram")}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t("Escolha uma faixa autorizada para anexar ao Reel. A faixa será aplicada na publicação do Instagram; Facebook e Threads continuarão usando o áudio do vídeo original.")}</p></div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <select aria-label={t("Tipo de áudio")} value={audioType} onChange={(event) => { setAudioType(event.target.value as "music" | "original_sound"); setAudioTracks([]) }} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                    <option value="music">{t("Músicas")}</option><option value="original_sound">{t("Áudios originais")}</option>
                  </select>
                  <Input aria-label={t("Buscar música ou áudio")} value={audioSearchQuery} maxLength={100} onChange={(event) => setAudioSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchInstagramAudio() } }} placeholder={t("Buscar por nome ou artista")} className="h-10 rounded-lg text-sm" />
                  <Button type="button" variant="outline" onClick={() => void searchInstagramAudio()} disabled={audioSearching || !accountId} className="h-10 gap-2 border-indigo-200 text-indigo-700"><Search size={15} />{audioSearching ? t("Buscando…") : t("Buscar")}</Button>
                </div>
                {audioTracks.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label={t("Faixas de áudio encontradas")}>
                  {audioTracks.map((track) => <li key={track.id} className={`flex min-w-0 items-center gap-3 rounded-lg border p-2 ${selectedAudioTrack?.id === track.id ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200"}`}>
                    {track.coverUrl ? <img src={track.coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500"><RiMusic2Line size={18} /></span>}
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{track.title}</span><span className="block truncate text-[11px] text-slate-500">{track.artist || (track.creatorUsername ? `@${track.creatorUsername}` : t("Áudio do Instagram"))}{track.durationInMs ? ` · ${Math.floor(track.durationInMs / 60000)}:${String(Math.floor(track.durationInMs / 1000) % 60).padStart(2, "0")}` : ""}</span></span>
                    {track.previewUrl ? <Button type="button" size="icon" variant="outline" aria-label={previewingAudioId === track.id ? t("Pausar {title}", { title: track.title }) : t("Ouvir {title}", { title: track.title })} onClick={() => void toggleAudioPreview(track)} className="h-9 w-9 shrink-0">{previewingAudioId === track.id ? <RiPauseFill size={17} /> : <RiPlayFill size={17} />}</Button> : track.previewLink ? <a href={track.previewLink} target="_blank" rel="noreferrer" aria-label={t("Abrir prévia de {title} no Instagram", { title: track.title })} className="flex h-9 shrink-0 items-center rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-indigo-700">{t("Ouvir")}</a> : null}
                    <Button type="button" size="sm" variant={selectedAudioTrack?.id === track.id ? "default" : "outline"} onClick={() => { audioPreviewRef.current?.pause(); setPreviewingAudioId(null); setSelectedAudioTrack(current => current?.id === track.id ? null : track) }} className="h-9 shrink-0 px-3 text-xs">{selectedAudioTrack?.id === track.id ? t("Selecionada") : t("Usar faixa")}</Button>
                  </li>)}
                </ul>}
                {selectedAudioTrack && <div className="space-y-3 rounded-lg bg-indigo-50/70 p-3">
                  <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-xs text-indigo-950"><span className="font-semibold">{t("Faixa escolhida:")}</span> {selectedAudioTrack.title}{selectedAudioTrack.artist ? ` · ${selectedAudioTrack.artist}` : ""}</p><button type="button" onClick={() => setSelectedAudioTrack(null)} className="shrink-0 text-xs font-semibold text-indigo-700 underline">{t("Remover")}</button></div>
                  <label className="block text-xs text-slate-700">{t("Volume da faixa:")} <span className="font-semibold">{audioVolume}%</span><input type="range" min={0} max={100} value={audioVolume} onChange={(event) => { const value = Number(event.target.value); setAudioVolume(value); if (audioPreviewRef.current) audioPreviewRef.current.volume = value / 100 }} className="mt-1 block w-full accent-indigo-600" /></label>
                  <label className="block text-xs text-slate-700">{t("Áudio original do vídeo:")} <span className="font-semibold">{videoVolume}%</span><input type="range" min={0} max={100} value={videoVolume} onChange={(event) => setVideoVolume(Number(event.target.value))} className="mt-1 block w-full accent-indigo-600" /></label>
                </div>}
                <p className="text-[11px] leading-4 text-slate-500">{t("A conta precisa estar conectada pelo Facebook e a faixa deve estar disponível para ela e sua região. O preview do vídeo não mistura a faixa escolhida; a Meta a anexa durante a publicação do Reel.")}</p>
              </section> : postType === "REEL" ? <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">{t("A biblioteca de música e áudio está disponível somente para Reels publicados no Instagram.")}</p> : null}
              <audio ref={audioPreviewRef} className="hidden" onEnded={() => setPreviewingAudioId(null)} />
            </div>
          </details>

          {/* Scheduling Date and Actions */}
          </div>}

          {step === 4 && <div className="animate-fade-in space-y-5">
            {compatibilityProblems.length > 0 && <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3"><h3 className="text-sm font-bold text-rose-900">{t("Corrija antes de publicar")}</h3><ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-5 text-rose-800">{compatibilityProblems.map(problem => <li key={problem}>{problem}</li>)}</ul></section>}
            <section><h3 className="text-sm font-bold text-slate-900">{t("Redes sociais selecionadas")}</h3><div className="mt-2 flex flex-wrap gap-2">{platforms.map(platform => { const network = platform === "INSTAGRAM" ? { label: `Instagram · @${selectedAccount?.igUsername || t("conta")}`, Icon: SiInstagram, bg: "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" } : platform === "FACEBOOK" ? { label: `Facebook · ${selectedAccount?.pageName || t("Página")}`, Icon: SiFacebook, bg: "bg-[#1877F2]" } : platform === "X" ? { label: `X · @${selectedXAccount?.username || t("conta")}`, Icon: SiX, bg: "bg-black" } : platform === "YOUTUBE" ? { label: `YouTube · ${selectedYouTubeAccount?.title || t("canal")}`, Icon: SiYoutube, bg: "bg-[#ff0033]" } : platform === "TIKTOK" ? { label: `TikTok · ${selectedTikTokAccount?.displayName || t("perfil")}`, Icon: SiTiktok, bg: "bg-black" } : { label: `Threads · @${threadsAccounts.find(account => account.id === threadsAccountId)?.username || t("conta")}`, Icon: SiThreads, bg: "bg-[#101113]" }; return <span key={platform} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${network.bg}`}><network.Icon size={17} color="#fff" title={network.label} /></span>{network.label}</span> })}</div></section>
            <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Formato")}</span><p className="mt-1 text-sm font-semibold text-slate-900">{postType === "FEED" ? t("Foto única") : postType === "CAROUSEL" ? t("Carrossel") : postType === "REEL" ? (platforms.length === 1 && platforms[0] === "YOUTUBE" ? t(YOUTUBE_FORMAT_DETAILS[youtubeSettings.format].name) : platforms.includes("YOUTUBE") ? `${t("Vídeo / Reel")} · ${t(YOUTUBE_FORMAT_DETAILS[youtubeSettings.format].name)}` : t("Vídeo / Reel")) : postType === "STORY" ? t("Story") : t("Post de texto · Threads")}</p></div><div className="rounded-xl border border-slate-200 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Mídia")}</span><p className="mt-1 text-sm font-semibold text-slate-900">{postType === "TEXT" ? t("Somente texto") : mediaItems.length === 1 ? t("1 arquivo") : t("{count} arquivos", { count: mediaItems.length })}</p></div></section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-bold text-slate-900">{t("Resumo do conteúdo")}</h3><div className="mt-3 flex gap-3">{activeMedia && <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">{activeMedia.kind === "video" ? <video src={activeMedia.src} muted playsInline className="h-full w-full object-cover" /> : <img src={activeMedia.src} alt={t("Mídia selecionada")} className="h-full w-full object-cover" />}</div>}<div className="min-w-0"><p className="line-clamp-4 whitespace-pre-wrap text-sm leading-5 text-slate-700">{caption || t("Adicione a legenda na etapa Conteúdo.")}</p>{hashtags.length > 0 && <p className="mt-1 line-clamp-1 text-xs text-indigo-600">{hashtags.map(tag => `#${tag} `)}</p>}</div></div></section>
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><label htmlFor="publish-date" className="text-sm font-semibold text-slate-900">{t("Data e horário para agendar")}</label><p className="mb-2 mt-1 text-xs text-slate-500">{t("A publicação imediata ignora este horário.")}</p><Input id="publish-date" type="datetime-local" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-11 rounded-xl bg-white text-sm font-medium" /></section>
          </div>}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" disabled={step === 1} onClick={() => setStep(current => Math.max(1, current - 1))} className="gap-1"><ChevronLeft size={16} />{t("Voltar")}</Button>
            {step < 4 ? <Button type="button" onClick={() => { if (step === 1 && (!accountId || !platforms.length)) { toast.error(t("Selecione uma rede disponível antes de continuar.")); return } if (step === 2 && formatConflicts.length) { toast.error(compatibilityProblems[0]); return } if (step === 3 && !caption.trim() && !mediaItems.length) { toast.error(t("Adicione uma legenda ou mídia antes de revisar.")); return } if (step === 3 && compatibilityProblems.length) { toast.error(compatibilityProblems[0]); return } setStep(current => current + 1) }} className="gap-1 bg-indigo-600 text-white hover:bg-indigo-700">{t("Continuar")}<ChevronRight size={16} /></Button> : <div className="flex flex-1 justify-end gap-2"><Button type="button" variant="outline" onClick={() => submitPost("schedule")} disabled={isSubmitting} className="gap-2"><CalendarIcon size={16} />{t("Programar para depois")}</Button><Button type="button" onClick={() => submitPost("publish")} disabled={isSubmitting} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Send size={16} />{isSubmitting ? t("Enviando...") : t("Publicar agora")}</Button></div>}
          </div>
        </Card>
      </div>

      {/* Each social destination and post format gets its own native-style preview. */}
      <aside className="w-full min-w-0 xl:sticky xl:top-24 xl:h-fit">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs md:p-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="section-title">{t("Prévia da publicação")}</h3><p className="text-xs text-slate-500">{previewDescription}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><Eye size={17} /></span></div>
          <div className="mt-4 flex w-full gap-1 rounded-md bg-slate-100 p-1" role="tablist" aria-label={t("Prévia por plataforma")}>
            {[{ id: "INSTAGRAM", label: "Instagram", Icon: SiInstagram }, { id: "FACEBOOK", label: "Facebook", Icon: SiFacebook }, { id: "THREADS", label: "Threads", Icon: SiThreads }, { id: "X", label: "X", Icon: SiX }, { id: "YOUTUBE", label: "YouTube", Icon: SiYoutube }, { id: "TIKTOK", label: "TikTok", Icon: SiTiktok }].filter(tab => !platforms.length || platforms.includes(tab.id) || (postType === "STORY" && tab.id === "FACEBOOK")).filter(tab => postType === "TEXT" ? TEXT_ONLY_NETWORKS.includes(tab.id) : postType === "STORY" ? tab.id === "INSTAGRAM" || tab.id === "FACEBOOK" : (tab.id !== "YOUTUBE" && tab.id !== "TIKTOK") || postType === "REEL").map(tab => <button key={tab.id} type="button" role="tab" aria-label={postType === "STORY" && tab.id === "FACEBOOK" ? t("Facebook (prévia visual)") : tab.label} aria-selected={resolvedPreviewPlatform === tab.id} onClick={() => setPreviewPlatform(tab.id)} className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-1.5 py-2 text-[11px] font-semibold transition sm:text-xs ${resolvedPreviewPlatform === tab.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><tab.Icon size={15} title={tab.label} />{postType === "STORY" && tab.id === "FACEBOOK" ? t("Facebook · prévia") : tab.label}</button>)}
          </div>
          {postType === "STORY" && resolvedPreviewPlatform === "FACEBOOK" && <p role="note" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">{t("Apenas prévia visual. Facebook Stories não está habilitado para publicação neste compositor.")}</p>}
          {postType === "CAROUSEL" && resolvedPreviewPlatform === "FACEBOOK" && (mediaItems.some(item => item.kind === "video")
            ? <p role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">{t("Álbuns do Facebook aceitam apenas fotos neste compositor. Remova os vídeos ou desmarque Facebook antes de publicar.")}</p>
            : <p role="note" className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-900">{t("As fotos serão publicadas juntas em uma única publicação da Página, como um álbum. Arraste a imagem ou toque nos pontos para conferir cada foto.")}</p>)}
          {resolvedPreviewPlatform === "YOUTUBE" && postType === "REEL" && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-[11px] font-semibold text-slate-600">{t("Publicar no YouTube como")}</span>
            <div className="flex rounded-md bg-slate-100 p-0.5" role="radiogroup" aria-label={t("Formato no YouTube")}>
              {(["video", "short"] as const).map(format => <button key={format} type="button" role="radio" aria-checked={youtubeSettings.format === format} onClick={() => chooseYouTubeFormat(format)} className={`rounded px-3 py-1 text-[11px] font-semibold transition ${youtubeSettings.format === format ? "bg-white text-[#cc0029] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{format === "video" ? t("Vídeo") : "Short"}</button>)}
            </div>
          </div>}
          <div className="social-preview-native mt-4 flex justify-center">
            <ComposerSocialPreview
              key={resolvedPreviewPlatform}
              postType={postType}
              previewPlatform={resolvedPreviewPlatform}
              selectedAccount={selectedAccount}
              threadsAccount={threadsAccounts.find(account => account.id === threadsAccountId)}
              xAccount={selectedXAccount}
              youtubeAccount={selectedYouTubeAccount}
              youtubeSettings={youtubeSettings}
              tiktokAccount={tiktokCreator.data ? { nickname: tiktokCreator.data.nickname, username: tiktokCreator.data.username, avatarUrl: tiktokCreator.data.avatarUrl } : selectedTikTokAccount ? { nickname: selectedTikTokAccount.displayName, username: selectedTikTokAccount.username, avatarUrl: selectedTikTokAccount.avatarUrl } : undefined}
              tiktokPrivacy={tiktokSettings.privacyLevel}
              media={activeMedia}
              mediaItems={mediaItems}
              activeMediaIndex={activeMediaIndex}
              onSelectMedia={setActiveMediaIndex}
              caption={caption}
              hashtags={hashtags}
              locationName={platforms.includes("INSTAGRAM") ? advancedSettings.locationName : null}
            />
          </div>
          <p className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">{t("A prévia segue a estrutura visual da rede e do formato escolhidos. A aparência final pode variar conforme as atualizações do aplicativo.")}</p>
        </section>
      </aside>
      </div>
    </div>
  )
}
