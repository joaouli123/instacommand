"use client"
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
  Check, CheckCircle2, XCircle, ChevronDown, ChevronLeft, ChevronRight, Mic, Plus, Eye, PencilLine, PlusCircle, Search
} from "lucide-react"
import { SiInstagram, SiFacebook, SiThreads } from "@icons-pack/react-simple-icons"
import { RiMore2Line, RiMusic2Line, RiPauseFill, RiPlayFill } from "@remixicon/react"
import { useDropzone } from "react-dropzone"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { BACKEND_ORIGIN } from "@/lib/config"
import { DailyContentPlan } from "@/components/dashboard/DailyContentPlan"
import { ArtworkStudio } from "@/components/dashboard/ArtworkStudio"
import { selectAccount } from "@/lib/active-account-store"
import { isVideoUrl } from "@/lib/media"
import { getMediaDimensions, SocialPostPreview as ComposerSocialPreview, type MediaItem, type PostType } from "@/components/preview/SocialPostPreview"



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
}

const platformNames: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads" }

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
type InstagramAudioTrack = { id: string; title: string; audioType?: string; durationInMs?: number | null; artist?: string | null; creatorUsername?: string | null; coverUrl?: string | null; previewUrl?: string | null; previewLink?: string | null }
type InstagramUserTag = { username: string; x: number; y: number; mediaIndex: number }
type InstagramAdvancedSettings = { altTexts: string[]; collaborators: string[]; firstComment: string; disableComments: boolean; userTags: InstagramUserTag[] }
type PublishOutcome = { succeeded: string[]; failed: Array<{ platform: string; message: string }>; warnings: Array<{ platform: string; message: string }> }
const emptyInstagramAdvancedSettings = (): InstagramAdvancedSettings => ({ altTexts: [], collaborators: [], firstComment: "", disableComments: false, userTags: [] })

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
  const [caption, setCaption] = useState("")
  const [draftId, setDraftId] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [editorialBrief, setEditorialBrief] = useState<{ creativeBrief?: string; storyIdea?: string; reason?: string } | null>(null)
  const [postType, setPostType] = useState<PostType>("FEED")
  const [selectedDate, setSelectedDate] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
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
  const [isAiGenerated, setIsAiGenerated] = useState(false)
  const [advancedSettings, setAdvancedSettings] = useState<InstagramAdvancedSettings>(emptyInstagramAdvancedSettings)
  const [collaboratorInput, setCollaboratorInput] = useState("")
  const [personTagInput, setPersonTagInput] = useState("")
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
            setSelectedAudioTrack({ id: draft.instagramAudioId, title: draft.instagramAudioTitle || 'Áudio selecionado', artist: draft.instagramAudioArtist || null })
            setAudioVolume(Number.isInteger(draft.instagramAudioVolume) ? draft.instagramAudioVolume : 80)
            setVideoVolume(Number.isInteger(draft.instagramVideoVolume) ? draft.instagramVideoVolume : 60)
          }
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
        setAdvancedSettings(current => ({ ...current, altTexts: [...current.altTexts.slice(0, mediaItems.length), ...itemsToAdd.map(() => "")] }))
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
      setAdvancedSettings(current => ({ ...current, altTexts: [""] , userTags: [] }))
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
    if (!['FEED', 'CAROUSEL', 'REEL'].includes(nextType)) {
      setAdvancedSettings(current => ({ ...current, collaborators: [], firstComment: "", disableComments: false, userTags: [], altTexts: [] }))
    } else if (nextType === 'REEL') {
      setAdvancedSettings(current => ({ ...current, userTags: [], altTexts: [] }))
    } else if (nextType === 'CAROUSEL') {
      setAdvancedSettings(current => ({ ...current, altTexts: [], userTags: [] }))
    } else if (nextType === 'FEED') {
      setAdvancedSettings(current => ({ ...current, altTexts: [], userTags: [] }))
    }
    if (nextType !== "REEL") {
      setSelectedAudioTrack(null)
      setAudioTracks([])
      setPreviewingAudioId(null)
      audioPreviewRef.current?.pause()
    }
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
      toast.error("A biblioteca de áudio está disponível para Reels do Instagram.")
      return
    }
    setAudioSearching(true)
    try {
      const response = await api.searchInstagramAudio(accountId, audioType, audioSearchQuery.trim()) as { items?: InstagramAudioTrack[] }
      setAudioTracks(Array.isArray(response.items) ? response.items : [])
      if (!response.items?.length) toast("Não encontrei faixas para essa busca. Tente outro termo ou veja os áudios em alta.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível buscar áudios do Instagram.")
      setAudioTracks([])
    } finally {
      setAudioSearching(false)
    }
  }

  const toggleAudioPreview = async (track: InstagramAudioTrack) => {
    const player = audioPreviewRef.current
    if (!player || !track.previewUrl) {
      toast("A Meta não forneceu uma prévia de áudio para esta faixa.")
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
      toast.error("Não foi possível reproduzir a prévia dessa faixa.")
    }
  }

  const addCollaborator = () => {
    const username = collaboratorInput.trim().replace(/^@+/, "").toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/i.test(username)) { toast.error("Digite um @usuário válido do Instagram."); return }
    if (advancedSettings.collaborators.includes(username)) { setCollaboratorInput(""); return }
    if (advancedSettings.collaborators.length >= 3) { toast.error("A Meta permite até 3 colaboradores nesta publicação."); return }
    setAdvancedSettings(current => ({ ...current, collaborators: [...current.collaborators, username] }))
    setCollaboratorInput("")
  }

  const addPersonTagAtPosition = (event: MouseEvent<HTMLSpanElement>) => {
    const username = personTagInput.trim().replace(/^@+/, "").toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/i.test(username)) { toast.error("Digite um @usuário válido antes de clicar na foto."); return }
    if (advancedSettings.userTags.length >= 20) { toast.error("A Meta permite até 20 marcações nesta publicação."); return }
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    if (advancedSettings.userTags.some(tag => tag.username === username && tag.mediaIndex === activeMediaIndex)) {
      toast("Esse perfil já está marcado neste item.")
      return
    }
    setAdvancedSettings(current => ({ ...current, userTags: [...current.userTags, { username, x, y, mediaIndex: activeMediaIndex }] }))
    setPersonTagInput("")
  }

  const addPersonTagAtCenter = () => {
    const username = personTagInput.trim().replace(/^@+/, "").toLowerCase()
    if (!/^[a-z0-9._]{1,30}$/i.test(username)) { toast.error("Digite um @usuário válido antes de marcar."); return }
    if (advancedSettings.userTags.length >= 20) { toast.error("A Meta permite até 20 marcações nesta publicação."); return }
    if (advancedSettings.userTags.some(tag => tag.username === username && tag.mediaIndex === activeMediaIndex)) { toast("Esse perfil já está marcado neste item."); return }
    setAdvancedSettings(current => ({ ...current, userTags: [...current.userTags, { username, x: 0.5, y: 0.5, mediaIndex: activeMediaIndex }] }))
    setPersonTagInput("")
  }

  const removePersonTag = (tagIndex: number) => setAdvancedSettings(current => ({
    ...current,
    userTags: current.userTags.filter((_, index) => index !== tagIndex),
  }))

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
      toast.error("Stories só podem ser publicados pelo Instagram neste sistema.")
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
        setPublishOutcome({ succeeded: [], failed: platforms.map(platform => ({ platform, message: platformErrors.find(item => item.platform === platform)?.message || message })), warnings: [] })
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
        platforms, threadsAccountId: platforms.includes('THREADS') ? threadsAccountId : null, status: 'DRAFT',
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
      setIsAiGenerated(false); setAdvancedSettings(emptyInstagramAdvancedSettings()); setCollaboratorInput(""); setPersonTagInput(""); setSelectedAudioTrack(null); setAudioTracks([]); setAudioSearchQuery(""); setPreviewingAudioId(null); audioPreviewRef.current?.pause()
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
            {publishOutcome.warnings.map(({ platform, message }, index) => <div key={`${platform}-${index}`} className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3"><span className="mt-0.5 shrink-0 text-amber-600">!</span><div><p className="text-sm font-semibold text-slate-800">{platformNames[platform] || platform} · Ajuste pendente</p><p className="mt-0.5 break-words text-xs leading-5 text-amber-800">{message}</p></div></div>)}
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
                  const typeLabel = type.id === "REEL" ? platformSpecific?.name || type.label : type.label
                  const typeDescription = type.id === "REEL" ? platformSpecific?.shape || type.description : platformSpecific?.name || type.description
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
                  <span className="text-sm font-bold">{typeLabel}</span><span className="mt-1 text-[11px] leading-4 text-slate-500">{typeDescription}</span>
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
                    {detail.note && <p className="text-[10px] leading-4 text-slate-500">{detail.note}</p>}
                  </article>
                })}
              </div>
              {postType === "TEXT" && <p className="mt-3 text-[11px] leading-4 text-slate-500">O limite de texto do Threads é 500 caracteres. O compositor também permite hashtags dentro desse limite.</p>}
            </div>
          </div>
          }

          {/* Publication targets */}
          {step === 1 && <div className="animate-fade-in rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
                    className={`relative grid min-h-[76px] w-full grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-3 text-left transition-all sm:grid-cols-[48px_minmax(0,1fr)_auto_28px] sm:gap-4 sm:px-4 ${selected ? "border-indigo-600 bg-indigo-50/50 shadow-[0_0_0_1px_rgba(99,102,241,.16)]" : "border-slate-200 bg-white hover:border-slate-300"} ${unavailable ? "cursor-not-allowed opacity-60" : ""}`}
                    aria-pressed={selected}
                  >
                    <span className={`row-span-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:row-span-1 sm:h-12 sm:w-12 ${target.color === "instagram" ? "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" : target.color === "facebook" ? "bg-[#1877F2]" : "bg-[#101113]"}`}>
                      <target.Icon size={25} color="#fff" title={`${target.label} logo`} />
                    </span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-4 text-slate-800">{target.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{target.handle}</span></span>
                    <span className={`col-start-2 row-start-2 inline-flex w-fit items-center gap-1 text-[10px] font-medium sm:col-start-auto sm:row-start-auto sm:rounded-full sm:px-2 sm:py-1 sm:text-xs ${!unavailable ? "text-emerald-700 sm:bg-emerald-50" : "text-slate-500 sm:bg-slate-100"}`}><span className={`h-1.5 w-1.5 rounded-full ${!unavailable ? "bg-emerald-500" : "bg-slate-300"}`} />{target.help}</span>
                    <span className={`col-start-3 row-span-2 row-start-1 flex h-6 w-6 items-center justify-center rounded-full border sm:col-start-4 sm:row-span-1 sm:h-7 sm:w-7 ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{selected && <Check size={14} strokeWidth={3} />}</span>
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
            setAdvancedSettings(current => ({ ...current, altTexts: artworkItems.map(() => ""), userTags: [] }))
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
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Digite uma hashtag e clique em Adicionar ou pressione Enter.</p>

            {hashtags.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Hashtags adicionadas">
              {hashtags.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800">
                #{tag}
                <button type="button" onClick={() => removeHashtag(tag)} aria-label={`Remover hashtag ${tag}`} className="ml-1 rounded-full px-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-900">×</button>
              </span>)}
            </div>}
          </div>

          <details className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-800 marker:hidden">
              <span className="flex items-center gap-2"><RiMore2Line size={18} className="text-indigo-600" />Configurações avançadas</span>
              <ChevronDown size={16} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
            </summary>
            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              {platforms.includes("INSTAGRAM") ? <>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input type="checkbox" checked={isAiGenerated} onChange={(event) => setIsAiGenerated(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">Conteúdo gerado ou alterado por IA</span><span className="mt-1 block text-xs leading-5 text-slate-500">Marca a publicação do Instagram com o aviso de IA. Usar IA apenas para escrever a legenda não exige esta marcação.</span></span>
                </label>

                {(postType === "FEED" || postType === "CAROUSEL" || postType === "REEL") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-collaborators-heading">
                  <div><h3 id="instagram-collaborators-heading" className="text-sm font-semibold text-slate-800">Colaboradores</h3><p className="mt-1 text-xs leading-5 text-slate-500">Convide até 3 perfis para aparecerem como coautores. A Meta pode exigir que cada perfil aceite o convite.</p></div>
                  <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Usuário do Instagram para convidar como colaborador" value={collaboratorInput} maxLength={32} onChange={(event) => setCollaboratorInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCollaborator() } }} placeholder="Ex.: @parceiro" className="h-10 min-w-0 rounded-lg text-sm" /><Button type="button" variant="outline" onClick={addCollaborator} disabled={!collaboratorInput.trim() || advancedSettings.collaborators.length >= 3} className="h-10 shrink-0 border-indigo-200 text-indigo-700">Adicionar</Button></div>
                  {advancedSettings.collaborators.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="Colaboradores escolhidos">{advancedSettings.collaborators.map(username => <li key={username} className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800">@{username}<button type="button" onClick={() => setAdvancedSettings(current => ({ ...current, collaborators: current.collaborators.filter(item => item !== username) }))} aria-label={`Remover @${username}`} className="rounded-full px-1 text-indigo-500 hover:bg-indigo-100">×</button></li>)}</ul>}
                </section>}

                {(postType === "FEED" || postType === "CAROUSEL") && mediaItems.some(item => item.kind === "image") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-alt-text-heading">
                  <div><h3 id="instagram-alt-text-heading" className="text-sm font-semibold text-slate-800">Descrição das fotos (acessibilidade)</h3><p className="mt-1 text-xs leading-5 text-slate-500">Descreva o que aparece em cada imagem para pessoas que usam leitor de tela. Até 1.000 caracteres por foto.</p></div>
                  <div className="space-y-3">{mediaItems.map((item, index) => item.kind === "image" && <label key={item.id} className="block text-xs font-medium text-slate-700">{postType === "CAROUSEL" ? `Foto ${index + 1}` : "Foto"}<textarea maxLength={1000} value={advancedSettings.altTexts[index] || ""} onChange={(event) => setAdvancedSettings(current => { const altTexts = [...current.altTexts]; altTexts[index] = event.target.value; return { ...current, altTexts } })} placeholder="Ex.: João apresenta o projeto em uma sala iluminada." className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal leading-5 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" /><span className="mt-1 block text-right text-[10px] text-slate-400">{(advancedSettings.altTexts[index] || "").length}/1.000</span></label>)}</div>
                </section>}

                {(postType === "FEED" || postType === "CAROUSEL") && mediaItems.some(item => item.kind === "image") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-user-tags-heading">
                  <div><h3 id="instagram-user-tags-heading" className="text-sm font-semibold text-slate-800">Marcar pessoas nas fotos</h3><p className="mt-1 text-xs leading-5 text-slate-500">Digite o @perfil e clique no lugar da foto onde a marcação deve aparecer. Em carrosséis, selecione primeiro a miniatura que quer marcar.</p></div>
                  <Input aria-label="Perfil do Instagram para marcar na foto" value={personTagInput} maxLength={32} onChange={(event) => setPersonTagInput(event.target.value)} placeholder="Ex.: @pessoa" className="h-10 rounded-lg text-sm" />
                  {activeMedia?.kind === "image" ? <div className="flex justify-center overflow-hidden rounded-lg bg-slate-100 p-2"><span role="button" tabIndex={0} aria-label={`Clique na foto ${activeMediaIndex + 1} para posicionar a marcação`} onClick={addPersonTagAtPosition} onKeyDown={(event) => { if (event.key === "Enter") addPersonTagAtCenter() }} className="relative inline-block max-w-full cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"><img src={activeMedia.src} alt="Foto para posicionar as marcações de pessoas" className="block max-h-72 max-w-full object-contain" />{advancedSettings.userTags.filter(tag => tag.mediaIndex === activeMediaIndex).map((tag, index) => <span key={`${tag.username}-${index}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow" style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}>@{tag.username}</span>)}</span></div> : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Selecione uma foto para posicionar a marcação. Vídeos e Stories não aceitam esta marcação neste compositor.</p>}
                  {advancedSettings.userTags.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="Pessoas marcadas">{advancedSettings.userTags.map((tag, index) => <li key={`${tag.username}-${tag.mediaIndex}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">@{tag.username} · foto {tag.mediaIndex + 1}<button type="button" onClick={() => removePersonTag(index)} aria-label={`Remover marcação de @${tag.username}`} className="rounded-full px-1 text-slate-500 hover:bg-slate-200">×</button></li>)}</ul>}
                </section>}

                {(postType === "FEED" || postType === "CAROUSEL" || postType === "REEL") && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-comments-heading">
                  <div><h3 id="instagram-comments-heading" className="text-sm font-semibold text-slate-800">Comentários da publicação</h3><p className="mt-1 text-xs leading-5 text-slate-500">O primeiro comentário é enviado depois do post. Esse recurso depende de uma liberação da Meta; se ela ainda não estiver ativa, o sistema avisa e não envia o post para o Instagram.</p></div>
                  <label htmlFor="instagram-first-comment" className="block text-xs font-medium text-slate-700">Primeiro comentário <span className="font-normal text-slate-400">· opcional</span></label><textarea id="instagram-first-comment" maxLength={2200} value={advancedSettings.firstComment} onChange={(event) => setAdvancedSettings(current => ({ ...current, firstComment: event.target.value }))} placeholder="Escreva o comentário que será enviado após a publicação." className="min-h-20 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-5 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3"><input type="checkbox" checked={advancedSettings.disableComments} onChange={(event) => setAdvancedSettings(current => ({ ...current, disableComments: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><span className="block text-xs font-semibold text-slate-800">Desativar comentários depois de publicar</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">O primeiro comentário, se preenchido, será enviado antes de fechar os comentários.</span></span></label>
                </section>}

                <section className="grid gap-2 sm:grid-cols-3" aria-label="Recursos avançados que ainda não estão liberados">
                  <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3"><p className="text-xs font-semibold text-slate-700">Parceria paga</p><p className="mt-1 text-[11px] leading-4 text-slate-500">Ainda não disponível nesta conexão Meta. O post não será marcado como parceria sem essa liberação.</p></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3"><p className="text-xs font-semibold text-slate-700">Produtos da loja</p><p className="mt-1 text-[11px] leading-4 text-slate-500">Ainda não há um seletor ligado ao catálogo nesta tela; nenhum produto será marcado.</p></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3"><p className="text-xs font-semibold text-slate-700">Localização</p><p className="mt-1 text-[11px] leading-4 text-slate-500">A busca de locais ainda não está ligada à conta; o post sai sem localização.</p></div>
                </section>
              </> : <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">Selecione Instagram para configurar os recursos avançados desta publicação.</p>}

              {postType === "REEL" && platforms.includes("INSTAGRAM") ? <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="instagram-audio-heading">
                <div><h3 id="instagram-audio-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800"><RiMusic2Line size={17} className="text-indigo-600" />Música ou áudio do Instagram</h3><p className="mt-1 text-xs leading-5 text-slate-500">Escolha uma faixa autorizada para anexar ao Reel. A faixa será aplicada na publicação do Instagram; Facebook e Threads continuarão usando o áudio do vídeo original.</p></div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <select aria-label="Tipo de áudio" value={audioType} onChange={(event) => { setAudioType(event.target.value as "music" | "original_sound"); setAudioTracks([]) }} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                    <option value="music">Músicas</option><option value="original_sound">Áudios originais</option>
                  </select>
                  <Input aria-label="Buscar música ou áudio" value={audioSearchQuery} maxLength={100} onChange={(event) => setAudioSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchInstagramAudio() } }} placeholder="Buscar por nome ou artista" className="h-10 rounded-lg text-sm" />
                  <Button type="button" variant="outline" onClick={() => void searchInstagramAudio()} disabled={audioSearching || !accountId} className="h-10 gap-2 border-indigo-200 text-indigo-700"><Search size={15} />{audioSearching ? "Buscando…" : "Buscar"}</Button>
                </div>
                {audioTracks.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Faixas de áudio encontradas">
                  {audioTracks.map((track) => <li key={track.id} className={`flex min-w-0 items-center gap-3 rounded-lg border p-2 ${selectedAudioTrack?.id === track.id ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200"}`}>
                    {track.coverUrl ? <img src={track.coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500"><RiMusic2Line size={18} /></span>}
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{track.title}</span><span className="block truncate text-[11px] text-slate-500">{track.artist || (track.creatorUsername ? `@${track.creatorUsername}` : "Áudio do Instagram")}{track.durationInMs ? ` · ${Math.floor(track.durationInMs / 60000)}:${String(Math.floor(track.durationInMs / 1000) % 60).padStart(2, "0")}` : ""}</span></span>
                    {track.previewUrl ? <Button type="button" size="icon" variant="outline" aria-label={previewingAudioId === track.id ? `Pausar ${track.title}` : `Ouvir ${track.title}`} onClick={() => void toggleAudioPreview(track)} className="h-9 w-9 shrink-0">{previewingAudioId === track.id ? <RiPauseFill size={17} /> : <RiPlayFill size={17} />}</Button> : track.previewLink ? <a href={track.previewLink} target="_blank" rel="noreferrer" aria-label={`Abrir prévia de ${track.title} no Instagram`} className="flex h-9 shrink-0 items-center rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-indigo-700">Ouvir</a> : null}
                    <Button type="button" size="sm" variant={selectedAudioTrack?.id === track.id ? "default" : "outline"} onClick={() => { audioPreviewRef.current?.pause(); setPreviewingAudioId(null); setSelectedAudioTrack(current => current?.id === track.id ? null : track) }} className="h-9 shrink-0 px-3 text-xs">{selectedAudioTrack?.id === track.id ? "Selecionada" : "Usar faixa"}</Button>
                  </li>)}
                </ul>}
                {selectedAudioTrack && <div className="space-y-3 rounded-lg bg-indigo-50/70 p-3">
                  <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-xs text-indigo-950"><span className="font-semibold">Faixa escolhida:</span> {selectedAudioTrack.title}{selectedAudioTrack.artist ? ` · ${selectedAudioTrack.artist}` : ""}</p><button type="button" onClick={() => setSelectedAudioTrack(null)} className="shrink-0 text-xs font-semibold text-indigo-700 underline">Remover</button></div>
                  <label className="block text-xs text-slate-700">Volume da faixa: <span className="font-semibold">{audioVolume}%</span><input type="range" min={0} max={100} value={audioVolume} onChange={(event) => { const value = Number(event.target.value); setAudioVolume(value); if (audioPreviewRef.current) audioPreviewRef.current.volume = value / 100 }} className="mt-1 block w-full accent-indigo-600" /></label>
                  <label className="block text-xs text-slate-700">Áudio original do vídeo: <span className="font-semibold">{videoVolume}%</span><input type="range" min={0} max={100} value={videoVolume} onChange={(event) => setVideoVolume(Number(event.target.value))} className="mt-1 block w-full accent-indigo-600" /></label>
                </div>}
                <p className="text-[11px] leading-4 text-slate-500">A conta precisa estar conectada pelo Facebook e a faixa deve estar disponível para ela e sua região. O preview do vídeo não mistura a faixa escolhida; a Meta a anexa durante a publicação do Reel.</p>
              </section> : postType === "REEL" ? <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">A biblioteca de música e áudio está disponível somente para Reels publicados no Instagram.</p> : null}
              <audio ref={audioPreviewRef} className="hidden" onEnded={() => setPreviewingAudioId(null)} />
            </div>
          </details>

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
