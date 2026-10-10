"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import toast from "react-hot-toast"
import { useT } from "@/lib/i18n"

export type AiAudit = {
  score: number; summary: string; strengths: string[]; opportunities: string[]; actions: string[];
  bioSuggestion: string; nameSuggestion: string; positioning: string; limitations: string[];
}

export function ProfileAudit({ audit, username }: { audit: AiAudit; username: string }) {
  const t = useT()
  const [name, setName] = useState(audit.nameSuggestion)
  const [bio, setBio] = useState(audit.bioSuggestion)
  const [positioning, setPositioning] = useState(audit.positioning)
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(t("Copiado. Nenhuma alteração foi feita no Instagram.")) }
    catch { toast.error(t("Não foi possível copiar. Selecione o texto e copie manualmente.")) }
  }
  const report = [
    t("Análise de @{username} · Instagram", { username }), t("Avaliação heurística da IA: {score}/100 (não é métrica oficial)", { score: audit.score }), audit.summary,
    ...[["Pontos fortes", audit.strengths], ["Oportunidades", audit.opportunities], ["Próximas ações", audit.actions], ["Limitações", audit.limitations]]
      .map(([title, items]) => `${t(title as string)}\n${(items as string[]).map(item => `- ${item}`).join("\n")}`),
    `${t("Nome de exibição sugerido")}: ${name}`, `${t("Bio sugerida")}:\n${bio}`, `${t("Posicionamento proposto")}:\n${positioning}`,
  ].join("\n\n")
  return <Card className="space-y-5 border-indigo-100 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{t("Assistente de IA")} · @{username}</p><h3 className="mt-1 text-lg font-bold">{t("Análise prática do perfil")}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{audit.summary}</p></div>
      <Button type="button" variant="outline" onClick={() => void copy(report)}>{t("Copiar análise completa")}</Button>
    </div>
    <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{t("Avaliação da IA: {score}/100. É uma avaliação aproximada baseada na amostra disponível, não uma nota oficial do Instagram.", { score: Math.round(audit.score) })}</p>
    <div className="grid gap-3 md:grid-cols-3">{[["Pontos fortes", audit.strengths], ["Oportunidades", audit.opportunities], ["Próximas ações", audit.actions]].map(([title, items]) => <section key={title as string} className="rounded-xl border p-3"><h4 className="font-semibold">{t(title as string)}</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-600">{(items as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul>{!(items as string[]).length && <p className="mt-2 text-sm text-slate-500">{t("Sem evidência suficiente nesta amostra.")}</p>}</section>)}</div>
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 className="font-semibold text-amber-950">{t("Limitações desta análise")}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{audit.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
    <p className="text-sm text-slate-600">{t("Revise e edite as sugestões abaixo. Copiar não altera o perfil. Esta análise não é salva: copie antes de sair da página.")}</p>
    {[
      { label: "Nome de exibição sugerido (não altera o @)", copyLabel: "Copiar nome", value: name, change: setName, max: 100 },
      { label: "Bio sugerida", copyLabel: "Copiar bio", value: bio, change: setBio, max: 500 },
      { label: "Posicionamento proposto", copyLabel: "Copiar posicionamento", value: positioning, change: setPositioning, max: 1500 },
    ].map(field => <div key={field.label} className="space-y-2"><label className="block text-sm font-semibold">{t(field.label)}<textarea value={field.value} onChange={event => field.change(event.target.value)} maxLength={field.max} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label><Button type="button" variant="outline" onClick={() => void copy(field.value)}>{t(field.copyLabel)}</Button></div>)}
  </Card>
}
