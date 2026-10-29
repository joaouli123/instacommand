// Which networks take which format, and what keeps a post from being accepted by
// each selected network. One source for the composer's steps, review and submit.

export type ComposerFormat = "FEED" | "CAROUSEL" | "REEL" | "STORY" | "TEXT"
export type CompatMedia = { kind: "image" | "video"; width?: number; height?: number; duration?: number }

export const FORMAT_PLATFORMS: Record<ComposerFormat, string[]> = {
  FEED: ["INSTAGRAM", "FACEBOOK", "THREADS", "X"],
  CAROUSEL: ["INSTAGRAM", "FACEBOOK", "THREADS", "X"],
  REEL: ["INSTAGRAM", "FACEBOOK", "THREADS", "X", "YOUTUBE"],
  STORY: ["INSTAGRAM"],
  TEXT: ["THREADS", "X"],
}

/** Networks that accept a post with text only. */
export const TEXT_NETWORKS = ["THREADS", "X"]
export const NETWORK_NAMES: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", THREADS: "Threads", X: "X", YOUTUBE: "YouTube" }
const FORMAT_NAMES: Record<ComposerFormat, string> = { FEED: "foto única", CAROUSEL: "carrossel", REEL: "vídeo", STORY: "Story", TEXT: "post só de texto" }

export const YOUTUBE_SHORT_MAX_SECONDS = 180
const X_MAX_MEDIA = 4
const X_MAX_VIDEO_SECONDS = 140
const THREADS_MAX_VIDEO_SECONDS = 300
const INSTAGRAM_REEL_MIN_SECONDS = 3
const INSTAGRAM_REEL_MAX_SECONDS = 900
const INSTAGRAM_STORY_MAX_VIDEO_SECONDS = 60

const listNames = (platforms: string[]) => {
  const names = platforms.map(platform => NETWORK_NAMES[platform] || platform)
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : names[0] || ""
}

const formatSeconds = (seconds: number) => {
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return minutes ? `${minutes} min${rest ? ` ${rest} s` : ""}` : `${rest} s`
}

/** Selected networks that cannot publish this format. */
export const incompatiblePlatforms = (format: ComposerFormat, platforms: string[]) => platforms.filter(platform => !FORMAT_PLATFORMS[format].includes(platform))

/** Why a network is left out of a format, in the user's words. */
export function formatConflictMessage(platform: string, format: ComposerFormat) {
  if (platform === "YOUTUBE") return `O YouTube só publica vídeos: não aceita ${FORMAT_NAMES[format]}. Escolha o formato Vídeo ou desmarque o YouTube.`
  if (format === "STORY") return `Stories só são publicados no Instagram. Desmarque o ${NETWORK_NAMES[platform] || platform} ou escolha outro formato.`
  if (format === "TEXT") return `Post só de texto funciona apenas no Threads e no X. Desmarque o ${NETWORK_NAMES[platform] || platform} ou escolha um formato com mídia.`
  return `O ${NETWORK_NAMES[platform] || platform} não publica ${FORMAT_NAMES[format]}.`
}

/** Shorts are vertical or square and up to 3 minutes; anything else becomes a regular video. */
export function youtubeShortProblem(media: CompatMedia | null | undefined) {
  if (media?.kind !== "video" || !media.width || !media.height) return null
  if (media.width > media.height) return "Este vídeo é horizontal: o YouTube só publica como Short vídeos verticais ou quadrados. Escolha Vídeo do YouTube ou envie um vídeo vertical."
  if (media.duration !== undefined && media.duration > YOUTUBE_SHORT_MAX_SECONDS) return `Este vídeo tem ${formatSeconds(media.duration)}: Shorts vão até 3 minutos. Escolha Vídeo do YouTube ou envie um vídeo mais curto.`
  return null
}

/**
 * Everything that keeps the selected networks from accepting this post, most
 * important first. Empty when every network can publish it. Account, title and
 * text-length checks stay with the composer, which knows the connected accounts.
 */
