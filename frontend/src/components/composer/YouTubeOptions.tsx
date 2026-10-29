"use client"

// Everything the composer asks before a YouTube upload: the format (regular video
// or Short), the watch-page details and the advanced options of YouTube Studio.
import { useState } from "react"
import { ChevronDown, ImagePlus, Loader2, MonitorPlay, Smartphone, X } from "lucide-react"
import { SiYoutube } from "@icons-pack/react-simple-icons"
import { Input } from "@/components/ui/input"
import { fitsYouTubeShort, YOUTUBE_SHORT_MAX_SECONDS, type MediaItem, type YouTubeFormat, type YouTubePrivacy } from "@/components/preview/SocialPostPreview"

export type YouTubeLicense = "youtube" | "creativeCommon"
export type YouTubeSettings = {
  format: YouTubeFormat
  title: string
  privacyStatus: YouTubePrivacy
  madeForKids: boolean | null
  alteredContent: boolean
  categoryId: string
  thumbnailUrl: string | null
  tags: string[]
  defaultLanguage: string | null
  defaultAudioLanguage: string | null
  license: YouTubeLicense
  embeddable: boolean
  publicStatsViewable: boolean
  notifySubscribers: boolean
  recordingDate: string | null
}

export const emptyYouTubeSettings = (): YouTubeSettings => ({
  format: "video", title: "", privacyStatus: "public", madeForKids: null, alteredContent: false, categoryId: "22", thumbnailUrl: null,
  tags: [], defaultLanguage: "pt-BR", defaultAudioLanguage: "pt-BR", license: "youtube", embeddable: true, publicStatsViewable: true, notifySubscribers: true, recordingDate: null,
})

/** YouTube categories offered in the composer (ids from the YouTube Data API). */
export const YOUTUBE_CATEGORIES: Array<[string, string]> = [["22", "Pessoas e blogs"], ["27", "Educação"], ["26", "Guias e estilo"], ["24", "Entretenimento"], ["28", "Ciência e tecnologia"], ["25", "Notícias e política"], ["17", "Esportes"], ["10", "Música"], ["19", "Viagens e eventos"], ["2", "Carros e veículos"], ["15", "Animais"], ["20", "Jogos"], ["23", "Comédia"], ["1", "Filmes e animação"]]
const YOUTUBE_LANGUAGES: Array<[string, string]> = [["pt-BR", "Português (Brasil)"], ["pt-PT", "Português (Portugal)"], ["en", "Inglês"], ["es", "Espanhol"], ["es-419", "Espanhol (América Latina)"], ["fr", "Francês"], ["de", "Alemão"], ["it", "Italiano"], ["ja", "Japonês"]]
const TAGS_LIMIT = 500

export const YOUTUBE_FORMAT_DETAILS: Record<YouTubeFormat, { name: string; shape: string; dimensions: string; note: string }> = {
  video: { name: "Vídeo do YouTube", shape: "Horizontal 16:9 recomendado", dimensions: "1920 × 1080 px · sem limite de 3 minutos", note: "Aparece na página do vídeo, na busca e na página inicial. Aceita miniatura personalizada." },
  short: { name: "YouTube Shorts", shape: "Vertical 9:16 ou quadrado", dimensions: "1080 × 1920 px · até 3 minutos", note: "Aparece no feed de Shorts. A capa é escolhida no app do YouTube." },
}

