"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, PenSquare, Calendar, BarChart3, 
  Users, TrendingUp, Settings, MessageCircle, ChevronLeft, ChevronRight,
  Instagram, ShieldCheck, MoreHorizontal, Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { User } from '@/types'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Criar Publicação', href: '/composer', icon: PenSquare },
  { name: 'Calendário', href: '/calendar', icon: Calendar },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Contas', href: '/accounts', icon: Instagram },
  { name: 'Concorrentes', href: '/competitors', icon: Users },
  { name: 'Tendências', href: '/trends', icon: TrendingUp },
  { name: 'Comunidade', href: '/community', icon: MessageCircle },
  { name: 'Automações', href: '/automations', icon: Zap },
  { name: 'Configurações', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const userQuery = useQuery<User>({
    queryKey: ['current-user'],
    queryFn: api.getMe,
    staleTime: 5 * 60_000,
  })
  const user = userQuery.data
  const initials = user?.name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'WS'
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
  const mobileMainHrefs = ['/', '/composer', '/calendar', '/analytics']
  const moreItems = navItems.filter((item) => !mobileMainHrefs.includes(item.href))
  const moreActive = moreItems.some((item) => isActive(item.href))

  return (
    <>
    <aside className={cn(
      "flex flex-col border-r border-slate-200/80 bg-white transition-all duration-300 shadow-sm select-none",
      collapsed ? "hidden w-20 md:flex" : "hidden w-64 md:flex"
    )}>
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-100">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 flex items-center justify-center text-white shadow-sm shrink-0">
              <Instagram size={18} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-slate-900 leading-tight">
                InstaCommand
              </span>
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Gestão Profissional
              </span>
            </div>
          </Link>
        )}

        {collapsed && (
          <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 flex items-center justify-center text-white shadow-sm">
            <Instagram size={18} strokeWidth={2.5} />
          </div>
        )}

        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-3">
        {navItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group relative",
                active
                  ? "bg-indigo-50 text-indigo-700 font-semibold shadow-xs" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn(
                "h-5 w-5 shrink-0 transition-colors", 
                active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"
              )} />
              
              {!collapsed && <span>{item.name}</span>}

              {active && (
                <div className="absolute right-0 top-2 bottom-2 w-1 bg-indigo-600 rounded-l-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-slate-200/60">
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center shadow-xs shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-900 truncate">{user?.name || 'Seu workspace'}</span>
                <ShieldCheck size={14} className="text-indigo-600 shrink-0" />
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Workspace</span>
            </div>
          )}
        </div>
      </div>
    </aside>
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/90 bg-white/95 px-1 pt-1.5 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5">
        {[
          { name: 'Início', href: '/', icon: LayoutDashboard },
          { name: 'Criar', href: '/composer', icon: PenSquare },
          { name: 'Agenda', href: '/calendar', icon: Calendar },
          { name: 'Analytics', href: '/analytics', icon: BarChart3 },
        ].map((item) => {
          const active = isActive(item.href)
          return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors', active ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800')}>
            <item.icon size={19} strokeWidth={active ? 2.3 : 1.9} />
            <span className="max-w-full truncate">{item.name}</span>
          </Link>
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais seções" aria-current={moreActive ? 'page' : undefined} className={cn('flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors', moreActive ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800')}>
              <MoreHorizontal size={20} strokeWidth={moreActive ? 2.3 : 1.9} />
              <span>Mais</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="mb-2 w-56 rounded-xl border-slate-200 bg-white p-1.5 shadow-xl">
            {moreItems.map((item) => <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href} className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm', isActive(item.href) && 'bg-indigo-50 font-semibold text-indigo-700')}>
                <item.icon size={17} />{item.name}
              </Link>
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
    </>
  )
}
