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

/**
 * Report for one connected X profile and period. Posts created in the window
 * (own posts, no replies/reposts) with their counters. Only owned reads are used.
 */
export async function getXReport(userId: string, accountId: string, days: number, endAt = Date.now(), includeProfile = true) {
  const account = await prisma.xAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) return null;
  const token = await getXAccessToken(account.id);
  const until = new Date(Math.min(endAt, Date.now() - 15_000)); // X rejects end_time too close to now
  const since = new Date(endAt - days * 86400000);
  const issues: string[] = [];

  let profile: { followers: number | null; following: number | null; totalPosts: number | null; name: string | null; profilePicUrl: string | null } | null = null;
  if (includeProfile) {
    try {
      const me = await xRequest<{ data: { name?: string; profile_image_url?: string; public_metrics?: { followers_count?: number; following_count?: number; tweet_count?: number } } }>('/2/users/me?user.fields=public_metrics,profile_image_url,name', token);
      profile = { followers: number(me.data.public_metrics?.followers_count), following: number(me.data.public_metrics?.following_count), totalPosts: number(me.data.public_metrics?.tweet_count), name: me.data.name || null, profilePicUrl: me.data.profile_image_url || null };
      await prisma.xAccount.update({ where: { id: account.id }, data: { followersCount: profile.followers, name: profile.name, profilePicUrl: profile.profilePicUrl, lastSyncAt: new Date() } });
    } catch (error) { issues.push(error instanceof Error ? error.message : 'Não foi possível ler o perfil.'); }
  }

  const posts: XReportPost[] = [];
  let complete = true;
  const fetchPage = async (withPrivate: boolean, token_: string | undefined) => {
    const params = new URLSearchParams({
      start_time: since.toISOString(), end_time: until.toISOString(), max_results: '100', exclude: 'retweets,replies',
      'tweet.fields': withPrivate ? `${TWEET_FIELDS},non_public_metrics` : TWEET_FIELDS,
      expansions: 'attachments.media_keys', 'media.fields': 'url,preview_image_url',
    });
    if (token_) params.set('pagination_token', token_);
    return xRequest<{ data?: RawTweet[]; includes?: { media?: RawMedia[] }; meta?: { next_token?: string } }>(`/2/users/${encodeURIComponent(account.xUserId)}/tweets?${params}`, token);
  };
  try {
    // Private counters (true impressions, link and profile clicks) only exist for the last 30 days.
    let withPrivate = Date.now() - since.getTime() <= 30 * 86400000;
    let next: string | undefined;
    for (let page = 0; page < 3; page++) {
      let result;
      try { result = await fetchPage(withPrivate, next); }
      catch (error) { if (!withPrivate) throw error; withPrivate = false; result = await fetchPage(false, next); }
      const media = new Map((result.includes?.media || []).map((item) => [item.media_key, item]));
      for (const tweet of result.data || []) posts.push(mapXPost(tweet, media, account.username));
      next = result.meta?.next_token;
      if (!next) break;
      if (page === 2) complete = false;
    }
  } catch (error) {
    complete = false;
    issues.push(error instanceof Error ? error.message : 'Não foi possível ler as publicações.');
  }

  const summary = summarizeXPosts(posts);
  return {
    network: 'X', account: { id: account.id, username: account.username, name: profile?.name ?? account.name, profilePicUrl: profile?.profilePicUrl ?? account.profilePicUrl },
    period: { days, since: since.toISOString(), until: until.toISOString() }, collectedAt: new Date().toISOString(),
    followers: profile?.followers ?? account.followersCount ?? null, following: profile?.following ?? null, totalPosts: profile?.totalPosts ?? null,
    posts: posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), complete, issues, ...summary,
  };
}
