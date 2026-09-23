export type FacebookPostMetrics = {
  id: string
  text: string
  createdAt: string
  permalink: string | null
  reactions: number | null
  comments: number | null
  shares: number | null
}

export function getObservedInteractions(post: FacebookPostMetrics) {
  const values = [post.reactions, post.comments, post.shares]
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0)
  return {
    value: available.length ? available.reduce((sum, value) => sum + value, 0) : null,
    availableMetrics: available.length,
    complete: available.length === values.length,
  }
}

export function rankFacebookPosts(posts: FacebookPostMetrics[]) {
  return posts
    .map(post => ({ post, interactions: getObservedInteractions(post) }))
    .filter(item => item.interactions.value !== null)
    .sort((a, b) => (b.interactions.value! - a.interactions.value!) || (Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt)))
}
