import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useAnalytics(accountId: string, days: number = 30) {
  const { data: growthData, isLoading: isLoadingGrowth } = useQuery({
    queryKey: ['analytics', 'growth', accountId, days],
    queryFn: () => api.getGrowth(accountId, days),
    enabled: !!accountId
  })

  // Add more analytics queries as needed

  return {
    growthData,
    isLoadingGrowth
  }
}
