'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getSelectedAccountId, getServerAccountId, selectAccount, subscribeToAccount } from '@/lib/active-account-store'

export type ActiveAccount = {
  id: string
  igUsername: string
  igName?: string | null
  igProfilePicUrl?: string | null
  igFollowersCount: number
  isActive: boolean
  lastSyncAt?: string | null
  pageName?: string | null
}

export function useActiveAccount() {
  const pathname = usePathname()
  const selectedId = useSyncExternalStore(subscribeToAccount, getSelectedAccountId, getServerAccountId)
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
    enabled: pathname !== '/login',
    staleTime: 60 * 1000,
  })
  const accounts = useMemo(
    () => ((accountsQuery.data || []) as ActiveAccount[]).filter((account) => account.isActive),
    [accountsQuery.data],
  )

  useEffect(() => {
    if (!accounts.length) return
    // Read the shared value at effect time, not a stale mount-time state.
    // Mounting a page must never reset the Header's valid selection.
    if (!accounts.some((account) => account.id === getSelectedAccountId())) {
      selectAccount(accounts[0].id)
    }
  }, [accounts, selectedId])

  const activeAccount = accounts.find((account) => account.id === selectedId) || accounts[0] || null
  const setActiveAccount = (accountId: string) => {
    if (accounts.some((account) => account.id === accountId)) selectAccount(accountId)
  }

  return {
    accounts,
    activeAccount,
    accountId: activeAccount?.id || '',
    setActiveAccount,
    isLoading: accountsQuery.isLoading,
    error: accountsQuery.error,
    refetch: accountsQuery.refetch,
  }
}
