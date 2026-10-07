"use client"

import { useState, type ReactNode } from "react"
import { Info } from "lucide-react"

/** Small "i" that explains something on hover, focus or tap (mobile) instead of an always-open box. */
export function InfoTip({ label, children, align = "left" }: { label: string; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false)
  return <span className="group relative inline-flex" onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)} onBlur={() => setOpen(false)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false) }} className="inline-flex rounded-full text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40">
      <Info size={14} />
    </button>
    <span role="tooltip" className={`${open ? "block" : "hidden"} absolute top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-normal normal-case leading-5 tracking-normal text-slate-600 shadow-lg group-hover:block group-focus-within:block ${align === "right" ? "right-0" : "left-0"}`}>{children}</span>
  </span>
}
