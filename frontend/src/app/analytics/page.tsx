"use client"
import Link from "next/link"
import { FileText } from "lucide-react"
import { SiFacebook, SiInstagram, SiThreads, SiX } from "@icons-pack/react-simple-icons"
import { XReport } from "@/components/dashboard/XReport"

import { PageHeader } from "@/components/layout/PageHeader"
import { FacebookReport } from "@/components/dashboard/FacebookReport"
import { InstagramAnalytics } from "@/components/dashboard/InstagramAnalytics"
import { ThreadsReport } from "@/components/dashboard/ThreadsReport"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AnalyticsPage() {
  return <div className="space-y-6 animate-fade-in">
    <PageHeader eyebrow="Desempenho" title="Relatórios" description="Métricas, público e conteúdos do Instagram, Facebook e Threads." actions={<Link href="/report" className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"><FileText size={16} />Gerar relatório em PDF</Link>} />
    <Tabs defaultValue="instagram" className="space-y-6">
    <TabsList aria-label="Rede social do relatório" className="grid h-10 w-full grid-cols-4">
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
