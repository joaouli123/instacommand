import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-2xl border border-slate-200/80 bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.04)]", className)}
      {...props}
    />
  )
)
Card.displayName = "Card"

export { Card }
