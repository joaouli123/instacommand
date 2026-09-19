import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { InstagramAccount } from '@/types'

export function useAccounts() {
  const queryClient = useQueryClient()

  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
    initialData: [] // use mock data initially or real if api is implemented
  })

  // Mock mutation for demonstration
  const syncAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      // return api.syncAccount(id)
      return { success: true }
    },
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
