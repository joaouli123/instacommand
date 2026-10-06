import { SiFacebook, SiInstagram, SiThreads } from "@icons-pack/react-simple-icons"
import { cn } from "@/lib/utils"

const PLATFORMS = {
  INSTAGRAM: { label: "Instagram", Icon: SiInstagram, color: "#E4405F" },
  FACEBOOK: { label: "Facebook", Icon: SiFacebook, color: "#0866FF" },
  THREADS: { label: "Threads", Icon: SiThreads, color: "#101010" },
} as const

type KnownPlatform = keyof typeof PLATFORMS
const isKnown = (value: string): value is KnownPlatform => value in PLATFORMS

export const platformLabel = (platform: string) => isKnown(platform) ? PLATFORMS[platform].label : platform

/** Brand icons for the networks a post goes to, in their official colors. */
export function PlatformIcons({ platforms, size = 12, className }: { platforms?: string[] | null; size?: number; className?: string }) {
  const known = (platforms || []).filter(isKnown)
  if (!known.length) return null
  return <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)} aria-label={known.map(platformLabel).join(", ")} role="img">
    {known.map((platform) => { const { Icon, color, label } = PLATFORMS[platform]; return <Icon key={platform} size={size} color={color} title={label} aria-hidden /> })}
  </span>
}

/** Pill with the network icon and name (used in post details). */
export function PlatformChip({ platform }: { platform: string }) {
  if (!isKnown(platform)) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{platform}</span>
  const { Icon, color, label } = PLATFORMS[platform]
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"><Icon size={13} color={color} aria-hidden />{label}</span>
}
