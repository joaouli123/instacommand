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

export type FacebookAudienceHistory = Partial<Record<'viewers' | 'followers' | 'gained' | 'lost', Array<{ date: string; value: number }>>>

export function facebookHistoryRows(history: FacebookAudienceHistory | undefined) {
  const rows = new Map<string, { date: string; viewers: number | null; followers: number | null; gained: number | null; lost: number | null }>()
  for (const key of ['viewers', 'followers', 'gained', 'lost'] as const) for (const point of history?.[key] || []) {
    const row = rows.get(point.date) || { date: point.date, viewers: null, followers: null, gained: null, lost: null }
    row[key] = point.value
    rows.set(point.date, row)
  }
  return Array.from(rows.values()).sort((a, b) => a.date.localeCompare(b.date))
}
