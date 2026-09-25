"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Public legal documents must remain accessible without an authenticated workspace.
  const isPublicPage = ["/login", "/politica-de-privacidade", "/termos-de-servico", "/exclusao-de-dados"].includes(pathname)
  if (isPublicPage) {
    return <main className="min-h-dvh w-full">{children}</main>
  }

  return (
    <>
      <Sidebar />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-[#f8fafc]">
        <Header />
        <main className="app-main min-w-0 flex-1 overflow-auto px-3 py-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">{children}</main>
      </div>
    </>
  )
}
