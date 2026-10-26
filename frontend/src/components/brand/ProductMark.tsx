import { Command } from "lucide-react"
import { cn } from "@/lib/utils"

/** Product identity, never a social network's logo. Network icons belong to accounts only. */
export function ProductMark({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm", className)}>
    <Command className="h-3/5 w-3/5" strokeWidth={2.4} />
  </span>
}
