"use client"
import { ReportChart } from "./ReportChart"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
type Point = { date: string; followers: number }
export function GrowthChart({ data, loading = false, error = false, onRetry }: { data: Point[]; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  if (loading || error) return <Card className="flex min-h-64 flex-col items-center justify-center gap-3 p-5" role={error ? "alert" : "status"}><p className="text-sm text-slate-500">{error ? "Não foi possível carregar o histórico." : "Carregando histórico…"}</p>{error && onRetry && <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}</Card>
  return <ReportChart title="Evolução de seguidores" description="Última observação disponível em cada dia, semana ou mês. Sem preencher dias ausentes com zero." rows={data} series={[{ key: "followers", label: "Seguidores", color: "#4f46e5", aggregation: "last" }]} filename="seguidores"/>
}
