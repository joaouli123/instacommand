"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard API can be blocked (insecure context, permissions); fall back to a hidden textarea.
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand("copy")
    document.body.removeChild(area)
    if (!copied) throw new Error("copy failed")
  }
}

export function CopyButton({ text, label = "Copiar", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await copyText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.")
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Copiado" : label}
      className={cn("inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", className)}>
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
      {copied ? "Copiado" : label}
    </button>
  )
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="group relative mt-2 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{language || "texto"}</span>
        <CopyButton text={code} className="min-h-7 border-white/10 bg-white/5 text-slate-200 hover:border-indigo-400 hover:text-white" />
      </div>
      <pre className="max-h-80 overflow-auto p-3 text-[12px] leading-5 text-slate-100"><code className="whitespace-pre font-mono">{code}</code></pre>
    </div>
  )
}
