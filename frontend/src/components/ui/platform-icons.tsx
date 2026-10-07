import { SiFacebook, SiInstagram, SiThreads, SiX } from "@icons-pack/react-simple-icons"
import { cn } from "@/lib/utils"

const PLATFORMS = {
  INSTAGRAM: { label: "Instagram", Icon: SiInstagram, color: "#E4405F" },
  FACEBOOK: { label: "Facebook", Icon: SiFacebook, color: "#0866FF" },
  THREADS: { label: "Threads", Icon: SiThreads, color: "#101010" },
  X: { label: "X", Icon: SiX, color: "#000000" },
} as const

type KnownPlatform = keyof typeof PLATFORMS
const isKnown = (value: string): value is KnownPlatform => value in PLATFORMS

/** Brand tones used as backgrounds: Instagram pink, Facebook blue, Threads black, X zinc. */
const BRAND_STOPS: Record<KnownPlatform, string[]> = {
  INSTAGRAM: ["#F0407A", "#D6246E"],
  FACEBOOK: ["#2B7BFF", "#0866FF"],
  THREADS: ["#2A2A2A", "#000000"],
  X: ["#52525B", "#3F3F46"],
}

/**
 * CSS background in the tone of the post's network. With several networks the
 * first one sets the color (blending them looked muddy); the icons show the rest.
 */
export const platformBackground = (platforms?: string[] | null) => {
  const first = (platforms || []).find(isKnown)
  if (!first) return "#4F46E5"
  return `linear-gradient(120deg, ${BRAND_STOPS[first].join(", ")})`
}

export const platformLabel = (platform: string) => isKnown(platform) ? PLATFORMS[platform].label : platform

const colorOverride = (color: string | undefined, platform: KnownPlatform) => color || PLATFORMS[platform].color

/** Brand icons for the networks a post goes to, in their official colors. */
export function PlatformIcons({ platforms, size = 12, className, color }: { platforms?: string[] | null; size?: number; className?: string; color?: string }) {
  const known = (platforms || []).filter(isKnown)
  if (!known.length) return null
  return <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)} aria-label={known.map(platformLabel).join(", ")} role="img">
    {known.map((platform) => { const { Icon, label } = PLATFORMS[platform]; return <Icon key={platform} size={size} color={colorOverride(color, platform)} title={label} aria-hidden /> })}
  </span>
}

/** Pill with the network icon and name (used in post details). */
export function PlatformChip({ platform }: { platform: string }) {
  if (!isKnown(platform)) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{platform}</span>
  const { Icon, label } = PLATFORMS[platform]
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700"><span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: platformBackground([platform]) }}><Icon size={11} color="white" aria-hidden /></span>{label}</span>
}
