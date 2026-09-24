'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }))

  useEffect(() => {
    const refreshConnectedAccounts = () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['threads-accounts'] })
    }
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('instacommand-oauth') : null
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'accounts-connected') refreshConnectedAccounts()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'instacommand-oauth-completed') refreshConnectedAccounts()
    }
    channel?.addEventListener('message', onMessage)
    window.addEventListener('storage', onStorage)
    return () => {
      channel?.removeEventListener('message', onMessage)
      channel?.close()
      window.removeEventListener('storage', onStorage)
    }
  }, [queryClient])

  return (
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
  )
}
