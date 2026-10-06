import type { ComponentType } from "react"
import { SiClaude, SiCursor, SiGithubcopilot, SiGooglegemini, SiModelcontextprotocol } from "@icons-pack/react-simple-icons"
import { RiOpenaiFill, RiTerminalBoxLine } from "@remixicon/react"
import { cn } from "@/lib/utils"

type BrandIcon = ComponentType<{ size?: number | string; color?: string; className?: string }>
type Brand = { Icon: BrandIcon; tile: string }

/** Brand tile for each AI client guide (ids from buildClientGuides). */
export const AI_BRANDS: Record<string, Brand> = {
  chatgpt: { Icon: RiOpenaiFill, tile: "bg-[#10A37F]" },
  claude: { Icon: SiClaude, tile: "bg-[#D97757]" },
  others: { Icon: SiModelcontextprotocol, tile: "bg-gradient-to-br from-indigo-500 to-violet-600" },
  "claude-code": { Icon: SiClaude, tile: "bg-[#D97757]" },
  "claude-desktop-local": { Icon: SiClaude, tile: "bg-[#D97757]" },
  cursor: { Icon: SiCursor, tile: "bg-slate-900" },
  vscode: { Icon: SiGithubcopilot, tile: "bg-slate-900" },
  codex: { Icon: RiOpenaiFill, tile: "bg-slate-900" },
  gemini: { Icon: SiGooglegemini, tile: "bg-[#5B6EF5]" },
  other: { Icon: RiTerminalBoxLine, tile: "bg-slate-600" },
}

export function AiBrandTile({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const brand = AI_BRANDS[id] ?? AI_BRANDS.other
  return <span className={cn("flex shrink-0 items-center justify-center rounded-xl text-white shadow-sm", brand.tile, className)} style={{ width: size, height: size }} aria-hidden>
    <brand.Icon size={Math.round(size * 0.55)} color="white" />
  </span>
}
