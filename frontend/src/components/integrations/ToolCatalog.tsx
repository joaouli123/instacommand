"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Laptop, Search, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { scopeBadgeVariant } from "./TokenManager"
import type { CatalogTool } from "./types"

export function ToolCatalog({ tools, categories }: { tools: CatalogTool[]; categories: Record<string, string> }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [open, setOpen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR")
    return tools.filter((tool) => (category === "all" || tool.category === category)
      && (!needle || `${tool.name} ${tool.title} ${tool.description}`.toLocaleLowerCase("pt-BR").includes(needle)))
  }, [tools, query, category])

  const groups = Object.entries(categories).map(([id, label]) => ({ id, label, tools: filtered.filter((tool) => tool.category === id) })).filter((group) => group.tools.length)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={`Buscar entre ${tools.length} ferramentas…`} aria-label="Buscar ferramentas" />
        </div>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoria"
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-60">
          <option value="all">Todas as categorias</option>
          {Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      {!groups.length && <p className="text-sm text-slate-500">Nenhuma ferramenta encontrada.</p>}
      {groups.map((group) => (
        <Card key={group.id} className="overflow-hidden p-0">
          <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">{group.label} <span className="font-medium text-slate-400">· {group.tools.length}</span></h3>
          <ul className="divide-y divide-slate-100">
            {group.tools.map((tool) => {
              const expanded = open === tool.name
              return (
                <li key={tool.name}>
                  <button type="button" onClick={() => setOpen(expanded ? null : tool.name)} aria-expanded={expanded}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-slate-800">{tool.name}</code>
                        <span className="text-sm font-medium text-slate-700">{tool.title}</span>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {tool.scopes.map((scope) => <Badge key={scope} variant={scopeBadgeVariant(scope)} className="px-2 py-0 text-[10px]">{scope}</Badge>)}
                        {tool.annotations?.readOnlyHint && <Badge variant="secondary" className="px-2 py-0 text-[10px]">somente leitura</Badge>}
                        {tool.requiresConfirmation && <Badge variant="danger" className="gap-1 px-2 py-0 text-[10px]"><ShieldAlert size={10} />exige confirmação</Badge>}
                        {tool.localOnly && <Badge variant="outline" className="gap-1 px-2 py-0 text-[10px]"><Laptop size={10} />somente ponte local</Badge>}
                      </span>
                    </span>
                    <ChevronDown size={16} className={cn("mt-1 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} />
                  </button>
                  {expanded && (
                    <div className="space-y-3 bg-slate-50/70 px-5 pb-4 pt-1">
                      <p className="text-sm leading-6 text-slate-600">{tool.description}</p>
                      {tool.params.length ? (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="w-full min-w-[520px] text-left text-xs">
                            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                              <tr><th className="px-3 py-2 font-semibold">Parâmetro</th><th className="px-3 py-2 font-semibold">Tipo</th><th className="px-3 py-2 font-semibold">Descrição</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {tool.params.map((param) => (
                                <tr key={param.name}>
                                  <td className="px-3 py-2 align-top"><code className="font-mono font-semibold text-slate-800">{param.name}</code>{param.required && <span className="ml-1 text-rose-600" title="obrigatório">*</span>}</td>
                                  <td className="px-3 py-2 align-top text-slate-600">{param.type}</td>
                                  <td className="px-3 py-2 align-top leading-5 text-slate-600">{param.description || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="text-xs text-slate-500">Sem parâmetros.</p>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
