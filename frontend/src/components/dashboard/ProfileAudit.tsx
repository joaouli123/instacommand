"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import toast from "react-hot-toast"

export type AiAudit = {
  score: number; summary: string; strengths: string[]; opportunities: string[]; actions: string[];
  bioSuggestion: string; nameSuggestion: string; positioning: string; limitations: string[];
}

export function ProfileAudit({ audit, username }: { audit: AiAudit; username: string }) {
  const [name, setName] = useState(audit.nameSuggestion)
  const [bio, setBio] = useState(audit.bioSuggestion)
  const [positioning, setPositioning] = useState(audit.positioning)
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success("Copiado. Nenhuma alteração foi feita no Instagram.") }
    catch { toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.") }
  }
  const report = [
    `Análise de @${username} · Instagram`, `Avaliação heurística da IA: ${audit.score}/100 (não é métrica oficial)`, audit.summary,
    ...[["Pontos fortes", audit.strengths], ["Oportunidades", audit.opportunities], ["Próximas ações", audit.actions], ["Limitações", audit.limitations]]
      .map(([title, items]) => `${title}\n${(items as string[]).map(item => `- ${item}`).join("\n")}`),
    `Nome de exibição sugerido: ${name}`, `Bio sugerida:\n${bio}`, `Posicionamento proposto:\n${positioning}`,
  ].join("\n\n")
  return <Card className="space-y-5 border-indigo-100 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Assistente de IA · @{username}</p><h3 className="mt-1 text-lg font-bold">Análise prática do perfil</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{audit.summary}</p></div>
      <Button type="button" variant="outline" onClick={() => void copy(report)}>Copiar análise completa</Button>
    </div>
    <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">Avaliação da IA: {Math.round(audit.score)}/100. É uma avaliação aproximada baseada na amostra disponível, não uma nota oficial do Instagram.</p>
    <div className="grid gap-3 md:grid-cols-3">{[["Pontos fortes", audit.strengths], ["Oportunidades", audit.opportunities], ["Próximas ações", audit.actions]].map(([title, items]) => <section key={title as string} className="rounded-xl border p-3"><h4 className="font-semibold">{title as string}</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-600">{(items as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul>{!(items as string[]).length && <p className="mt-2 text-sm text-slate-500">Sem evidência suficiente nesta amostra.</p>}</section>)}</div>
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 className="font-semibold text-amber-950">Limitações desta análise</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{audit.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
    <p className="text-sm text-slate-600">Revise e edite as sugestões abaixo. Copiar não altera o perfil. Esta análise não é salva: copie antes de sair da página.</p>
    {[
      { label: "Nome de exibição sugerido (não altera o @)", value: name, change: setName, max: 100 },
      { label: "Bio sugerida", value: bio, change: setBio, max: 500 },
      { label: "Posicionamento proposto", value: positioning, change: setPositioning, max: 1500 },
    ].map(field => <div key={field.label} className="space-y-2"><label className="block text-sm font-semibold">{field.label}<textarea value={field.value} onChange={event => field.change(event.target.value)} maxLength={field.max} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><Button type="button" variant="outline" onClick={() => void copy(field.value)}>Copiar {field.label.split(" ")[0].toLowerCase()}</Button></div>)}
  </Card>
}