/** YouTube counts tags with spaces as quoted and joins them with commas. */
const tagsLength = (tags: string[]) => tags.reduce((total, tag) => total + tag.length + (/\s/.test(tag) ? 2 : 0), 0) + Math.max(0, tags.length - 1)

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`

/** Video that YouTube would not publish in the chosen format, or null. */
export function youtubeMediaProblem(format: YouTubeFormat, media: MediaItem | null) {
  if (format !== "short" || media?.kind !== "video" || !media.width || !media.height) return null
  if (media.width > media.height) return "Este vídeo é horizontal: o YouTube só publica como Short vídeos verticais ou quadrados. Escolha Vídeo do YouTube ou envie um vídeo vertical."
  if (media.duration !== undefined && media.duration > YOUTUBE_SHORT_MAX_SECONDS) return `Este vídeo tem ${formatDuration(media.duration)}: Shorts vão até 3 minutos. Escolha Vídeo do YouTube ou envie um vídeo mais curto.`
  return null
}

/** Two big cards to choose between a regular video and a Short. */
export function YouTubeFormatPicker({ value, onChange, media, compact = false }: { value: YouTubeFormat; onChange: (format: YouTubeFormat) => void; media?: MediaItem | null; compact?: boolean }) {
  const options = [
    { id: "video" as const, Icon: MonitorPlay, frame: "aspect-video w-14" },
    { id: "short" as const, Icon: Smartphone, frame: "aspect-[9/16] w-8" },
  ]
  const suggested = media?.kind === "video" && media.width && media.height ? (fitsYouTubeShort(media) ? "short" : "video") : null
  return <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Formato no YouTube">
    {options.map(({ id, Icon, frame }) => {
      const detail = YOUTUBE_FORMAT_DETAILS[id]
      const selected = value === id
      return <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => onChange(id)} className={`relative flex items-start gap-3 rounded-2xl border text-left transition ${compact ? "p-3" : "p-4"} ${selected ? "border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
        <span className={`flex shrink-0 items-center justify-center rounded-xl ${compact ? "h-12 w-12" : "h-16 w-16"} ${selected ? "bg-white" : "bg-slate-50"}`}>
          <span className={`flex items-center justify-center rounded-[5px] bg-[#ff0033] text-white ${frame}`}><Icon size={14} aria-hidden="true" /></span>
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">{detail.name}{suggested === id && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Combina com o seu vídeo</span>}</span>
          <span className="mt-0.5 block text-xs font-medium text-slate-600">{detail.shape} · {detail.dimensions}</span>
          {!compact && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{detail.note}</span>}
        </span>
      </button>
    })}
  </div>
}

function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (value: boolean) => void; label: string; help: string }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
    <span><span className="block text-xs font-semibold text-slate-800">{label}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{help}</span></span>
    <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
    <span aria-hidden="true" className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 ${checked ? "bg-indigo-600" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"}`} /></span>
  </label>
}

const sectionTitle = "text-[11px] font-bold uppercase tracking-wide text-slate-500"
const selectClass = "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800"

