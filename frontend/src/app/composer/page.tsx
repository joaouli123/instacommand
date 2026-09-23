"use client"
import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ImagePlus, Hash, Calendar as CalendarIcon, Send, 
  Heart, MessageCircle, Bookmark, Share2, MoreHorizontal,
  Layers, Video, Image as ImageIcon, Sparkles,
  Check, ChevronLeft, ChevronRight, Mic, Plus, Eye, PencilLine, PlusCircle
} from "lucide-react"
import { SiInstagram, SiFacebook, SiThreads } from "@icons-pack/react-simple-icons"
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
  const [platforms, setPlatforms] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAiAssistant, setShowAiAssistant] = useState(true)
  const [aiTopic, setAiTopic] = useState("")
  const [aiAudience, setAiAudience] = useState("")
  const [aiTone, setAiTone] = useState("Profissional e próximo")
  const [aiObjective, setAiObjective] = useState("Atrair e gerar conversa")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPlan, setAiPlan] = useState<AiPlanItem[]>([])
  const [step, setStep] = useState(1)
  const [previewPlatform, setPreviewPlatform] = useState("INSTAGRAM")
  const [creationMode, setCreationMode] = useState<"manual" | "ai" | null>("manual")
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
    <div className="space-y-5 animate-fade-in">
      <nav className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-xs md:grid-cols-4 md:gap-5 md:px-7" aria-label="Etapas da publicação">
        {[
          { label: "Onde publicar", help: "Escolha a rede social" },
          { label: "Formato", help: "Defina o tipo de post" },
          { label: "Conteúdo", help: "Crie seu post" },
          { label: "Revisar", help: "Confira e publique" },
        ].map((item, index) => <button key={item.label} type="button" onClick={() => setStep(index + 1)} aria-current={step === index + 1 ? "step" : undefined} className="flex min-w-0 items-center gap-2.5 text-left">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${step === index + 1 ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : step > index + 1 ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-500"}`}>{index + 1}</span>
          <span className="min-w-0"><span className={`block truncate text-xs font-semibold md:text-sm ${step === index + 1 ? "text-indigo-700" : "text-slate-800"}`}>{item.label}</span><span className="hidden truncate text-[11px] text-slate-500 sm:block">{item.help}</span></span>
        </button>)}
      </nav>
      <div className="grid min-h-[calc(100vh-14rem)] min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(390px,1fr)]">
      {/* Editor Panel */}
      <div className="min-w-0 flex-1 flex flex-col gap-6">
        {draftId && <Card className="space-y-2 border-indigo-200 p-4"><p className="font-semibold">Editando rascunho salvo · @{accounts.find(a => a.id === accountId)?.igUsername}</p><p className="text-xs text-slate-500">Adicione as mídias antes de publicar ou agendar. Esta edição mantém a conta original.</p>{editorialBrief && <details><summary className="cursor-pointer text-sm font-semibold">Briefing e Story do plano</summary><p className="mt-2 whitespace-pre-wrap text-sm">{editorialBrief.creativeBrief}</p><p className="mt-2 whitespace-pre-wrap text-sm">Story: {editorialBrief.storyIdea}</p></details>}<Button type="button" variant="outline" disabled={isSubmitting} onClick={saveDraftChanges}>Salvar alterações do rascunho</Button><a href="/calendar" className="ml-3 text-sm text-indigo-700 underline">Calendário</a></Card>}
        <Card className="p-5 md:p-7 border border-slate-200/80 bg-white rounded-2xl shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Nova publicação · etapa {step} de 4</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-[28px]">{["Onde você quer publicar?", "Qual formato você deseja usar?", "Como você quer criar o conteúdo?", "Tudo pronto para publicar?"][step - 1]}</h2><p className="mt-1 text-sm text-slate-500">{["Selecione a rede social onde seu post será publicado.", "Escolha o formato ideal para o seu conteúdo.", "Escreva seu texto, adicione as mídias e personalize o post.", "Revise os detalhes e escolha quando publicar."][step - 1]}</p></div>
          {/* Post Type Selector */}
          {step === 2 && <div className="animate-fade-in">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { id: "FEED", label: "Post único", description: "Uma foto no feed", icon: ImageIcon },
                { id: "CAROUSEL", label: "Carrossel", description: "Várias mídias em um post", icon: Layers },
                { id: "REEL", label: "Reels", description: "Vídeo vertical", icon: Video },
                { id: "STORY", label: "Story", description: "Conteúdo temporário", icon: PlusCircle },
              ].map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => changePostType(type.id as PostType)}
                  aria-pressed={postType === type.id}
                  className={`relative flex min-h-32 flex-col items-start rounded-2xl border p-3 text-left transition-all md:min-h-36 md:p-4 ${
                    postType === type.id
                      ? "border-indigo-600 bg-indigo-50/70 text-indigo-700 shadow-xs ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${postType === type.id ? "bg-white text-indigo-600" : "bg-slate-50 text-slate-500"}`}><type.icon size={21} /></span>
                  <span className="text-sm font-bold">{type.label}</span><span className="mt-1 text-[11px] leading-4 text-slate-500">{type.description}</span>
                  {postType === type.id && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white"><Check size={12} /></span>}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 md:p-5" role="note" aria-label="Requisitos do formato selecionado">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-xs"><ImageIcon size={18} /></span><div><h3 className="text-sm font-bold text-slate-900">Requisitos deste formato</h3><p className="mt-0.5 text-xs text-slate-500">Recomendação de tamanho e limites para preparar a publicação.</p></div></div>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {(postType === "STORY" ? [["Proporção", "9:16 vertical"], ["Tamanho recomendado", "1080 × 1920 px"], ["Acesso via API", "Conta Business"], ["Arquivo", "Este app: até 100 MB"]] : postType === "REEL" ? [["Proporção", "9:16 recomendado"], ["Tamanho recomendado", "1080 × 1920 px"], ["Duração", "3 s a 15 min"], ["Vídeo", "MP4/MOV · app até 100 MB"]] : postType === "CAROUSEL" ? [["Quantidade", "2 a 10 mídias"], ["Proporção", "Igual em todos os itens"], ["Tamanho recomendado", "1080 × 1350 px · 4:5"], ["Arquivo", "Este app: até 100 MB/item"]] : [["Proporção aceita", "1,91:1 a 4:5"], ["Tamanho recomendado", "1080 × 1350 px · 4:5"], ["Imagem", "JPEG"], ["Arquivo", "Este app: até 100 MB"]]).map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-white bg-white/90 px-3 py-2.5"><span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span><span className="mt-1 block text-xs font-semibold leading-4 text-slate-800">{value}</span></div>)}
              </div>
              {postType === "REEL" && <p className="mt-3 text-[11px] leading-4 text-slate-500">A referência da API da Meta aceita arquivos de Reel até 1 GB; o limite próprio do upload do InstaCommand é 100 MB.</p>}
              {postType === "STORY" && <p className="mt-3 text-[11px] leading-4 text-slate-500">No fluxo de publicação via API, Stories estão disponíveis para contas Instagram Business.</p>}
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
                const unavailable = (target.id === "INSTAGRAM" && !selectedAccount) || (target.id === "THREADS" && (!threadsAccounts.length || postType === "STORY")) || (target.id === "FACEBOOK" && (!selectedAccount?.pageName || postType === "STORY"))
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => !unavailable && togglePlatform(target.id)}
                    aria-disabled={unavailable}
                    className={`flex min-h-[78px] w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all ${selected ? "border-indigo-600 bg-indigo-50/50 shadow-[0_0_0_1px_rgba(99,102,241,.16)]" : "border-slate-200 bg-white hover:border-slate-300"} ${unavailable ? "cursor-not-allowed opacity-60" : ""}`}
                    aria-pressed={selected}
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${target.color === "instagram" ? "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" : target.color === "facebook" ? "bg-[#1877F2]" : "bg-[#101113]"}`}>
                      <target.Icon size={25} color="#fff" title={`${target.label} logo`} />
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
            {[{ id: "manual" as const, title: "Fazer por conta", detail: "Escreva o texto, adicione mídias e personalize do seu jeito.", Icon: PencilLine }, { id: "ai" as const, title: "Criar com IA", detail: "Gere uma legenda e hashtags a partir de um tema.", Icon: Sparkles }].map(option => <button key={option.id} type="button" onClick={() => { setCreationMode(option.id); setShowAiAssistant(true) }} aria-pressed={creationMode === option.id} className={`flex min-h-[88px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${creationMode === option.id ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${creationMode === option.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-indigo-600"}`}><option.Icon size={22} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{option.title}</span><span className="mt-1 block text-xs leading-4 text-slate-500">{option.detail}</span></span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${creationMode === option.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>{creationMode === option.id && <Check size={12} />}</span></button>)}
          </div>
          {creationMode === "ai" && <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-4 shadow-xs">
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
          </div>}

          {/* Caption */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="post-caption" className="block text-sm font-semibold text-slate-800">Texto do post</label>
              <span className={`text-xs font-medium ${caption.length > 2100 ? "text-amber-700" : "text-slate-400"}`}>{caption.length.toLocaleString("pt-BR")}/2.200 caracteres</span>
            </div>
            <textarea id="post-caption" className="h-28 w-full resize-y rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-5 text-slate-900 shadow-xs transition placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 md:h-32" placeholder="Escreva sua legenda, conte a ideia e personalize o post..." value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2200} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={speakCaption} disabled={!caption.trim()} className="h-9 gap-2 rounded-lg border-indigo-100 px-3 text-xs text-indigo-700"><Mic size={15} />Ouvir texto</Button>
              <Button type="button" variant="outline" disabled={aiLoading || !caption.trim()} onClick={improveCaption} className="h-9 gap-2 rounded-lg border-indigo-100 px-3 text-xs text-indigo-700"><Sparkles size={15} />{aiLoading ? "Revisando…" : "Melhorar com IA"}</Button>
            </div>
          </div>

          {/* Media upload */}
          <div>
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
                          <video src={item.src} muted playsInline className="w-full h-full object-cover" />
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
          </div>

          <ArtworkStudio disabled={isSubmitting} onUse={files => {
            if (mediaItems.length && !window.confirm('Substituir as mídias selecionadas pelas artes do editor?')) return
            mediaItems.forEach(item => { if (item.isObjectUrl) URL.revokeObjectURL(item.src) })
            setMediaItems(files.map(file => ({ id: crypto.randomUUID(), file, src: URL.createObjectURL(file), name: file.name, kind: 'image' as const, isObjectUrl: true })))
            setPostType(files.length > 1 ? 'CAROUSEL' : 'FEED'); setActiveMediaIndex(0)
            toast.success('Artes anexadas. Revise a prévia e salve o rascunho; nada foi publicado.')
          }} />
          {!draftId && <Button type="button" variant="outline" disabled={isSubmitting || !accountId || !mediaItems.length} onClick={saveDraftChanges}>Salvar como rascunho</Button>}

          {/* Hashtags */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3"><label className="block text-sm font-semibold text-slate-800">Hashtags <span className="font-normal text-slate-400">(opcional)</span></label><span className="text-xs text-slate-400">{hashtags.length} {hashtags.length === 1 ? "hashtag" : "hashtags"}</span></div>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Hash className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  className="rounded-xl pl-9.5 text-sm"
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
          </div>}

          {step === 4 && <div className="animate-fade-in space-y-5">
            <section><h3 className="text-sm font-bold text-slate-900">Redes sociais selecionadas</h3><div className="mt-2 flex flex-wrap gap-2">{platforms.map(platform => { const network = platform === "INSTAGRAM" ? { label: `Instagram · @${selectedAccount?.igUsername || "conta"}`, Icon: SiInstagram, bg: "bg-gradient-to-br from-fuchsia-600 via-pink-500 to-amber-400" } : platform === "FACEBOOK" ? { label: `Facebook · ${selectedAccount?.pageName || "Página"}`, Icon: SiFacebook, bg: "bg-[#1877F2]" } : { label: `Threads · @${threadsAccounts.find(account => account.id === threadsAccountId)?.username || "conta"}`, Icon: SiThreads, bg: "bg-[#101113]" }; return <span key={platform} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${network.bg}`}><network.Icon size={17} color="#fff" title={network.label} /></span>{network.label}</span> })}</div></section>
            <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Formato</span><p className="mt-1 text-sm font-semibold text-slate-900">{postType === "FEED" ? "Post único · foto" : postType === "CAROUSEL" ? "Carrossel" : postType === "REEL" ? "Reel" : "Story"}</p></div><div className="rounded-xl border border-slate-200 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mídia</span><p className="mt-1 text-sm font-semibold text-slate-900">{mediaItems.length} {mediaItems.length === 1 ? "arquivo" : "arquivos"}</p></div></section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-bold text-slate-900">Resumo do conteúdo</h3><div className="mt-3 flex gap-3">{activeMedia && <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">{activeMedia.kind === "video" ? <video src={activeMedia.src} muted playsInline className="h-full w-full object-cover" /> : <img src={activeMedia.src} alt="Mídia selecionada" className="h-full w-full object-cover" />}</div>}<div className="min-w-0"><p className="line-clamp-4 whitespace-pre-wrap text-sm leading-5 text-slate-700">{caption || "Adicione a legenda na etapa Conteúdo."}</p>{hashtags.length > 0 && <p className="mt-1 line-clamp-1 text-xs text-indigo-600">{hashtags.map(tag => `#${tag} `)}</p>}</div></div></section>
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><label htmlFor="publish-date" className="text-sm font-semibold text-slate-900">Data e horário para agendar</label><p className="mb-2 mt-1 text-xs text-slate-500">A publicação imediata ignora este horário.</p><Input id="publish-date" type="datetime-local" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-11 rounded-xl bg-white text-sm font-medium" /></section>
          </div>}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" disabled={step === 1} onClick={() => setStep(current => Math.max(1, current - 1))} className="gap-1"><ChevronLeft size={16} />Voltar</Button>
            {step < 4 ? <Button type="button" onClick={() => { if (step === 1 && (!accountId || !platforms.length)) { toast.error("Selecione uma rede disponível antes de continuar."); return } if (step === 3 && !caption.trim() && !mediaItems.length) { toast.error("Adicione uma legenda ou mídia antes de revisar."); return } setStep(current => current + 1) }} className="gap-1 bg-indigo-600 text-white hover:bg-indigo-700">Continuar<ChevronRight size={16} /></Button> : <div className="flex flex-1 justify-end gap-2"><Button type="button" variant="outline" onClick={() => submitPost("schedule")} disabled={isSubmitting} className="gap-2"><CalendarIcon size={16} />Programar para depois</Button><Button type="button" onClick={() => submitPost("publish")} disabled={isSubmitting} className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"><Send size={16} />{isSubmitting ? "Enviando..." : "Publicar agora"}</Button></div>}
          </div>
        </Card>
      </div>

      {/* Live, proportional social preview */}
      <aside className="w-full min-w-0 xl:sticky xl:top-24 xl:h-fit">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs md:p-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900">Prévia da publicação</h3><p className="text-xs text-slate-500">Veja como o conteúdo se adapta à rede.</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><Eye size={17} /></span></div>
          <div className="mt-4 flex w-full gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Prévia por plataforma">
            {[{ id: "INSTAGRAM", label: "Instagram", Icon: SiInstagram }, { id: "FACEBOOK", label: "Facebook", Icon: SiFacebook }, { id: "THREADS", label: "Threads", Icon: SiThreads }].map(tab => <button key={tab.id} type="button" role="tab" aria-selected={previewPlatform === tab.id} onClick={() => setPreviewPlatform(tab.id)} className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-[11px] font-semibold transition sm:text-xs ${previewPlatform === tab.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><tab.Icon size={15} title={tab.label} />{tab.label}</button>)}
          </div>
          <div className="mt-4 flex justify-center">
            <div className="w-full max-w-[300px] rounded-[2.7rem] border-[7px] border-slate-900 bg-slate-900 p-[3px] shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)]">
              <div className="overflow-hidden rounded-[2.15rem] bg-white">
                <div className="flex h-8 items-center justify-between px-5 text-[9px] font-semibold text-slate-900"><span>9:41</span><span className="h-[15px] w-[76px] rounded-full bg-slate-950" /><span>●●● ▰</span></div>
                {postType === "STORY" || postType === "REEL" ? <div className="relative overflow-hidden bg-slate-950 text-white">
                  <div className={`relative aspect-[9/16] w-full ${activeMedia ? "" : "bg-gradient-to-b from-slate-700 to-slate-950"}`}>
                    {activeMedia && (activeMedia.kind === "video" ? <video src={activeMedia.src} autoPlay muted loop playsInline className="h-full w-full object-cover" /> : <img src={activeMedia.src} alt="Prévia da publicação" className="h-full w-full object-cover" />)}
                    {!activeMedia && <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white/80"><ImageIcon size={27} /><span className="mt-3 text-sm">Sua mídia vertical aparecerá aqui</span><span className="mt-1 text-xs text-white/60">Proporção 9:16</span></div>}
                    <div className="absolute inset-x-3 top-3 flex items-center gap-2"><div className="h-1 flex-1 rounded-full bg-white/80" /><div className="h-1 flex-1 rounded-full bg-white/40" /></div>
                    <div className="absolute inset-x-4 bottom-5 flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-indigo-500 text-xs font-bold">{selectedAccount?.igUsername?.[0]?.toUpperCase() || "?"}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">@{selectedAccount?.igUsername || "sua_conta"}</p><p className="line-clamp-2 text-[11px] text-white/90">{caption || "Sua legenda aparece sobre o vídeo."}</p></div><Heart size={19} /></div>
                  </div>
                </div> : <>
                  <div className="flex h-11 items-center justify-between border-b border-slate-100 px-3"><span className="font-serif text-base font-bold tracking-tight text-slate-900">{previewPlatform === "FACEBOOK" ? "facebook" : previewPlatform === "THREADS" ? "Threads" : "Instagram"}</span><div className="flex items-center gap-3 text-slate-900"><Plus size={16} /><MessageCircle size={16} /></div></div>
                  <div className="flex h-12 items-center justify-between px-3"><div className="flex min-w-0 items-center gap-2"><div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 p-[2px]"><div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white text-[10px] font-bold text-indigo-700">{selectedAccount?.igProfilePicUrl ? <img src={selectedAccount.igProfilePicUrl} alt="" className="h-full w-full object-cover" /> : selectedAccount?.igUsername?.[0]?.toUpperCase() || "?"}</div></div><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-slate-900">{previewPlatform === "FACEBOOK" ? selectedAccount?.pageName || "Sua Página" : previewPlatform === "THREADS" ? threadsAccounts.find(account => account.id === threadsAccountId)?.username || "Sua conta Threads" : selectedAccount?.igUsername || "Sua conta"}</p><p className="text-[9px] text-slate-500">{previewPlatform === "FACEBOOK" ? "Publicação" : "São Paulo, Brasil"}</p></div></div><MoreHorizontal size={17} className="shrink-0 text-slate-500" /></div>
                  <div className={`relative w-full overflow-hidden bg-slate-100 ${postType === "CAROUSEL" && mediaItems.length > 1 ? "" : ""} ${postType === "FEED" || postType === "CAROUSEL" ? "aspect-[4/5]" : "aspect-[9/16]"}`}>
                    {activeMedia ? activeMedia.kind === "video" ? <video src={activeMedia.src} autoPlay muted loop playsInline className="h-full w-full object-cover" /> : <img src={activeMedia.src} alt="Prévia da publicação" className="h-full w-full object-cover" /> : <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 p-5 text-center"><ImageIcon size={28} className="text-slate-400" /><p className="mt-3 text-sm font-medium text-slate-600">Sua arte aparecerá aqui</p><p className="mt-1 text-xs text-slate-500">Adicione uma mídia para ver a prévia real.</p></div>}
                    {postType === "CAROUSEL" && mediaItems.length > 1 && <span className="absolute right-3 top-3 rounded-full bg-slate-950/65 px-2 py-1 text-[10px] font-semibold text-white">{activeMediaIndex + 1}/{mediaItems.length}</span>}
                    {mediaItems.length > 1 && <><button type="button" aria-label="Mídia anterior" onClick={() => setActiveMediaIndex(current => (current - 1 + mediaItems.length) % mediaItems.length)} className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-800 shadow-sm"><ChevronLeft size={17} /></button><button type="button" aria-label="Próxima mídia" onClick={() => setActiveMediaIndex(current => (current + 1) % mediaItems.length)} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-800 shadow-sm"><ChevronRight size={17} /></button></>}
                  </div>
                  <div className="px-3 pb-3 pt-2"><div className="flex items-center justify-between"><div className="flex items-center gap-3 text-slate-900"><Heart size={18} /><MessageCircle size={17} /><Share2 size={17} /></div><Bookmark size={17} className="text-slate-800" /></div>{mediaItems.length > 1 && <div className="mt-2 flex justify-center gap-1">{mediaItems.map((item, index) => <button type="button" key={item.id} aria-label={`Ver item ${index + 1}`} onClick={() => setActiveMediaIndex(index)} className={`h-1.5 w-1.5 rounded-full ${index === activeMediaIndex ? "bg-indigo-600" : "bg-slate-300"}`} />)}</div>}<p className="mt-2 line-clamp-3 break-words text-[10px] leading-4 text-slate-800"><span className="font-semibold">{previewPlatform === "FACEBOOK" ? selectedAccount?.pageName || "Sua Página" : previewPlatform === "THREADS" ? threadsAccounts.find(account => account.id === threadsAccountId)?.username || "sua_conta" : selectedAccount?.igUsername || "sua_conta"}</span>{" "}{caption || <span className="text-slate-400">A legenda da publicação aparecerá aqui.</span>}</p>{hashtags.length > 0 && <p className="mt-1 line-clamp-1 break-words text-[10px] text-indigo-600">{hashtags.map(tag => `#${tag} `)}</p>}</div>
                </>}
                <div className="flex h-7 items-center justify-center bg-white"><span className="h-1 w-20 rounded-full bg-slate-900" /></div>
              </div>
            </div>
          </div>
          <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">A prévia é uma estimativa. A proporção acompanha o formato escolhido e o feed não exibe Stories.</p>
        </section>
      </aside>
      </div>
    </div>
  )
}
