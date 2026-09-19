"use client"
import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  ImagePlus, Hash, Calendar as CalendarIcon, Send, 
  Heart, MessageCircle, Bookmark, Share2, MoreHorizontal,
  Layers, Video, Image as ImageIcon, Sparkles
} from "lucide-react"
import { useDropzone } from "react-dropzone"
import toast from "react-hot-toast"

type PostType = "FEED" | "CAROUSEL" | "REEL" | "STORY"

type MediaItem = {
  id: string
  src: string
  name: string
  kind: "image" | "video"
  isObjectUrl: boolean
}

export default function ComposerPage() {
  const [caption, setCaption] = useState("")
  const [postType, setPostType] = useState<PostType>("FEED")
  const [selectedDate, setSelectedDate] = useState("2026-09-21T18:30")
  const [hashtags, setHashtags] = useState<string[]>(["marketingdigital", "designgrafico", "estrategia"])
  const [tagInput, setTagInput] = useState("")
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const mediaItemsRef = useRef<MediaItem[]>([])

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

  const changePostType = (nextType: PostType) => {
    setPostType(nextType)

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

  const handlePublishNow = () => {
    if (mediaItems.length === 0) {
      toast.error("Adicione pelo menos uma imagem ou vídeo antes de publicar.")
      return
    }
    toast.success("Publicação enviada com sucesso para processamento!")
  }

  const handleSchedule = () => {
    if (mediaItems.length === 0) {
      toast.error("Adicione pelo menos uma imagem ou vídeo antes de agendar.")
      return
    }
    toast.success("Publicação programada com sucesso na fila de agendamento!")
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[calc(100vh-8rem)] animate-fade-in">
      {/* Editor Panel */}
      <div className="flex-1 flex flex-col gap-6">
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
                  {postType === "CAROUSEL" ? "Até 10 itens • PNG, JPG, MP4 ou MOV" : "PNG, JPG, MP4 ou MOV até 100MB"}
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
                onClick={handleSchedule}
                className="flex-1 sm:flex-initial gap-2 rounded-xl border-slate-200 text-slate-700 font-semibold h-11 px-5 shadow-xs"
              >
                <CalendarIcon size={16} />
                Agendar Post
              </Button>
              <Button 
                onClick={handlePublishNow}
                className="flex-1 sm:flex-initial gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-11 px-6 shadow-xs shadow-indigo-200"
              >
                <Send size={16} />
                Publicar Agora
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
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 p-[1.5px] shadow-xs">
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-indigo-700">
                  J
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-900 leading-none">joaolucas.design</span>
                <span className="text-[9px] text-slate-400">Patrocinado • São Paulo</span>
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

            <p className="text-xs font-bold text-slate-900 mb-1">
              1.248 curtidas
            </p>

            {/* Caption Text */}
            <div className="text-xs text-slate-800 leading-relaxed break-words">
              <span className="font-bold text-slate-900 mr-1.5">joaolucas.design</span>
              <span>{caption || "Aqui aparecerá a legenda da sua publicação com todo o conteúdo e chamada para ação configurados..."}</span>
              {hashtags.length > 0 && (
                <div className="text-indigo-600 font-medium mt-1">
                  {hashtags.map(t => `#${t} `)}
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400 uppercase mt-2">
              Há 2 minutos • Ver tradução
            </p>
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