export function YouTubeOptions({ settings, onChange, media, hashtags, onUploadThumbnail, thumbnailUploading }: {
  settings: YouTubeSettings
  onChange: (update: (current: YouTubeSettings) => YouTubeSettings) => void
  media: MediaItem | null
  hashtags: string[]
  onUploadThumbnail: (file: File | undefined) => void
  thumbnailUploading: boolean
}) {
  const [tagInput, setTagInput] = useState("")
  const set = <K extends keyof YouTubeSettings>(key: K, value: YouTubeSettings[K]) => onChange(current => ({ ...current, [key]: value }))
  const isShort = settings.format === "short"
  const mediaProblem = youtubeMediaProblem(settings.format, media)
  const becomesShort = !isShort && media?.kind === "video" && fitsYouTubeShort(media)
  const usedTags = tagsLength(settings.tags)

  const addTags = (raw: string[]) => onChange(current => {
    const next = [...current.tags]
    for (const value of raw) {
      const tag = value.replace(/\s+/g, " ").replace(/^#/, "").replace(/[<>]/g, "").trim()
      if (tag && !next.some(item => item.toLowerCase() === tag.toLowerCase()) && tagsLength([...next, tag]) <= TAGS_LIMIT) next.push(tag)
    }
    return { ...current, tags: next }
  })
  const commitTagInput = () => { if (tagInput.trim()) addTags(tagInput.split(",")); setTagInput("") }
  const today = new Date().toISOString().slice(0, 10)

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 md:p-5" aria-labelledby="youtube-options-heading">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff0033]"><SiYoutube size={22} color="#fff" title="YouTube" /></span>
      <div className="min-w-0"><h3 id="youtube-options-heading" className="text-sm font-semibold text-slate-800">Publicação no YouTube</h3><p className="mt-1 text-xs leading-5 text-slate-500">O texto do post vira a descrição do vídeo. Os campos com <span className="text-rose-600">*</span> são obrigatórios.</p></div>
    </div>

    <div className="space-y-2">
      <p className={sectionTitle}>Formato</p>
      <YouTubeFormatPicker value={settings.format} onChange={(format) => set("format", format)} media={media} compact />
      {mediaProblem && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{mediaProblem}</p>}
      {becomesShort && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Este vídeo é vertical e tem até 3 minutos: o YouTube vai exibi-lo como Short, mesmo escolhendo vídeo. <button type="button" onClick={() => set("format", "short")} className="font-semibold underline">Publicar como Short</button></p>}
    </div>

    <div className="space-y-3">
      <p className={sectionTitle}>Título{isShort ? "" : " e miniatura"}</p>
      <label className="block text-xs font-medium text-slate-700">Título <span className="text-rose-600">*</span>
        <Input value={settings.title} maxLength={100} onChange={(event) => set("title", event.target.value)} placeholder={isShort ? "Ex.: 3 erros que travam o seu caixa" : "Ex.: Como organizar as finanças do seu negócio em 3 passos"} aria-label="Título do vídeo no YouTube" className="mt-1.5 h-10 rounded-lg text-sm font-normal" />
        <span className={`mt-1 block text-right text-[10px] ${settings.title.length > 90 ? "text-amber-700" : "text-slate-400"}`}>{settings.title.length}/100</span>
      </label>
      {isShort
        ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">Nos Shorts, a capa é um quadro do próprio vídeo, escolhido no app do YouTube depois da publicação. A API do YouTube não troca a capa de Shorts.</p>
        : <div className="text-xs font-medium text-slate-700">Miniatura <span className="font-normal text-slate-400">· opcional</span>
          <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:w-48">
              {settings.thumbnailUrl
                ? <img src={settings.thumbnailUrl} alt="Miniatura escolhida para o YouTube" className="absolute inset-0 h-full w-full object-cover" />
                : <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] font-normal text-slate-500">Sem miniatura: o YouTube usa um quadro do vídeo</span>}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-indigo-700 hover:border-indigo-300">{thumbnailUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}{settings.thumbnailUrl ? "Trocar imagem" : "Enviar imagem"}<input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={thumbnailUploading} onChange={(event) => { onUploadThumbnail(event.target.files?.[0]); event.target.value = "" }} /></label>
              {settings.thumbnailUrl && <button type="button" onClick={() => set("thumbnailUrl", null)} className="text-left text-xs font-normal text-slate-500 underline">Remover miniatura</button>}
              <span className="text-[10px] font-normal leading-4 text-slate-400">JPG ou PNG, 1280 × 720 px, até 2 MB. Exige canal verificado por telefone.</span>
            </div>
          </div>
        </div>}
    </div>

    <div className="space-y-3">
      <p className={sectionTitle}>Visibilidade e público</p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Visibilidade do vídeo no YouTube">
        {([["public", "Público", "Qualquer pessoa pode encontrar"], ["unlisted", "Não listado", "Só quem tiver o link"], ["private", "Privado", "Só você"]] as const).map(([value, label, help]) => <button key={value} type="button" role="radio" aria-checked={settings.privacyStatus === value} onClick={() => set("privacyStatus", value)} className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left ${settings.privacyStatus === value ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-slate-300"}`}><span className="text-xs font-semibold text-slate-800">{label}</span><span className="text-[11px] text-slate-500">{help}</span></button>)}
      </div>
      <fieldset>
        <legend className="text-xs font-medium text-slate-700">É feito para crianças? <span className="text-rose-600">*</span></legend>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Exigência do YouTube. Vídeos para crianças não têm comentários nem anúncios personalizados.</p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="O vídeo é feito para crianças?">
          {([[false, "Não é conteúdo para crianças"], [true, "Sim, é feito para crianças"]] as const).map(([value, label]) => <button key={String(value)} type="button" role="radio" aria-checked={settings.madeForKids === value} onClick={() => set("madeForKids", value)} className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${settings.madeForKids === value ? "border-indigo-600 bg-indigo-50/60 text-indigo-800 ring-1 ring-indigo-600" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>{label}</button>)}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3"><input type="checkbox" checked={settings.alteredContent} onChange={(event) => set("alteredContent", event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span><span className="block text-xs font-semibold text-slate-800">Conteúdo alterado ou sintético</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">Marque se o vídeo mostra pessoas, lugares ou eventos realistas criados ou modificados (por exemplo, com IA). Edições comuns e efeitos claramente irreais não precisam.</span></span></label>
    </div>

    <div className="space-y-3">
      <p className={sectionTitle}>Detalhes</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700">Categoria
          <select value={settings.categoryId} onChange={(event) => set("categoryId", event.target.value)} className={selectClass}>{YOUTUBE_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </label>
        <label className="block text-xs font-medium text-slate-700">Idioma do título e da descrição
          <select value={settings.defaultLanguage || ""} onChange={(event) => set("defaultLanguage", event.target.value || null)} className={selectClass}><option value="">Não informar</option>{YOUTUBE_LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </label>
        <label className="block text-xs font-medium text-slate-700">Idioma falado no vídeo
          <select value={settings.defaultAudioLanguage || ""} onChange={(event) => set("defaultAudioLanguage", event.target.value || null)} className={selectClass}><option value="">Não informar</option>{YOUTUBE_LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </label>
      </div>
      <div className="text-xs font-medium text-slate-700">
        <div className="flex items-center justify-between gap-2"><span>Tags <span className="font-normal text-slate-400">· ajudam na busca quando a palavra costuma ser escrita errado</span></span><span className={`text-[10px] font-normal ${usedTags > 450 ? "text-amber-700" : "text-slate-400"}`}>{usedTags}/{TAGS_LIMIT}</span></div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 focus-within:border-indigo-400">
          {settings.tags.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-xs font-medium text-slate-700">{tag}<button type="button" aria-label={`Remover tag ${tag}`} onClick={() => set("tags", settings.tags.filter(item => item !== tag))} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200"><X size={12} /></button></span>)}
          <input value={tagInput} onChange={(event) => { const value = event.target.value; if (value.includes(",")) { addTags(value.split(",").slice(0, -1)); setTagInput(value.split(",").at(-1) || "") } else setTagInput(value) }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTagInput() } else if (event.key === "Backspace" && !tagInput && settings.tags.length) set("tags", settings.tags.slice(0, -1)) }} onBlur={commitTagInput} placeholder={settings.tags.length ? "" : "Digite e aperte Enter ou vírgula"} aria-label="Adicionar tag do YouTube" className="h-7 min-w-[140px] flex-1 bg-transparent px-1.5 text-sm font-normal text-slate-800 outline-none" />
        </div>
        {hashtags.some(tag => !settings.tags.some(item => item.toLowerCase() === tag.toLowerCase())) && <button type="button" onClick={() => addTags(hashtags)} className="mt-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900">Usar as hashtags do post como tags</button>}
      </div>
    </div>

    <details className="group rounded-xl border border-slate-200 bg-slate-50/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-slate-800 marker:hidden">Configurações avançadas<ChevronDown size={16} className="text-slate-500 transition group-open:rotate-180" /></summary>
      <div className="space-y-1 border-t border-slate-200 bg-white px-3 pb-3 pt-1">
        <div className="divide-y divide-slate-100">
          <Toggle checked={settings.notifySubscribers} onChange={(value) => set("notifySubscribers", value)} label="Notificar inscritos" help="Os inscritos recebem o aviso de vídeo novo. Desligue para publicações discretas." />
          <Toggle checked={settings.embeddable} onChange={(value) => set("embeddable", value)} label="Permitir incorporação" help="Outros sites podem exibir o vídeo no player do YouTube." />
          <Toggle checked={settings.publicStatsViewable} onChange={(value) => set("publicStatsViewable", value)} label="Mostrar quantas pessoas curtiram" help="O número de curtidas fica visível na página do vídeo." />
        </div>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">Licença
            <select value={settings.license} onChange={(event) => set("license", event.target.value as YouTubeLicense)} className={selectClass}><option value="youtube">Licença padrão do YouTube</option><option value="creativeCommon">Creative Commons (atribuição)</option></select>
          </label>
          <label className="block text-xs font-medium text-slate-700">Data de gravação <span className="font-normal text-slate-400">· opcional</span>
            <span className="mt-1.5 flex items-center gap-2"><input type="date" max={today} value={settings.recordingDate || ""} onChange={(event) => set("recordingDate", event.target.value || null)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800" />{settings.recordingDate && <button type="button" onClick={() => set("recordingDate", null)} className="shrink-0 text-xs font-normal text-slate-500 underline">Limpar</button>}</span>
          </label>
        </div>
        <p className="pt-2 text-[10px] leading-4 text-slate-400">Playlists, legendas, telas finais e a configuração de comentários ficam no YouTube Studio: a API de envio do YouTube não altera esses itens.</p>
      </div>
    </details>
  </section>
}
