import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { InstagramAccount } from '@/types'

export function useAccounts() {
  const queryClient = useQueryClient()

  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
    initialData: []
  })

  const syncAccountMutation = useMutation({
    mutationFn: (id: string) => api.syncAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })

  return {
    accounts,
    isLoading,
    error,
    syncAccount: syncAccountMutation.mutate,
    isSyncing: syncAccountMutation.isPending
  }
}
