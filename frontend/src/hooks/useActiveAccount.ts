'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

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

const STORAGE_KEY = 'instacommand_active_account'
const ACCOUNT_CHANGED_EVENT = 'instacommand-account-changed'

export function useActiveAccount() {
  const pathname = usePathname()
  const [selectedId, setSelectedId] = useState('')
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
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) setSelectedId(stored)
    const handleChange = () => setSelectedId(window.localStorage.getItem(STORAGE_KEY) || '')
    window.addEventListener(ACCOUNT_CHANGED_EVENT, handleChange)
    window.addEventListener('storage', handleChange)
    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, handleChange)
      window.removeEventListener('storage', handleChange)
    }
  }, [])

  useEffect(() => {
    if (!accounts.length) return
    if (!accounts.some((account) => account.id === selectedId)) {
      const nextId = accounts[0].id
      setSelectedId(nextId)
      window.localStorage.setItem(STORAGE_KEY, nextId)
    }
  }, [accounts, selectedId])

  const activeAccount = accounts.find((account) => account.id === selectedId) || accounts[0] || null
  const setActiveAccount = (accountId: string) => {
    setSelectedId(accountId)
    window.localStorage.setItem(STORAGE_KEY, accountId)
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
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
