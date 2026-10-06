import { SiFacebook, SiInstagram, SiThreads } from "@icons-pack/react-simple-icons"
import { cn } from "@/lib/utils"

const PLATFORMS = {
  INSTAGRAM: { label: "Instagram", Icon: SiInstagram, color: "#E4405F" },
  FACEBOOK: { label: "Facebook", Icon: SiFacebook, color: "#0866FF" },
  THREADS: { label: "Threads", Icon: SiThreads, color: "#101010" },
} as const

type KnownPlatform = keyof typeof PLATFORMS
const isKnown = (value: string): value is KnownPlatform => value in PLATFORMS

/** Brand colors used as backgrounds (Instagram keeps its gradient). */
const BRAND_STOPS: Record<KnownPlatform, string[]> = {
  INSTAGRAM: ["#833AB4", "#E1306C", "#F56040"],
  FACEBOOK: ["#0866FF", "#0866FF"],
  THREADS: ["#262626", "#000000"],
}

/** CSS background in the post's network colors; several networks blend side by side. */
export const platformBackground = (platforms?: string[] | null) => {
  const known = (platforms || []).filter(isKnown)
  if (!known.length) return "#4F46E5"
  const stops = known.length === 1 ? BRAND_STOPS[known[0]] : known.map((platform) => BRAND_STOPS[platform][Math.floor(BRAND_STOPS[platform].length / 2)])
  return `linear-gradient(120deg, ${stops.join(", ")})`
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
