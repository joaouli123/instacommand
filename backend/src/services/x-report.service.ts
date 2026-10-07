import { PrismaClient } from '@prisma/client';
import { getXAccessToken, xRequest } from './x.service';

const prisma = new PrismaClient();

export type XPostMetrics = { impressions: number | null; likes: number; replies: number; reposts: number; quotes: number; bookmarks: number; urlClicks: number | null; profileClicks: number | null };
export type XReportPost = { id: string; text: string; createdAt: string; url: string; image: string | null; metrics: XPostMetrics; engagement: number };
type RawTweet = {
  id: string; text?: string; created_at?: string; attachments?: { media_keys?: string[] };
  public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; repost_count?: number; quote_count?: number; bookmark_count?: number; impression_count?: number };
  non_public_metrics?: { impression_count?: number; url_link_clicks?: number; user_profile_clicks?: number };
};
type RawMedia = { media_key: string; url?: string; preview_image_url?: string };

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const engagementOf = (m: XPostMetrics) => m.likes + m.replies + m.reposts + m.quotes + m.bookmarks;

/** Maps an X post to the report shape; impressions prefer the private count (own posts, last 30 days). */
export function mapXPost(tweet: RawTweet, media: Map<string, RawMedia>, username: string): XReportPost {
  const pub = tweet.public_metrics || {}, priv = tweet.non_public_metrics || {};
  const metrics: XPostMetrics = {
    impressions: number(priv.impression_count) ?? number(pub.impression_count),
    likes: number(pub.like_count) ?? 0, replies: number(pub.reply_count) ?? 0,
    reposts: number(pub.retweet_count) ?? number(pub.repost_count) ?? 0, quotes: number(pub.quote_count) ?? 0,
    bookmarks: number(pub.bookmark_count) ?? 0, urlClicks: number(priv.url_link_clicks), profileClicks: number(priv.user_profile_clicks),
  };
  const first = tweet.attachments?.media_keys?.map((key) => media.get(key)).find(Boolean)
  return { id: tweet.id, text: tweet.text || '', createdAt: tweet.created_at || '', url: `https://x.com/${username}/status/${tweet.id}`,
    image: first?.url || first?.preview_image_url || null, metrics, engagement: engagementOf(metrics) };
}

