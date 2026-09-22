"use client"
import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ImagePlus, Hash, Calendar as CalendarIcon, Send, 
  Heart, MessageCircle, Bookmark, Share2, MoreHorizontal,
  Layers, Video, Image as ImageIcon, Sparkles, Instagram, Facebook, AtSign
} from "lucide-react"
import { useDropzone } from "react-dropzone"
import toast from "react-hot-toast"
import { api } from "@/lib/api"
import { BACKEND_ORIGIN } from "@/lib/config"
import { DailyContentPlan } from "@/components/dashboard/DailyContentPlan"
import { ArtworkStudio } from "@/components/dashboard/ArtworkStudio"
import { selectAccount } from "@/lib/active-account-store"

type PostType = "FEED" | "CAROUSEL" | "REEL" | "STORY"

type MediaItem = {
  id: string
  src: string
  name: string
  kind: "image" | "video"
  file?: File
  isObjectUrl: boolean
}

type ConnectedAccount = { id: string; igUsername: string; pageName?: string | null; igProfilePicUrl?: string | null; isActive: boolean }
type ThreadsAccount = { id: string; username: string; name?: string | null; isActive: boolean }
type AiPlanItem = { day: string; format: string; topic: string; hook: string; cta: string; suggestedTime: string }

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
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [threadsAccounts, setThreadsAccounts] = useState<ThreadsAccount[]>([])
  const [accountId, setAccountId] = useState("")
  const [threadsAccountId, setThreadsAccountId] = useState("")
  const [platforms, setPlatforms] = useState<string[]>(["INSTAGRAM"])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAiAssistant, setShowAiAssistant] = useState(true)
  const [aiTopic, setAiTopic] = useState("")
  const [aiAudience, setAiAudience] = useState("")
  const [aiTone, setAiTone] = useState("Profissional e próximo")
  const [aiObjective, setAiObjective] = useState("Atrair e gerar conversa")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPlan, setAiPlan] = useState<AiPlanItem[]>([])
  const mediaItemsRef = useRef<MediaItem[]>([])

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
          setMediaItems((draft.mediaUrls || []).map((src: string, i: number) => ({ id: `saved-${i}`, src, name: `Mídia ${i + 1}`, kind: /\.(mp4|mov)(\?|$)/i.test(src) ? 'video' : 'image', isObjectUrl: false })))
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
    onDrop: (acceptedFiles, fileRejections) => {
      if (fileRejections.length > 0) {
        toast.error("Alguns arquivos foram rejeitados. Use imagens ou vídeos de até 100MB.")
      }

      if (acceptedFiles.length === 0) return

      const incomingItems = acceptedFiles.map((file, index): MediaItem => ({
        id: `${file.name}-${file.lastModified}-${index}`,
        src: URL.createObjectURL(file),
        name: file.name,
        kind: file.type.startsWith("video/") ? "video" : "image",
        file,
        isObjectUrl: true,
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

  const changePostType = (nextType: PostType) => {
    setPostType(nextType)

    if (nextType === "STORY") {
      setPlatforms((current) => current.filter((platform) => platform === "INSTAGRAM"))
    } else if (!platforms.length) {
      setPlatforms(["INSTAGRAM"])
    }

    if (nextType !== "CAROUSEL" && mediaItems.length > 1) {
      mediaItems.slice(1).forEach(item => {
        if (item.isObjectUrl) URL.revokeObjectURL(item.src)
      })
      setMediaItems([mediaItems[0]])
      setActiveMediaIndex(0)
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
    if (!tagInput) return
    const clean = tagInput.replace(/^#/, "").trim()
    if (clean && !hashtags.includes(clean)) {
      setHashtags([...hashtags, clean])
      setTagInput("")
    }
  }

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter(t => t !== tag))
  }

  const togglePlatform = (platform: string) => {
    setPlatforms((current) => current.includes(platform)
      ? current.filter((item) => item !== platform)
      : [...current, platform])
  }

  const generateWithAi = async (mode: "caption" | "plan") => {
    if (!aiTopic.trim() && mode === "caption") {
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
    const textOnlyThreads = platforms.length === 1 && platforms[0] === "THREADS"
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
        const result = await api.publishPost(created.id) as { publishSummary?: typeof publishSummary }
        publishSummary = result.publishSummary
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
        setCaption("")
        setMediaItems([])
        setActiveMediaIndex(0)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a publicação.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveDraftChanges = async () => {
    if (isSubmitting) return
    if (!accountId) { toast.error('Selecione uma conta antes de salvar.'); return }
    if (!draftId && !mediaItems.length) { toast.error('Adicione uma mídia antes de criar este rascunho.'); return }
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
  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-8rem)] animate-fade-in">
      {/* Editor Panel */}
      <div className="flex-1 flex flex-col gap-6">
        {draftId && <Card className="space-y-2 border-indigo-200 p-4"><p className="font-semibold">Editando rascunho salvo · @{accounts.find(a => a.id === accountId)?.igUsername}</p><p className="text-xs text-slate-500">Adicione as mídias antes de publicar ou agendar. Esta edição mantém a conta original.</p>{editorialBrief && <details><summary className="cursor-pointer text-sm font-semibold">Briefing e Story do plano</summary><p className="mt-2 whitespace-pre-wrap text-sm">{editorialBrief.creativeBrief}</p><p className="mt-2 whitespace-pre-wrap text-sm">Story: {editorialBrief.storyIdea}</p></details>}<Button type="button" variant="outline" disabled={isSubmitting} onClick={saveDraftChanges}>Salvar alterações do rascunho</Button><a href="/calendar" className="ml-3 text-sm text-indigo-700 underline">Calendário</a></Card>}
        <Card className="p-6 md:p-8 border border-slate-200/80 bg-white rounded-2xl shadow-xs space-y-6">
          {/* Post Type Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 block">
              Formato da Publicação
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: "FEED", label: "Post Único", icon: ImageIcon },
                { id: "CAROUSEL", label: "Carrossel", icon: Layers },
                { id: "REEL", label: "Reels", icon: Video },
                { id: "STORY", label: "Story", icon: Sparkles },
              ].map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => changePostType(type.id as PostType)}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    postType === type.id
                      ? "border-indigo-600 bg-indigo-50/70 text-indigo-700 shadow-xs ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <type.icon size={16} />
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Publication targets */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Onde publicar</p>
                <p className="mt-1 text-xs text-slate-500">Escolha uma ou várias redes para este conteúdo.</p>
              </div>
              <select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="h-9 max-w-[210px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
                aria-label="Conta do Instagram"
                disabled={!!draftId}
              >
                <option value="">Selecione a conta</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>@{account.igUsername}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { id: "INSTAGRAM", label: "Instagram", icon: Instagram, help: "Feed, carrossel, Reels e Stories" },
                { id: "FACEBOOK", label: "Facebook", icon: Facebook, help: postType === "STORY" ? "Stories não disponíveis pela API" : selectedAccount?.pageName ? `Página ${selectedAccount.pageName}` : "Selecione uma conta com Página vinculada" },
                { id: "THREADS", label: "Threads", icon: AtSign, help: postType === "STORY" ? "Stories não disponíveis pela API" : threadsAccounts.length ? `@${threadsAccounts[0].username}` : "Conecte uma conta" },
              ].map((target) => {
                const selected = platforms.includes(target.id)
                const unavailable = (target.id === "THREADS" && (!threadsAccounts.length || postType === "STORY")) || (target.id === "FACEBOOK" && (!selectedAccount?.pageName || postType === "STORY"))
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => !unavailable && togglePlatform(target.id)}
                    aria-disabled={unavailable}
                    className={`rounded-xl border p-3 text-left transition-all ${selected ? "border-indigo-500 bg-white ring-1 ring-indigo-500/20" : "border-slate-200 bg-white/60 hover:border-indigo-300"} ${unavailable ? "cursor-not-allowed opacity-60" : ""}`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><target.icon size={16} className={selected ? "text-indigo-600" : "text-slate-400"} />{target.label}<span className={`ml-auto h-2 w-2 rounded-full ${selected ? "bg-emerald-500" : "bg-slate-300"}`} /></div>
                    <p className="mt-1 text-[11px] text-slate-500">{target.help}</p>
                  </button>
                )
              })}
            </div>
            {platforms.includes("THREADS") && threadsAccounts.length > 1 && (
              <select value={threadsAccountId} onChange={(event) => setThreadsAccountId(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700" aria-label="Conta do Threads">
                {threadsAccounts.map((account) => <option key={account.id} value={account.id}>Threads @{account.username}</option>)}
              </select>
            )}
            {!threadsAccounts.length && <a href={`${BACKEND_ORIGIN}/api/auth/threads`} className="inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-800">Conectar conta do Threads →</a>}
          </div>

          {/* AI assistant */}
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"><Sparkles size={18} /></div>
                <div><p className="text-sm font-bold text-slate-900">Assistente de conteúdo</p><p className="text-xs text-slate-500">Legendas, plano semanal e três posts para organizar seu dia.</p></div>
              </div>
              <button type="button" onClick={() => setShowAiAssistant((current) => !current)} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900">{showAiAssistant ? "Recolher" : "Abrir"}</button>
            </div>
            {showAiAssistant && <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input value={aiTopic} onChange={(event) => setAiTopic(event.target.value)} placeholder="Assunto: ex. dicas para vender mais" aria-label="Assunto para a IA" />
                <Input value={aiAudience} onChange={(event) => setAiAudience(event.target.value)} placeholder="Público: ex. pequenos negócios" aria-label="Público para a IA" />
                <select value={aiObjective} onChange={(event) => setAiObjective(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700" aria-label="Objetivo do conteúdo">
                  <option>Atrair e gerar conversa</option><option>Vender um produto ou serviço</option><option>Educar e gerar autoridade</option><option>Fortalecer relacionamento</option>
                </select>
                <select value={aiTone} onChange={(event) => setAiTone(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700" aria-label="Tom do conteúdo">
                  <option>Profissional e próximo</option><option>Direto e persuasivo</option><option>Leve e descontraído</option><option>Inspirador</option><option>Educativo</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => generateWithAi("caption")} disabled={aiLoading} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Sparkles size={15} />{aiLoading ? "Gerando..." : "Gerar legenda e hashtags"}</Button>
                <Button type="button" variant="outline" onClick={() => generateWithAi("plan")} disabled={aiLoading} className="gap-2 border-indigo-200 text-indigo-700"><CalendarIcon size={15} />Montar plano de 7 dias</Button>
              </div>
              <DailyContentPlan accountId={accountId} topic={aiTopic} audience={aiAudience} tone={aiTone} objective={aiObjective} onEdit={post => {
                if ((caption.trim() || mediaItems.length) && !window.confirm('Substituir a legenda, as hashtags e o formato atuais por este post do plano? As mídias anexadas serão mantidas; confira se combinam com o novo conteúdo.')) return
                setCaption(post.caption)
                setHashtags(post.hashtags.map(tag => tag.replace(/^#/, '')))
                setPostType(post.format === 'IMAGE' ? 'FEED' : post.format)
                toast.success('Texto aplicado ao compositor. Revise as mídias e escolha as redes antes de publicar.')
              }} />
              {aiPlan.length > 0 && <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-indigo-100 bg-white p-3">{aiPlan.map((item, index) => <div key={`${item.day}-${index}`} className="rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-indigo-700">{item.day} · {item.format}</p><span className="text-[11px] text-slate-400">{item.suggestedTime}</span></div><p className="mt-1 text-sm font-semibold text-slate-800">{item.topic}</p><p className="mt-1 text-xs text-slate-500">{item.hook}</p><p className="mt-1 text-xs font-medium text-slate-600">CTA: {item.cta}</p></div>)}</div>}
            </div>}
          </div>

          <ArtworkStudio disabled={isSubmitting} onUse={files => {
            if (mediaItems.length && !window.confirm('Substituir as mídias selecionadas pelas artes do editor?')) return
            mediaItems.forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
            setMediaItems(files.map(file => ({ id: crypto.randomUUID(), file, src: URL.createObjectURL(file), name: file.name, kind: 'image' as const, isObjectUrl: true })))
            setPostType(files.length > 1 ? 'CAROUSEL' : 'FEED'); setActiveMediaIndex(0)
            toast.success('Artes anexadas. Revise a prévia e salve o rascunho; nada foi publicado.')
          }} />
          {!draftId && <Button type="button" variant="outline" disabled={isSubmitting || !accountId || !mediaItems.length} onClick={saveDraftChanges}>Salvar como rascunho</Button>}
          {/* Media Upload */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 block">
              Mídia Visual
            </label>
            {mediaItems.length > 0 && (
              <div className="space-y-3 mb-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {mediaItems.map((item, index) => (
                    <div key={item.id} className="relative aspect-square group">
                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex(index)}
                        title={item.name}
                        className={`w-full h-full overflow-hidden rounded-xl border bg-slate-100 transition-all ${
                          index === activeMediaIndex
                            ? "border-indigo-600 ring-2 ring-indigo-500/25"
                            : "border-slate-200 hover:border-indigo-300"
                        }`}
                      >
                        {item.kind === "video" ? (
                          <video src={item.src} muted playsInline className="w-full h-full object-cover" />
                        ) : (
                          <img src={item.src} alt={item.name} className="w-full h-full object-cover" />
                        )}
                      </button>
                      <span className="absolute left-2 top-2 min-w-5 h-5 px-1 rounded-full bg-slate-950/75 text-white text-[10px] font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        aria-label={`Remover ${item.name}`}
                        className="absolute right-2 top-2 w-6 h-6 rounded-full bg-white/95 text-slate-700 shadow-sm text-sm leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-rose-50 hover:text-rose-600"
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

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-2xl ${mediaItems.length > 0 ? "p-4" : "p-8"} flex items-center justify-center text-center cursor-pointer transition-all ${
                isDragActive
                  ? "border-indigo-500 bg-indigo-50/50"
                  : "border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              <input {...getInputProps()} />
              <div className={`w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs ${mediaItems.length > 0 ? "mr-3" : "mb-3"}`}>
                <ImagePlus size={22} />
              </div>
              <div className={mediaItems.length > 0 ? "text-left" : "text-center"}>
                <p className="text-sm font-semibold text-slate-800">
                  {isDragActive ? "Solte os arquivos aqui" : mediaItems.length > 0 ? "Adicionar mais mídias" : "Arraste imagens ou vídeos aqui"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {platforms.length === 1 && platforms[0] === "THREADS" ? "Opcional no Threads quando você publicar somente texto • PNG, JPG, MP4 ou MOV" : postType === "CAROUSEL" ? "Até 10 itens • PNG, JPG, MP4 ou MOV" : "PNG, JPG, MP4 ou MOV até 100MB"}
                </p>
              </div>
            </div>
          </div>

          {/* Caption */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Legenda do Post
              </label>
              <span className="text-xs font-medium text-slate-400">{caption.length}/2200 caracteres</span>
            </div>
            <textarea 
              className="w-full h-36 rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all resize-none shadow-xs"
              placeholder="Escreva a legenda com um hook impactante na primeira linha..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={2200}
            />
          </div>

          {/* Hashtags */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
              Palavras-chave e Hashtags
            </label>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Hash className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  className="pl-9.5 rounded-xl text-sm" 
                  placeholder="Digite uma hashtag e pressione Enter..." 
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHashtag())}
                />
              </div>
              <Button 
                variant="outline" 
                onClick={addHashtag}
                className="rounded-xl font-semibold text-xs px-4"
              >
                Inserir
              </Button>
            </div>

            {/* Tag Pills */}
            <div className="flex flex-wrap gap-2">
              {hashtags.map(tag => (
                <Badge 
                  key={tag} 
                  variant="default"
                  className="cursor-pointer hover:bg-indigo-100 transition-colors gap-1 text-xs py-1 px-3"
                  onClick={() => removeHashtag(tag)}
                  title="Clique para remover"
                >
                  #{tag} <span className="opacity-50 hover:opacity-100">×</span>
                </Badge>
              ))}
            </div>
          </div>

          {/* Scheduling Date and Actions */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-4 items-center">
            <div className="w-full sm:w-auto flex-1">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Agendar Disparo</label>
              <Input 
                type="datetime-local" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs font-medium rounded-xl h-10"
              />
            </div>

            <div className="w-full sm:w-auto flex gap-2.5 pt-4 sm:pt-0">
              <Button 
                variant="outline" 
                onClick={() => submitPost("schedule")}
                disabled={isSubmitting}
                className="flex-1 sm:flex-initial gap-2 rounded-xl border-slate-200 text-slate-700 font-semibold h-11 px-5 shadow-xs"
              >
                <CalendarIcon size={16} />
                Agendar Post
              </Button>
              <Button 
                onClick={() => submitPost("publish")}
                disabled={isSubmitting}
                className="flex-1 sm:flex-initial gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-11 px-6 shadow-xs shadow-indigo-200"
              >
                <Send size={16} />
                {isSubmitting ? "Enviando..." : "Publicar Agora"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Realistic Mobile Preview Panel */}
      <div className="w-full lg:w-[380px] flex flex-col items-center shrink-0">
        <div className="w-full mb-3 flex items-center justify-between px-2">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Prévia em Tempo Real
          </span>
          <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            Mockup Instagram
          </span>
        </div>

        {/* Clean iPhone Mockup Frame */}
        <div className="w-[330px] bg-white border-4 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
          {/* Top Notch / Dynamic Island */}
          <div className="h-5 bg-slate-100 flex justify-center items-center border-b border-slate-200">
            <div className="w-20 h-3 bg-slate-300 rounded-full" />
          </div>

          {/* Instagram Post Header */}
          <div className="p-3 flex items-center justify-between border-b border-slate-100 bg-white">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 overflow-hidden rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 p-[1.5px] shadow-xs">
                {selectedAccount?.igProfilePicUrl ? <img src={selectedAccount.igProfilePicUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-[10px] font-bold text-indigo-700">{selectedAccount?.igUsername?.[0]?.toUpperCase() || "?"}</div>}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-900 leading-none">{selectedAccount?.igUsername || "Sua conta"}</span>
                <span className="text-[9px] text-slate-400">Prévia da publicação</span>
              </div>
            </div>
            <MoreHorizontal size={16} className="text-slate-400" />
          </div>

          {/* Media Container */}
          <div className="w-full aspect-square bg-slate-100 relative overflow-hidden flex items-center justify-center">
            {activeMedia ? (
              activeMedia.kind === "video" ? (
                <video src={activeMedia.src} autoPlay muted loop playsInline className="w-full h-full object-cover" />
              ) : (
                <img src={activeMedia.src} alt="Prévia da publicação" className="w-full h-full object-cover" />
              )
            ) : (
              <div className="text-center p-6">
                <ImageIcon size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400 font-medium">Adicione uma mídia para ver a prévia</p>
              </div>
            )}
            <div className="absolute top-3 right-3 bg-white/90 text-slate-700 border border-slate-200 text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-xs shadow-sm">
              {postType === "CAROUSEL" && mediaItems.length > 0 ? `${postType} ${activeMediaIndex + 1}/${mediaItems.length}` : postType}
            </div>
            {mediaItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveMediaIndex(current => (current - 1 + mediaItems.length) % mediaItems.length)}
                  aria-label="Ver mídia anterior"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-slate-800 shadow-sm hover:bg-white"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMediaIndex(current => (current + 1) % mediaItems.length)}
                  aria-label="Ver próxima mídia"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-slate-800 shadow-sm hover:bg-white"
                >
                  →
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 rounded-full bg-slate-950/45 px-2 py-1">
                  {mediaItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveMediaIndex(index)}
                      aria-label={`Ver mídia ${index + 1}`}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${index === activeMediaIndex ? "bg-white" : "bg-white/45"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="p-3 bg-white">
            <div className="flex justify-between items-center mb-2">
              <div className="flex gap-3 text-slate-700">
                <Heart size={20} className="hover:text-rose-500 cursor-pointer transition-colors" />
                <MessageCircle size={20} className="hover:text-indigo-600 cursor-pointer transition-colors" />
                <Share2 size={20} className="hover:text-indigo-600 cursor-pointer transition-colors" />
              </div>
              <Bookmark size={20} className="text-slate-700 hover:text-amber-500 cursor-pointer transition-colors" />
            </div>

            <p className="text-xs font-bold text-slate-900 mb-1">Prévia sem métricas</p>

            {/* Caption Text */}
            <div className="text-xs text-slate-800 leading-relaxed break-words">
              <span className="font-bold text-slate-900 mr-1.5">{selectedAccount?.igUsername || "sua_conta"}</span>
              <span>{caption || "Aqui aparecerá a legenda da sua publicação com todo o conteúdo e chamada para ação configurados..."}</span>
              {hashtags.length > 0 && (
                <div className="text-indigo-600 font-medium mt-1">
                  {hashtags.map(t => `#${t} `)}
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400 uppercase mt-2">Prévia em tempo real</p>
          </div>

          {/* Bottom Bar Indicator */}
          <div className="h-4 bg-white flex justify-center items-center pb-1">
            <div className="w-24 h-1 bg-slate-300 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
