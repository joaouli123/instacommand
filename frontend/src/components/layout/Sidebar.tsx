"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, PenSquare, Calendar, BarChart3, 
  Users, TrendingUp, Settings, ChevronLeft, ChevronRight 
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Criar Post', href: '/composer', icon: PenSquare },
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
      "flex flex-col border-r border-border bg-card transition-all duration-300",
      collapsed ? "w-20" : "w-64"
    )}>
      <div className="flex h-16 items-center justify-between px-4 border-b border-border">
        {!collapsed && (
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            InstaCommand
          </span>
        )}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-surface text-muted"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors group",
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-text hover:bg-surface hover:text-white"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5", 
                isActive ? "text-primary" : "text-muted group-hover:text-white"
              )} />
              {!collapsed && <span>{item.name}</span>}
              {isActive && !collapsed && (
                <div className="absolute left-0 w-1 h-8 bg-primary rounded-r-md" />
              )}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center shrink-0">
            <span className="font-bold text-white text-sm">JL</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text">João Lucas</span>
              <span className="text-xs text-muted">Plano Pro</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
