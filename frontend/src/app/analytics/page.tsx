"use client"

import { FacebookReport } from "@/components/dashboard/FacebookReport"
import { InstagramAnalytics } from "@/components/dashboard/InstagramAnalytics"
import { ThreadsReport } from "@/components/dashboard/ThreadsReport"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AnalyticsPage() {
  return <Tabs defaultValue="instagram" className="space-y-6">
    <TabsList aria-label="Rede social do relatório">
      <TabsTrigger value="instagram">Instagram</TabsTrigger>
      <TabsTrigger value="facebook">Facebook</TabsTrigger>
      <TabsTrigger value="threads">Threads</TabsTrigger>
    </TabsList>
    <TabsContent value="instagram"><InstagramAnalytics /></TabsContent>
    <TabsContent value="facebook"><FacebookReport /></TabsContent>
    <TabsContent value="threads"><ThreadsReport /></TabsContent>
  </Tabs>
}
