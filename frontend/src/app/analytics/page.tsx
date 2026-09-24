"use client"

import { FacebookReport } from "@/components/dashboard/FacebookReport"
import { InstagramAnalytics } from "@/components/dashboard/InstagramAnalytics"
import { ThreadsReport } from "@/components/dashboard/ThreadsReport"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AnalyticsPage() {
  return <Tabs defaultValue="instagram" className="space-y-6">
    <TabsList aria-label="Rede social do relatório" className="grid h-10 w-full grid-cols-3">
      <TabsTrigger value="instagram" className="min-w-0 px-2 text-[11px] sm:px-4 sm:text-sm">Instagram</TabsTrigger>
      <TabsTrigger value="facebook" className="min-w-0 px-2 text-[11px] sm:px-4 sm:text-sm">Facebook</TabsTrigger>
      <TabsTrigger value="threads" className="min-w-0 px-2 text-[11px] sm:px-4 sm:text-sm">Threads</TabsTrigger>
    </TabsList>
    <TabsContent value="instagram"><InstagramAnalytics /></TabsContent>
    <TabsContent value="facebook"><FacebookReport /></TabsContent>
    <TabsContent value="threads"><ThreadsReport /></TabsContent>
  </Tabs>
}
