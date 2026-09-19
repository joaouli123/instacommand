"use client"
import { Bell } from "lucide-react"
import { Button } from "../ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function Header() {
  const pathname = usePathname()
  
  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/composer': 'Criar Novo Post',
    '/calendar': 'Calendário de Publicações',
    '/analytics': 'Análise de Desempenho',
    '/competitors': 'Análise de Concorrentes',
    '/trends': 'Tendências e Insights',
    '/settings': 'Configurações',
    '/accounts': 'Contas Conectadas'
  }

  const title = titles[pathname] || 'InstaCommand'

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10">
      <h1 className="text-xl font-semibold text-text">{title}</h1>
      
      <div className="flex items-center gap-4">
        {/* Placeholder for Account Switcher */}
        <div className="px-3 py-1.5 rounded-md bg-surface border border-border text-sm flex items-center gap-2 cursor-pointer hover:bg-border transition-colors">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400" />
          <span>@minha_empresa</span>
        </div>

        <button className="relative p-2 rounded-full hover:bg-surface text-muted transition-colors">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full border-2 border-card"></span>
        </button>

        <Link href="/composer">
          <Button variant="default" size="sm" className="gap-2">
            Criar Post
          </Button>
        </Link>
      </div>
    </header>
  )
}
