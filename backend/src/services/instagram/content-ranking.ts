/**
 * Pure helpers to rank public Instagram posts (competitor media from
 * business_discovery and hashtag top/recent media). No I/O here so they are
 * unit-testable. Counters Meta omits stay null: we never turn "unknown" into 0.
 */

export type RankSort = 'engagement' | 'likes' | 'comments' | 'views' | 'recent';
export type RankFormat = 'ALL' | 'REELS' | 'CAROUSEL' | 'IMAGE';

export type RankedPost = {
  id: string;
  permalink: string | null;
  caption: string | null;
  mediaType: string | null;
  format: Exclude<RankFormat, 'ALL'>;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  timestamp: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  interactions: number | null;
  /** (likes + comments) / followers * 100, only when the author follower count is known. */
  engagementRate: number | null;
  /** Interactions per hour since publication: a "how fast is it growing" proxy. */
  velocity: number | null;
  source: { type: 'competitor' | 'hashtag_top' | 'hashtag_recent'; label: string; followers?: number | null };
};

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export const postFormat = (post: any): Exclude<RankFormat, 'ALL'> => {
  const product = String(post?.media_product_type || '').toUpperCase();
  const type = String(post?.media_type || '').toUpperCase();
  if (product === 'REELS' || type === 'VIDEO' || type === 'REELS') return 'REELS';
  if (type === 'CAROUSEL_ALBUM' || type === 'CAROUSEL') return 'CAROUSEL';
  return 'IMAGE';
};

export const normalizePost = (
  post: any,
  source: RankedPost['source'],
  now: Date = new Date(),
): RankedPost | null => {
  if (!post || typeof post.id !== 'string') return null;
  const likes = count(post.like_count);
  const comments = count(post.comments_count);
  const views = count(post.view_count ?? post.views ?? post.video_view_count);
  const interactions = likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0);
  const followers = count(source.followers);
  const engagementRate = interactions !== null && likes !== null && comments !== null && followers && followers > 0
    ? (interactions / followers) * 100
    : null;
  const published = typeof post.timestamp === 'string' ? new Date(post.timestamp) : null;
  const hours = published && !Number.isNaN(published.getTime())
    ? Math.max(1, (now.getTime() - published.getTime()) / 3_600_000)
    : null;
  const firstChild = Array.isArray(post.children?.data) ? post.children.data[0] : null;
  return {
    id: post.id,
    permalink: typeof post.permalink === 'string' ? post.permalink : null,
    caption: typeof post.caption === 'string' ? post.caption : null,
    mediaType: typeof post.media_type === 'string' ? post.media_type : null,
    format: postFormat(post),
    mediaUrl: typeof post.media_url === 'string' ? post.media_url : (typeof firstChild?.media_url === 'string' ? firstChild.media_url : null),
    thumbnailUrl: typeof post.thumbnail_url === 'string' ? post.thumbnail_url : (typeof firstChild?.thumbnail_url === 'string' ? firstChild.thumbnail_url : null),
    timestamp: published && hours !== null ? published.toISOString() : null,
    likes,
    comments,
    views,
    interactions,
    engagementRate,
    velocity: interactions !== null && hours !== null ? interactions / hours : null,
    source,
  };
};

const sortValue = (post: RankedPost, sort: RankSort): number | null => {
  switch (sort) {
    case 'likes': return post.likes;
    case 'comments': return post.comments;
    case 'views': return post.views;
    case 'recent': return post.timestamp ? new Date(post.timestamp).getTime() : null;
    case 'engagement':
    default:
      // Engagement rate when the follower base is known; hashtag media has no
      // author follower count, so fall back to raw interactions there.
      return post.engagementRate ?? post.interactions;
  }
};

export type RankOptions = { sort?: RankSort; format?: RankFormat; periodDays?: number | null; limit?: number; now?: Date };

/** Filter by format/period, dedupe by id and sort descending. Posts with unknown values go last. */
export const rankPosts = (posts: RankedPost[], options: RankOptions = {}): RankedPost[] => {
  const { sort = 'engagement', format = 'ALL', periodDays = null, limit = 60, now = new Date() } = options;
  const cutoff = periodDays && periodDays > 0 ? now.getTime() - periodDays * 86_400_000 : null;
  const seen = new Set<string>();
  const filtered = posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    if (format !== 'ALL' && post.format !== format) return false;
    if (cutoff !== null && (!post.timestamp || new Date(post.timestamp).getTime() < cutoff)) return false;
    return true;
  });
  return filtered
    .map((post, index) => ({ post, index, value: sortValue(post, sort) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value || a.index - b.index;
    })
    .slice(0, Math.max(1, limit))
    .map((item) => item.post);
};

/** Posts per week across the span of the sample (null when it cannot be measured). */
export const postingFrequency = (posts: any[], now: Date = new Date()): number | null => {
  const times = posts
    .map((post) => (typeof post?.timestamp === 'string' ? new Date(post.timestamp).getTime() : NaN))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  if (!times.length) return null;
  // Span from the oldest sampled post to now so a profile that stopped posting reads as slow.
  const spanDays = Math.max(7, (now.getTime() - times[0]) / 86_400_000);
  return Math.round((times.length / spanDays) * 7 * 10) / 10;
};

export type FormatStat = { format: Exclude<RankFormat, 'ALL'>; posts: number; avgInteractions: number | null; share: number };

export const formatBreakdown = (posts: any[]): FormatStat[] => {
  const groups = new Map<FormatStat['format'], { posts: number; sum: number; observed: number }>();
  for (const post of posts) {
    const format = postFormat(post);
    const group = groups.get(format) || { posts: 0, sum: 0, observed: 0 };
    group.posts += 1;
    const likes = count(post?.like_count);
    const comments = count(post?.comments_count);
    if (likes !== null || comments !== null) {
      group.sum += (likes ?? 0) + (comments ?? 0);
      group.observed += 1;
    }
    groups.set(format, group);
  }
  const total = posts.length || 1;
  return [...groups.entries()]
    .map(([format, group]) => ({
      format,
      posts: group.posts,
      avgInteractions: group.observed ? Math.round(group.sum / group.observed) : null,
      share: Math.round((group.posts / total) * 100),
    }))
    .sort((a, b) => (b.avgInteractions ?? -1) - (a.avgInteractions ?? -1));
};

export const parseRankSort = (value: unknown): RankSort =>
  ['engagement', 'likes', 'comments', 'views', 'recent'].includes(String(value)) ? String(value) as RankSort : 'engagement';

export const parseRankFormat = (value: unknown): RankFormat =>
  ['ALL', 'REELS', 'CAROUSEL', 'IMAGE'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() as RankFormat : 'ALL';

export const parsePeriodDays = (value: unknown): number | null => {
  const days = Number(value);
  return Number.isInteger(days) && days > 0 && days <= 365 ? days : null;
};

/** Tiny in-memory TTL cache to save Graph API quota between page loads. */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  constructor(private ttlMs: number, private maxEntries = 500) {}
  get(key: string, now = Date.now()): { value: T; cachedAt: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) { this.store.delete(key); return null; }
    return { value: entry.value, cachedAt: entry.expiresAt - this.ttlMs };
  }
  set(key: string, value: T, now = Date.now()) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
  }
  delete(key: string) { this.store.delete(key); }
}
