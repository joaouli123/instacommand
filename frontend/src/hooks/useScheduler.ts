import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useScheduler(accountId: string) {
  const queryClient = useQueryClient()

  const { data: scheduledPosts, isLoading } = useQuery({
    queryKey: ['scheduledPosts', accountId],
    queryFn: async () => {
      const posts = await api.getPosts(accountId ? `accountId=${encodeURIComponent(accountId)}` : '')
      return posts
    },
    enabled: !!accountId
  })

  const schedulePostMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.createPost({ ...data, accountId, status: 'SCHEDULED' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledPosts', accountId] })
    }
  })

  return {
    scheduledPosts,
    isLoading,
    schedulePost: schedulePostMutation.mutate,
    isScheduling: schedulePostMutation.isPending
  }
}
