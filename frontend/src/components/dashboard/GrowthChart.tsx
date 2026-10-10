"use client"
import { ReportChart } from "./LazyCharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"
type Point = { date: string; followers: number | null }
export function GrowthChart({ data, loading = false, error = false, onRetry }: { data: Point[]; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  const t = useT()
  if (loading || error) return <Card className="flex min-h-64 flex-col items-center justify-center gap-3 p-5" role={error ? "alert" : "status"}><p className="text-sm text-slate-500">{t(error ? "Não foi possível carregar o histórico." : "Carregando histórico…")}</p>{error && onRetry && <Button variant="outline" onClick={onRetry}>{t("Tentar novamente")}</Button>}</Card>
  return <ReportChart title="Evolução de seguidores" description="Total ao fim de cada dia, semana ou mês. Antes das coletas do InstaCommand, calculado com os ganhos e perdas diários da Meta. Sem preencher dias ausentes com zero." rows={data} series={[{ key: "followers", label: "Seguidores", color: "#4f46e5", aggregation: "last" }]} filename="seguidores" fitToData/>
}
