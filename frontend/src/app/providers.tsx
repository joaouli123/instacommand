'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }))

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