export function publishProblems({ format, platforms, media, youtubeFormat }: { format: ComposerFormat; platforms: string[]; media: CompatMedia[]; youtubeFormat?: "video" | "short" }): string[] {
  if (!platforms.length) return ["Selecione pelo menos uma rede para publicar."]
  const problems = incompatiblePlatforms(format, platforms).map(platform => formatConflictMessage(platform, format))
  const has = (platform: string) => platforms.includes(platform) && FORMAT_PLATFORMS[format].includes(platform)
  const videos = media.filter(item => item.kind === "video")
  const images = media.filter(item => item.kind === "image")

  if (format === "TEXT") {
    if (media.length) problems.push("Post só de texto não leva fotos nem vídeos. Remova as mídias ou escolha outro formato.")
    return problems
  }
  if (!media.length) {
    if (!platforms.every(platform => TEXT_NETWORKS.includes(platform))) problems.push("Adicione a mídia da publicação.")
    return problems
  }
  if (format === "FEED") {
    if (videos.length) problems.push("Foto única aceita só imagem. Para vídeo, escolha o formato Vídeo.")
    else if (media.length > 1) problems.push("Foto única leva só uma imagem. Para várias, escolha Carrossel.")
  }
  if (format === "REEL" && (media.length !== 1 || images.length)) problems.push("O formato Vídeo usa um único arquivo de vídeo.")
  if (format === "STORY" && media.length !== 1) problems.push("O Story usa uma única foto ou vídeo.")
  if (format === "CAROUSEL") {
    if (media.length < 2) problems.push("O carrossel precisa de pelo menos 2 mídias.")
    if (media.length > 10) problems.push("O carrossel aceita até 10 mídias.")
    if (has("FACEBOOK") && videos.length) problems.push("No Facebook, o álbum aceita só fotos. Remova os vídeos ou desmarque o Facebook.")
    if (has("X") && media.length > X_MAX_MEDIA) problems.push(`O X aceita até ${X_MAX_MEDIA} mídias por post. Use até ${X_MAX_MEDIA} ou desmarque o X.`)
    if (has("X") && videos.length && media.length > 1) problems.push("No X, um post leva até 4 imagens ou 1 vídeo, não os dois juntos. Desmarque o X ou separe o vídeo.")
  }

  // Durations are only known for files measured in the browser.
  for (const video of videos) {
    const seconds = video.duration
    if (seconds === undefined) continue
    if (has("X") && seconds > X_MAX_VIDEO_SECONDS) problems.push(`O X aceita vídeos de até 2 min 20 s, e este tem ${formatSeconds(seconds)}. Corte o vídeo ou desmarque o X.`)
    if (has("THREADS") && seconds > THREADS_MAX_VIDEO_SECONDS) problems.push(`O Threads aceita vídeos de até 5 minutos, e este tem ${formatSeconds(seconds)}. Corte o vídeo ou desmarque o Threads.`)
    if (has("INSTAGRAM") && format === "REEL" && seconds < INSTAGRAM_REEL_MIN_SECONDS) problems.push("O Instagram exige Reels com pelo menos 3 segundos.")
    if (has("INSTAGRAM") && format === "REEL" && seconds > INSTAGRAM_REEL_MAX_SECONDS) problems.push(`Reels do Instagram vão até 15 minutos, e este vídeo tem ${formatSeconds(seconds)}. Corte o vídeo ou desmarque o Instagram.`)
    if (format === "STORY" && seconds > INSTAGRAM_STORY_MAX_VIDEO_SECONDS) problems.push(`Stories do Instagram aceitam vídeos de até 60 segundos, e este tem ${formatSeconds(seconds)}.`)
  }
  if (has("YOUTUBE") && youtubeFormat === "short") {
    const shortProblem = youtubeShortProblem(videos[0])
    if (shortProblem) problems.push(shortProblem)
  }
  return Array.from(new Set(problems))
}

/** Which kinds of file the format takes, to refuse the rest when they are dropped. */
export function acceptedKinds(format: ComposerFormat, platforms: string[]): Array<CompatMedia["kind"]> {
  if (format === "TEXT") return []
  if (format === "FEED") return ["image"]
  if (format === "REEL") return ["video"]
  if (format === "CAROUSEL" && platforms.includes("FACEBOOK")) return ["image"]
  return ["image", "video"]
}