/** Period totals: impressions only sum posts that reported them; null when none did. */
export function summarizeXPosts(posts: XReportPost[]) {
  const sum = (pick: (m: XPostMetrics) => number | null) => {
    const values = posts.map((post) => pick(post.metrics)).filter((value): value is number => value != null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const totals = {
    posts: posts.length, impressions: sum((m) => m.impressions), likes: sum((m) => m.likes) ?? 0, replies: sum((m) => m.replies) ?? 0,
    reposts: sum((m) => m.reposts) ?? 0, quotes: sum((m) => m.quotes) ?? 0, bookmarks: sum((m) => m.bookmarks) ?? 0,
    urlClicks: sum((m) => m.urlClicks), profileClicks: sum((m) => m.profileClicks),
  };
  const engagement = totals.likes + totals.replies + totals.reposts + totals.quotes + totals.bookmarks;
  const daily = new Map<string, { date: string; impressions: number; engagement: number; posts: number }>();
  for (const post of posts) {
    const date = post.createdAt.slice(0, 10);
    if (!date) continue;
    const day = daily.get(date) || { date, impressions: 0, engagement: 0, posts: 0 };
    day.impressions += post.metrics.impressions ?? 0; day.engagement += post.engagement; day.posts += 1;
    daily.set(date, day);
  }
  return {
    totals: { ...totals, engagement },
    engagementRate: totals.impressions ? engagement / totals.impressions * 100 : null,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const TWEET_FIELDS = 'created_at,public_metrics,attachments';
/** Stored numbers are reused for this long before asking X again (saves API credits). */
export const X_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Manual "Atualizar" can force a refresh, but not more often than this. */
export const X_MIN_FORCED_INTERVAL_MS = 15 * 60 * 1000;
/** Counters can still change for recent posts; older ones are kept as stored. */
const RECENT_WINDOW_DAYS = 30;
/** First sync goes further back so 90-day reports start with data. */
const FIRST_SYNC_DAYS = 90;

export function shouldSyncX(lastSync: Date | null | undefined, force: boolean, now = Date.now()) {
  if (!lastSync) return true;
  const age = now - lastSync.getTime();
  return force ? age >= X_MIN_FORCED_INTERVAL_MS : age >= X_SYNC_INTERVAL_MS;
}

const syncing = new Map<string, Promise<void>>();

/**
 * Refreshes the stored profile numbers and recent post counters from X.
 * Only owned reads (the cheapest kind) are used, at most once per interval.
 */
export async function syncXMetrics(accountId: string, force = false): Promise<{ synced: boolean; issues: string[] }> {
  const account = await prisma.xAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) return { synced: false, issues: [] };
  if (!shouldSyncX(account.metricsSyncedAt, force)) return { synced: false, issues: [] };
  const running = syncing.get(accountId);
  if (running) { await running; return { synced: true, issues: [] }; }
  const issues: string[] = [];
  const job = (async () => {
    const token = await getXAccessToken(account.id);
    try {
      const me = await xRequest<{ data: { name?: string; profile_image_url?: string; public_metrics?: { followers_count?: number; following_count?: number; tweet_count?: number } } }>('/2/users/me?user.fields=public_metrics,profile_image_url,name', token);
      await prisma.xAccount.update({ where: { id: account.id }, data: {
        followersCount: number(me.data.public_metrics?.followers_count), followingCount: number(me.data.public_metrics?.following_count),
        totalPosts: number(me.data.public_metrics?.tweet_count), name: me.data.name || account.name, profilePicUrl: me.data.profile_image_url || account.profilePicUrl, lastSyncAt: new Date(),
      } });
    } catch (error) { issues.push(error instanceof Error ? error.message : 'Não foi possível ler o perfil.'); }

    const days = account.metricsSyncedAt ? RECENT_WINDOW_DAYS : FIRST_SYNC_DAYS;
    const since = new Date(Date.now() - days * 86400000);
    const until = new Date(Date.now() - 15_000); // X rejects an end_time too close to now
    const fetchPage = (withPrivate: boolean, next?: string) => {
      const params = new URLSearchParams({
        start_time: since.toISOString(), end_time: until.toISOString(), max_results: '100', exclude: 'retweets,replies',
        'tweet.fields': withPrivate ? `${TWEET_FIELDS},non_public_metrics` : TWEET_FIELDS,
        expansions: 'attachments.media_keys', 'media.fields': 'url,preview_image_url',
      });
      if (next) params.set('pagination_token', next);
      return xRequest<{ data?: RawTweet[]; includes?: { media?: RawMedia[] }; meta?: { next_token?: string } }>(`/2/users/${encodeURIComponent(account.xUserId)}/tweets?${params}`, token);
    };
    try {
      // Private counters (true views, link and profile clicks) only exist for the last 30 days.
      let withPrivate = true;
      let next: string | undefined;
      for (let page = 0; page < 3; page++) {
        let result;
        try { result = await fetchPage(withPrivate, next); }
        catch (error) {
          // Only a refusal of the private fields justifies retrying without them; limits and outages do not.
          const status = (error as { xStatus?: number }).xStatus;
          if (!withPrivate || (status !== 400 && status !== 403)) throw error;
          withPrivate = false; result = await fetchPage(false, next);
        }
        const media = new Map((result.includes?.media || []).map((item) => [item.media_key, item]));
        for (const tweet of result.data || []) {
          const post = mapXPost(tweet, media, account.username);
          if (!post.createdAt) continue;
          const data = { accountId: account.id, text: post.text, postedAt: new Date(post.createdAt), url: post.url, image: post.image, ...post.metrics, fetchedAt: new Date() };
          // Private counters missing in this read keep the values already stored.
          const update = Object.fromEntries(Object.entries(data).filter(([key, value]) => !(value === null && ['impressions', 'urlClicks', 'profileClicks'].includes(key))));
          await prisma.xPostMetric.upsert({ where: { id: post.id }, update, create: { id: post.id, ...data } });
        }
        next = result.meta?.next_token;
        if (!next) break;
      }
      if (next) issues.push('Muitos posts no período: guardamos os 300 mais recentes desta atualização.');
    } catch (error) { issues.push(error instanceof Error ? error.message : 'Não foi possível ler as publicações.'); }
    // Remember when we asked and what went wrong, so later reports keep showing it.
    await prisma.xAccount.update({ where: { id: account.id }, data: { metricsSyncedAt: new Date(), metricsSyncError: issues.length ? issues.join(' ').slice(0, 500) : null } });
  })().finally(() => syncing.delete(accountId));
  syncing.set(accountId, job);
  await job;
  return { synced: true, issues };
}

type StoredPost = { id: string; text: string; postedAt: Date; url: string; image: string | null; impressions: number | null; likes: number; replies: number; reposts: number; quotes: number; bookmarks: number; urlClicks: number | null; profileClicks: number | null };
const fromStored = (row: StoredPost): XReportPost => {
  const metrics: XPostMetrics = { impressions: row.impressions, likes: row.likes, replies: row.replies, reposts: row.reposts, quotes: row.quotes, bookmarks: row.bookmarks, urlClicks: row.urlClicks, profileClicks: row.profileClicks };
  return { id: row.id, text: row.text, createdAt: row.postedAt.toISOString(), url: row.url, image: row.image, metrics, engagement: engagementOf(metrics) };
};

/**
 * Report for one connected X profile, read from the stored numbers. X is
 * asked again only when they are older than the sync interval (or on a
 * forced refresh), so opening a report usually costs no API credits.
 */
export async function getXReport(userId: string, accountId: string, days: number, options: { endAt?: number; refresh?: boolean; skipSync?: boolean } = {}) {
  const owned = await prisma.xAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!owned) return null;
  const sync = options.skipSync ? { synced: false, issues: [] as string[] } : await syncXMetrics(owned.id, Boolean(options.refresh));
  const account = (await prisma.xAccount.findUnique({ where: { id: owned.id } }))!;
  const endAt = options.endAt ?? Date.now();
  const since = new Date(endAt - days * 86400000), until = new Date(endAt);
  const rows = await prisma.xPostMetric.findMany({ where: { accountId: account.id, postedAt: { gte: since, lt: until } }, orderBy: { postedAt: 'desc' } });
  const posts = rows.map(fromStored);
  const summary = summarizeXPosts(posts);
  return {
    network: 'X', account: { id: account.id, username: account.username, name: account.name, profilePicUrl: account.profilePicUrl },
    period: { days, since: since.toISOString(), until: until.toISOString() }, collectedAt: (account.metricsSyncedAt || new Date()).toISOString(),
    syncedAt: account.metricsSyncedAt?.toISOString() ?? null, nextSyncAt: account.metricsSyncedAt ? new Date(account.metricsSyncedAt.getTime() + X_SYNC_INTERVAL_MS).toISOString() : null,
    followers: account.followersCount ?? null, following: account.followingCount ?? null, totalPosts: account.totalPosts ?? null,
    posts, complete: !account.metricsSyncError, issues: sync.issues.length ? sync.issues : account.metricsSyncError ? [account.metricsSyncError] : [], ...summary,
  };
}
