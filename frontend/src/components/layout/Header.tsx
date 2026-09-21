"use client"
import { Bell, Plus, ChevronDown, Check } from "lucide-react"
import { Button } from "../ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useActiveAccount } from "@/hooks/useActiveAccount"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

type NotificationItem = {
  id: string
  title: string
  message: string
  href?: string | null
  readAt?: string | null
  createdAt: string
}

export function Header() {
  const pathname = usePathname()
  
  const titles: Record<string, { title: string; subtitle: string }> = {
    '/': { title: 'Dashboard Executivo', subtitle: 'Visão unificada das suas contas e métricas principais' },
    '/composer': { title: 'Compositor de Conteúdo', subtitle: 'Crie, visualize e agende publicações no Instagram' },
    '/calendar': { title: 'Calendário Editorial', subtitle: 'Cronograma visual de postagens programadas' },
    '/analytics': { title: 'Analytics Avançado', subtitle: 'Métricas de alcance, engajamento e demografia' },
    '/competitors': { title: 'Monitor de Concorrentes', subtitle: 'Benchmarking e acompanhamento de mercado' },
    '/trends': { title: 'Tendências e Insights', subtitle: 'Hashtags em alta e formatos de alta performance' },
    '/settings': { title: 'Configurações da Plataforma', subtitle: 'Preferências, conexões e automações' },
    '/accounts': { title: 'Contas do Instagram', subtitle: 'Gerencie perfis profissionais conectados' }
  }

  const current = titles[pathname] || { title: 'InstaCommand', subtitle: 'Plataforma de Gestão do Instagram' }

  const { accounts, activeAccount, setActiveAccount, isLoading } = useActiveAccount()
  const queryClient = useQueryClient()
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: api.getNotifications,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const notificationPayload = notificationsQuery.data as { items?: NotificationItem[]; unreadCount?: number } | undefined
  const notifications = notificationPayload?.items || []
  const unreadCount = notificationPayload?.unreadCount || 0

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      await api.markNotificationRead(notification.id).catch(() => undefined)
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
    if (notification.href) window.location.assign(notification.href)
  }

  const markAllNotificationsRead = async () => {
    await api.markAllNotificationsRead().catch(() => undefined)
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <header className="h-16 md:h-[72px] border-b border-slate-200/80 bg-white/95 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 md:px-8 sticky top-0 z-20 shadow-sm">
      <div>
        <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight leading-tight">
          {current.title}
        </h1>
        <p className="text-xs text-slate-500 hidden sm:block">
          {current.subtitle}
        </p>
      </div>
      
      <div className="flex items-center gap-3">
        {/* Account Switcher Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 text-sm font-medium text-slate-800 transition-all shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 p-[1.5px] shrink-0 overflow-hidden">
                {activeAccount?.igProfilePicUrl ? <img src={activeAccount.igProfilePicUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-indigo-700">{activeAccount?.igUsername?.substring(0, 1).toUpperCase() || "?"}</div>}
              </div>
              <span className="font-semibold text-xs tracking-tight">{isLoading ? "Carregando..." : activeAccount ? `@${activeAccount.igUsername}` : "Sem conta conectada"}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white border-slate-200 shadow-lg rounded-xl p-1.5">
            <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1.5">
              Alternar conta Instagram
            </DropdownMenuLabel>
            {accounts.map(acc => (
              <DropdownMenuItem
                key={acc.id}
                onClick={() => setActiveAccount(acc.id)}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 flex items-center justify-center text-[9px] font-bold text-white">
                    {acc.igUsername[0].toUpperCase()}
                  </div>
                  <span>@{acc.igUsername}</span>
                </div>
                {activeAccount?.id === acc.id && (
                  <Check size={14} className="text-indigo-600" />
                )}
              </DropdownMenuItem>
            ))}
            {!accounts.length && <DropdownMenuItem disabled className="text-xs text-slate-500">Nenhuma conta ativa</DropdownMenuItem>}
            <DropdownMenuSeparator className="bg-slate-100 my-1" />
            <DropdownMenuItem asChild>
              <Link href="/accounts" className="text-xs text-indigo-600 font-semibold px-2.5 py-2 block hover:bg-indigo-50 rounded-lg">
                Gerenciar todas as contas
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu onOpenChange={(open) => { if (open) notificationsQuery.refetch() }}>
          <DropdownMenuTrigger asChild>
            <button
              className="relative rounded-xl border border-slate-200/80 p-2 text-slate-500 shadow-xs transition-colors hover:bg-slate-100 hover:text-slate-800"
              title="Notificações"
              aria-label="Notificações"
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] bg-white p-1.5 shadow-lg">
            <div className="flex items-center justify-between px-2.5 py-2">
              <DropdownMenuLabel className="p-0 text-xs font-bold uppercase tracking-wider text-slate-400">Notificações</DropdownMenuLabel>
              {unreadCount > 0 && <button type="button" onClick={markAllNotificationsRead} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">Marcar todas como lidas</button>}
            </div>
            <DropdownMenuSeparator className="bg-slate-100" />
            <div className="max-h-80 overflow-y-auto">
              {notifications.length ? notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} onClick={() => openNotification(notification)} className={`mb-1 cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2.5 ${notification.readAt ? "" : "bg-indigo-50/70"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-slate-200" : "bg-indigo-600"}`} />
                  <span className="min-w-0"><span className="block text-xs font-bold text-slate-800">{notification.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{notification.message}</span><span className="mt-1 block text-[10px] text-slate-400">{new Date(notification.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span></span>
                </DropdownMenuItem>
              )) : <p className="px-3 py-8 text-center text-xs text-slate-500">Tudo em dia. Nenhuma notificação.</p>}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick Post Action */}
        <Link href="/composer">
          <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs shadow-indigo-200 h-9 px-3.5">
            <Plus size={16} />
            <span className="hidden sm:inline">Nova Publicação</span>
          </Button>
        </Link>
      </div>
    </header>
  )
}
