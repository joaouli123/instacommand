import { getPrisma } from '../lib/prisma';
import { getTikTokAccessToken, tiktokRequest, USER_FIELDS } from './tiktok.service';

// Report of one TikTok profile: current profile totals (followers, likes, videos) and the
// videos posted in the period with their current counters (views, likes, comments, shares).

const prisma = getPrisma();
const VIDEO_FIELDS = 'id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count';
const MAX_PAGES = 5;

export type TikTokVideoRow = { id: string; title: string; createdAt: string; url: string | null; cover: string | null; durationSeconds: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null };
type RawVideo = { id?: string; title?: string; video_description?: string; create_time?: number; cover_image_url?: string; share_url?: string; duration?: number; view_count?: number; like_count?: number; comment_count?: number; share_count?: number };

const n = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export const toVideoRow = (video: RawVideo): TikTokVideoRow => ({
  id: String(video.id), title: video.title || video.video_description || 'Vídeo sem legenda', createdAt: video.create_time ? new Date(video.create_time * 1000).toISOString() : '',
  url: video.share_url || null, cover: video.cover_image_url || null, durationSeconds: n(video.duration),
  views: n(video.view_count), likes: n(video.like_count), comments: n(video.comment_count), shares: n(video.share_count),
});

/** Sums of the videos' counters; a counter TikTok gave for no video stays null. */
export function summarizeTikTokVideos(videos: TikTokVideoRow[]) {
  const sum = (key: 'views' | 'likes' | 'comments' | 'shares') => {
    const values = videos.map((video) => video[key]).filter((value): value is number => value != null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const totals = { videos: videos.length, views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares') };
  const interactions = (totals.likes ?? 0) + (totals.comments ?? 0) + (totals.shares ?? 0);
  const daily = new Map<string, { date: string; views: number; interactions: number; videos: number }>();
  for (const video of videos) {
    const date = video.createdAt.slice(0, 10);
    if (!date) continue;
    const day = daily.get(date) || { date, views: 0, interactions: 0, videos: 0 };
    day.views += video.views ?? 0; day.interactions += (video.likes ?? 0) + (video.comments ?? 0) + (video.shares ?? 0); day.videos += 1;
    daily.set(date, day);
  }
  return { totals, engagementRate: totals.views ? interactions / totals.views * 100 : null, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

export async function getTikTokReport(userId: string, accountId: string, days: number, endAt = Date.now()) {
  const account = await prisma.tikTokAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) return null;
  const token = await getTikTokAccessToken(account.id);
  const since = endAt - days * 86400000;
  const me = await tiktokRequest<{ data?: { user?: { display_name?: string; username?: string; avatar_url?: string; follower_count?: number; following_count?: number; likes_count?: number; video_count?: number } } }>('/user/info/', token, { query: { fields: USER_FIELDS } });
  const user = me.data?.user || {};
  // Keep the stored profile fresh for the accounts list and the dashboard.
  await prisma.tikTokAccount.update({ where: { id: account.id }, data: {
    displayName: user.display_name || account.displayName, username: user.username || account.username, avatarUrl: user.avatar_url || account.avatarUrl,
    followerCount: user.follower_count ?? account.followerCount, followingCount: user.following_count ?? account.followingCount,
    likesCount: user.likes_count ?? account.likesCount, videoCount: user.video_count ?? account.videoCount, lastSyncAt: new Date(),
  } });
  const videos: TikTokVideoRow[] = [];
  let cursor: number | undefined;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await tiktokRequest<{ data?: { videos?: RawVideo[]; cursor?: number; has_more?: boolean } }>('/video/list/', token, { method: 'POST', query: { fields: VIDEO_FIELDS }, body: { max_count: 20, ...(cursor ? { cursor } : {}) } });
    const items = result.data?.videos || [];
    let older = false;
    for (const item of items) {
      const created = (item.create_time || 0) * 1000;
      if (created < since) { older = true; continue; }
      if (created < endAt) videos.push(toVideoRow(item));
    }
    if (older || !result.data?.has_more || !items.length) break;
    cursor = result.data.cursor;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  videos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    network: 'TIKTOK',
    account: { id: account.id, username: user.username || account.username, displayName: user.display_name || account.displayName, avatarUrl: user.avatar_url || account.avatarUrl },
    period: { days, since: new Date(since).toISOString(), until: new Date(endAt).toISOString() }, collectedAt: new Date().toISOString(),
    profile: { followers: n(user.follower_count), following: n(user.following_count), likes: n(user.likes_count), videos: n(user.video_count) },
    posts: videos, ...summarizeTikTokVideos(videos), complete: !truncated,
    issues: truncated ? ['Foram lidos os 100 vídeos mais recentes; vídeos mais antigos do período não entraram.'] : [],
    measurement: 'Os contadores de cada vídeo são os totais atuais informados pelo TikTok, somados por data de publicação.',
  };
}
