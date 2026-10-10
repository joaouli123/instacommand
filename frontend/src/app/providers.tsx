'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import toast, { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SAME_TAB_EVENT, subscribeAccountsConnected } from '@/lib/oauth-broadcast'
import { LanguageProvider, tr } from '@/lib/i18n'

const SYNC_POLL_MS = 3000
const SYNC_WATCH_LIMIT_MS = 3 * 60_000

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        // Keep answers around while the user moves between pages so going back
        // to a report renders instantly from cache.
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        // Most endpoints proxy Meta/X; the default of three retries with backoff
        // made a failing report spin for ~7s and multiplied provider calls.
        retry: 1,
      },
    },
  }))

  useEffect(() => {
    let watching = false
    let disposed = false
    // After a connection, every screen (dashboard, reports, calendar, header)
    // must show the new account, and refresh again once the first import of
    // posts and metrics started by the server finishes.
    const followConnection = async () => {
      await queryClient.invalidateQueries()
      if (watching) return
      watching = true
      try {
        const deadline = Date.now() + SYNC_WATCH_LIMIT_MS
        let sawSync = false
        while (!disposed && Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, SYNC_POLL_MS))
          const accounts = await api.getAccounts().catch(() => null) as { syncing?: boolean }[] | null
          if (!accounts) continue
          queryClient.setQueryData(['accounts'], accounts)
          if (accounts.some((account) => account.syncing)) { sawSync = true; continue }
          break
        }
        if (disposed) return
        await queryClient.invalidateQueries()
        if (sawSync) toast.success(tr('Publicações e métricas da conta sincronizadas.'))
      } finally {
        watching = false
      }
    }
    const onConnected = () => { void followConnection() }
    const unsubscribe = subscribeAccountsConnected(onConnected)
    window.addEventListener(SAME_TAB_EVENT, onConnected)
    return () => {
      disposed = true
      unsubscribe()
      window.removeEventListener(SAME_TAB_EVENT, onConnected)
    }
  }, [queryClient])

  return (
    <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-center"
        containerStyle={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
        toastOptions={{
          className: '!bg-white !text-slate-900 !border !border-slate-200 !shadow-lg text-sm font-medium rounded-xl',
          duration: 4000,
        }}
      />
    </QueryClientProvider>
    </LanguageProvider>
  )
}
