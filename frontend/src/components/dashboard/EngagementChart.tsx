"use client"
import { ReportChart } from "./LazyCharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"
type Point = { date: string; engagement: number | null; interactions: number | null }
export function EngagementChart({ data, loading = false, error = false, onRetry }: { data: Point[]; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  const t = useT()
  if (loading || error) return <Card className="flex min-h-64 flex-col items-center justify-center gap-3 p-5" role={error ? "alert" : "status"}><p className="text-sm text-slate-500">{t(error ? "Não foi possível carregar as métricas." : "Carregando métricas…")}</p>{error && onRetry && <Button variant="outline" onClick={onRetry}>{t("Tentar novamente")}</Button>}</Card>
  return <ReportChart title="Interações nas publicações" description="Contadores conhecidos dos posts publicados em cada data, acumulados até a coleta. Totais podem ser parciais." rows={data} series={[{ key: "interactions", label: "Interações", color: "#4f46e5" }]} kind="bar" filename="interacoes"/>
}
