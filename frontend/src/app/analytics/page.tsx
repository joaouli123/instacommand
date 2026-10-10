"use client"
import Link from "next/link"
import { FileText } from "lucide-react"
import { SiFacebook, SiInstagram, SiThreads, SiX } from "@icons-pack/react-simple-icons"
import dynamic from "next/dynamic"
import { PageHeader } from "@/components/layout/PageHeader"

// Each network's report (and recharts) ships in its own chunk; only the tab the
// user opens is downloaded.
function TabPlaceholder() {
  return <div aria-hidden className="h-96 w-full animate-pulse rounded-xl border border-slate-200 bg-white" />
}
const InstagramAnalytics = dynamic(() => import("@/components/dashboard/InstagramAnalytics").then((m) => m.InstagramAnalytics), { ssr: false, loading: TabPlaceholder })
const FacebookReport = dynamic(() => import("@/components/dashboard/FacebookReport").then((m) => m.FacebookReport), { ssr: false, loading: TabPlaceholder })
const ThreadsReport = dynamic(() => import("@/components/dashboard/ThreadsReport").then((m) => m.ThreadsReport), { ssr: false, loading: TabPlaceholder })
const XReport = dynamic(() => import("@/components/dashboard/XReport").then((m) => m.XReport), { ssr: false, loading: TabPlaceholder })
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"

export default function AnalyticsPage() {
  const t = useT()
  return <div className="space-y-6 animate-fade-in">
    <PageHeader eyebrow={t("Desempenho")} title={t("Relatórios")} description={t("Métricas, público e conteúdos do Instagram, Facebook, Threads e X.")} actions={<Link href="/report" className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"><FileText size={16} />{t("Gerar relatório em PDF")}</Link>} />
    <Tabs defaultValue="instagram" className="space-y-6">
    <TabsList aria-label={t("Rede social do relatório")}className="grid h-10 w-full grid-cols-4">
      <TabsTrigger value="instagram" className="min-w-0 gap-1.5 px-2 text-[11px] sm:px-4 sm:text-sm"><SiInstagram size={14} color="currentColor" aria-hidden />Instagram</TabsTrigger>
      <TabsTrigger value="facebook" className="min-w-0 gap-1.5 px-2 text-[11px] sm:px-4 sm:text-sm"><SiFacebook size={14} color="currentColor" aria-hidden />Facebook</TabsTrigger>
      <TabsTrigger value="threads" className="min-w-0 gap-1.5 px-2 text-[11px] sm:px-4 sm:text-sm"><SiThreads size={14} color="currentColor" aria-hidden />Threads</TabsTrigger>
      <TabsTrigger value="x" className="min-w-0 gap-1.5 px-2 text-[11px] sm:px-4 sm:text-sm"><SiX size={13} color="currentColor" aria-hidden />X</TabsTrigger>
    </TabsList>
    <TabsContent value="instagram"><InstagramAnalytics /></TabsContent>
    <TabsContent value="facebook"><FacebookReport /></TabsContent>
    <TabsContent value="threads"><ThreadsReport /></TabsContent>
    <TabsContent value="x"><XReport /></TabsContent>
  </Tabs>
  </div>
}
