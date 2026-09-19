"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, PenSquare, Calendar, BarChart3, 
  Users, TrendingUp, Settings, ChevronLeft, ChevronRight,
  Instagram, ShieldCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Criar Publicação', href: '/composer', icon: PenSquare },
  { name: 'Calendário', href: '/calendar', icon: Calendar },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Concorrentes', href: '/competitors', icon: Users },
  { name: 'Tendências', href: '/trends', icon: TrendingUp },
  { name: 'Configurações', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={cn(
      "flex flex-col border-r border-slate-200/80 bg-white transition-all duration-300 shadow-sm select-none",
      collapsed ? "w-20" : "w-64"
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
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group relative",
                isActive 
                  ? "bg-indigo-50 text-indigo-700 font-semibold shadow-xs" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn(
                "h-5 w-5 shrink-0 transition-colors", 
                isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"
              )} />
              
              {!collapsed && <span>{item.name}</span>}

              {isActive && (
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
            JL
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-900 truncate">João Lucas</span>
                <ShieldCheck size={14} className="text-indigo-600 shrink-0" />
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Administrador</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
