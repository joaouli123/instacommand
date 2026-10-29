'use client'

// The Threads, X and YouTube profiles of the company chosen at the top of the panel.
// Profiles of other companies, or not linked to any, never show up here: screens
// built on this hook cannot mix one client's data into another's.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useActiveAccount } from '@/hooks/useActiveAccount'

type Linked = { id: string; workspaceAccountId?: string | null }
export type CompanyThreadsProfile = Linked & { username: string; name?: string | null; profilePicUrl?: string | null }
export type CompanyXProfile = Linked & { username: string; name?: string | null; profilePicUrl?: string | null; followersCount?: number | null }
export type CompanyYouTubeChannel = Linked & { title: string; handle?: string | null; thumbnailUrl?: string | null; subscriberCount?: number | null }

/** Profiles that belong to the company; pure so the rule can be tested. */
export const ofCompany = <T extends Linked>(profiles: T[] | undefined, companyId: string) =>
  companyId ? (profiles || []).filter((profile) => profile.workspaceAccountId === companyId) : []

export function useCompanyProfiles() {
  const { activeAccount, accountId, isLoading: companyLoading } = useActiveAccount()
  const threadsQuery = useQuery({ queryKey: ['threads-accounts'], queryFn: () => api.getThreadsAccounts() as Promise<CompanyThreadsProfile[]>, staleTime: 60_000 })
  const xQuery = useQuery({ queryKey: ['x-accounts'], queryFn: () => api.getXAccounts() as Promise<{ configured?: boolean; accounts?: CompanyXProfile[] }>, staleTime: 60_000 })
  const youtubeQuery = useQuery({ queryKey: ['youtube-accounts'], queryFn: () => api.getYouTubeAccounts() as Promise<{ configured?: boolean; accounts?: CompanyYouTubeChannel[] }>, staleTime: 60_000 })

  return useMemo(() => ({
    company: activeAccount,
    companyId: accountId,
    threads: ofCompany(threadsQuery.data, accountId),
    x: ofCompany(xQuery.data?.accounts, accountId),
    youtube: ofCompany(youtubeQuery.data?.accounts, accountId),
    xConfigured: xQuery.data?.configured !== false,
    youtubeConfigured: youtubeQuery.data?.configured !== false,
    isLoading: companyLoading || threadsQuery.isLoading || xQuery.isLoading || youtubeQuery.isLoading,
  }), [activeAccount, accountId, threadsQuery.data, xQuery.data, youtubeQuery.data, companyLoading, threadsQuery.isLoading, xQuery.isLoading, youtubeQuery.isLoading])
}
