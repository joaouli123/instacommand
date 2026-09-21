"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Do not mount workspace navigation or its authenticated queries on login.
  if (pathname === "/login") {
    return <main className="min-h-dvh w-full">{children}</main>
  }

  return (
    <>
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-[#f8fafc]">
        <Header />
        <main className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </>
  )
}
