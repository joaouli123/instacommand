import { getPrisma } from '../lib/prisma';
import { getYouTubeAccessToken, YOUTUBE_API, YOUTUBE_ANALYTICS_SCOPE, youtubeRequest } from './youtube.service';

const prisma = getPrisma();
export const YOUTUBE_ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';
/** Uploads read per report; enough for 90 days of a very active channel without burning quota. */
const MAX_UPLOADS = 200;

export type YouTubeVideoRow = { id: string; title: string; publishedAt: string; url: string; thumbnail: string | null; views: number | null; likes: number | null; comments: number | null; durationSeconds: number | null };
export type YouTubeAnalyticsTotals = { views: number; watchMinutes: number; averageViewSeconds: number; subscribersGained: number; subscribersLost: number; likes: number; comments: number; shares: number };
export type YouTubeDailyRow = { date: string; views: number; watchMinutes: number; subscribersGained: number; subscribersLost: number };

const count = (value: unknown) => {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function parseIsoDuration(value?: string | null) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value || '');
  if (!match) return null;
  const [, d, h, m, s] = match.map((part) => Number(part || 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

/** Turns a YouTube Analytics response (columnHeaders + rows) into objects keyed by column name. */
export function analyticsRows(response: { columnHeaders?: Array<{ name: string }>; rows?: unknown[][] } | null | undefined) {
  const names = (response?.columnHeaders || []).map((header) => header.name);
  return (response?.rows || []).map((row) => Object.fromEntries(names.map((name, index) => [name, row[index]])) as Record<string, string | number>);
}

const toTotals = (row: Record<string, string | number> | undefined): YouTubeAnalyticsTotals => ({
  views: Number(row?.views ?? 0), watchMinutes: Number(row?.estimatedMinutesWatched ?? 0), averageViewSeconds: Number(row?.averageViewDuration ?? 0),
  subscribersGained: Number(row?.subscribersGained ?? 0), subscribersLost: Number(row?.subscribersLost ?? 0),
  likes: Number(row?.likes ?? 0), comments: Number(row?.comments ?? 0), shares: Number(row?.shares ?? 0),
});

const TRAFFIC_LABELS: Record<string, string> = {
  YT_SEARCH: 'Busca do YouTube', SUGGESTED: 'Vídeos sugeridos', BROWSE: 'Página inicial e inscrições', SHORTS: 'Feed de Shorts',
  EXT_URL: 'Sites e apps externos', NO_LINK_OTHER: 'Acesso direto', PLAYLIST: 'Playlists', YT_CHANNEL: 'Página do canal',
  NOTIFICATION: 'Notificações', SUBSCRIBER: 'Feed de inscrições', YT_OTHER_PAGE: 'Outras páginas do YouTube', END_SCREEN: 'Telas finais',
  ANNOTATION: 'Cards e anotações', HASHTAGS: 'Hashtags', SOUND_PAGE: 'Página de áudio', RELATED_VIDEO: 'Vídeos relacionados',
};
const AGE_LABELS: Record<string, string> = { age13_17: '13–17', age18_24: '18–24', age25_34: '25–34', age35_44: '35–44', age45_54: '45–54', age55_64: '55–64', age65_: '65+' };
const day = (time: number) => new Date(time).toISOString().slice(0, 10);

async function readAnalytics(token: string, startDate: string, endDate: string) {
  const query = (params: Record<string, string>) => youtubeRequest(`${YOUTUBE_ANALYTICS_API}?${new URLSearchParams({ ids: 'channel==MINE', startDate, endDate, ...params })}`, token);
  const metrics = 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares';
  // Totals and the daily series are required; traffic and audience are extras that small channels often lack.
  const [totals, daily] = await Promise.all([query({ metrics }), query({ metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost', dimensions: 'day', sort: 'day' })]);
  const [traffic, demographics] = await Promise.all([
    query({ metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' }).catch(() => null),
    query({ metrics: 'viewerPercentage', dimensions: 'ageGroup,gender' }).catch(() => null),
  ]);
  return {
    totals: toTotals(analyticsRows(totals)[0]),
    daily: analyticsRows(daily).map((row): YouTubeDailyRow => ({ date: String(row.day), views: Number(row.views ?? 0), watchMinutes: Number(row.estimatedMinutesWatched ?? 0), subscribersGained: Number(row.subscribersGained ?? 0), subscribersLost: Number(row.subscribersLost ?? 0) })),
    trafficSources: analyticsRows(traffic).map((row) => ({ source: TRAFFIC_LABELS[String(row.insightTrafficSourceType)] || String(row.insightTrafficSourceType), views: Number(row.views ?? 0) })),
    demographics: analyticsRows(demographics).map((row) => ({ age: AGE_LABELS[String(row.ageGroup)] || String(row.ageGroup), gender: row.gender === 'female' ? 'Mulheres' : row.gender === 'male' ? 'Homens' : 'Outros', percent: Number(row.viewerPercentage ?? 0) })),
  };
}

/** Videos uploaded in the window, newest first, with their current counters. */
async function readVideos(token: string, uploadsPlaylist: string, since: number, until: number) {
  const ids: string[] = [];
  let pageToken = '';
  let truncated = false;
  for (let read = 0; read < MAX_UPLOADS;) {
    const page = await youtubeRequest<{ items?: Array<{ contentDetails?: { videoId?: string; videoPublishedAt?: string } }>; nextPageToken?: string }>(
      `${YOUTUBE_API}/playlistItems?${new URLSearchParams({ part: 'contentDetails', playlistId: uploadsPlaylist, maxResults: '50', ...(pageToken ? { pageToken } : {}) })}`, token);
    const items = page.items || [];
    read += items.length;
    let older = false;
    for (const item of items) {
      const published = Date.parse(item.contentDetails?.videoPublishedAt || '');
      if (!item.contentDetails?.videoId || !Number.isFinite(published)) continue;
      if (published < since) { older = true; continue; }
      if (published < until) ids.push(item.contentDetails.videoId);
    }
    if (older || !page.nextPageToken || !items.length) break;
    pageToken = page.nextPageToken;
    if (read >= MAX_UPLOADS) truncated = true;
  }
  const videos: YouTubeVideoRow[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = await youtubeRequest<{ items?: Array<{ id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: Record<string, string>; contentDetails?: { duration?: string } }> }>(
      `${YOUTUBE_API}/videos?${new URLSearchParams({ part: 'snippet,statistics,contentDetails', id: ids.slice(index, index + 50).join(',') })}`, token);
    for (const video of batch.items || []) {
      const thumbs = video.snippet?.thumbnails || {};
      videos.push({
        id: video.id, title: video.snippet?.title || 'Vídeo sem título', publishedAt: video.snippet?.publishedAt || '',
        url: `https://www.youtube.com/watch?v=${video.id}`, thumbnail: thumbs.medium?.url || thumbs.high?.url || thumbs.default?.url || null,
        views: count(video.statistics?.viewCount), likes: count(video.statistics?.likeCount), comments: count(video.statistics?.commentCount),
        durationSeconds: parseIsoDuration(video.contentDetails?.duration),
      });
    }
  }
  videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { videos, truncated };
}

/** Sums of the videos' counters; a counter hidden on every video stays null. */
export function summarizeVideos(videos: YouTubeVideoRow[]) {
  const sum = (key: 'views' | 'likes' | 'comments') => {
    const values = videos.map((video) => video[key]).filter((value): value is number => value != null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return { videos: videos.length, views: sum('views'), likes: sum('likes'), comments: sum('comments') };
}

/**
 * Report for one YouTube channel of the user. Channel totals and the period's videos come from
 * the Data API; daily views, watch time, subscribers, traffic and audience come from YouTube
 * Analytics, which needs its own permission (channels connected before it must reconnect).
 */
export async function getYouTubeReport(userId: string, accountId: string, days: number, endAt = Date.now()) {
  const account = await prisma.youTubeAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) return null;
  const token = await getYouTubeAccessToken(account.id);
  const since = endAt - days * 86400000;
  const channelResponse = await youtubeRequest<{ items?: Array<{ snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: Record<string, string | boolean>; contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
    `${YOUTUBE_API}/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(account.channelId)}`, token);
  const channel = channelResponse.items?.[0];
  const issues: string[] = [];
  const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
  const { videos, truncated } = uploads ? await readVideos(token, uploads, since, endAt) : { videos: [], truncated: false };
  if (truncated) issues.push(`Foram lidos os ${MAX_UPLOADS} envios mais recentes; vídeos mais antigos do período não entraram.`);

  const analyticsGranted = (account.scopes || '').split(' ').includes(YOUTUBE_ANALYTICS_SCOPE);
  let analytics: (Awaited<ReturnType<typeof readAnalytics>> & { available: true }) | { available: false; reason: 'scope' | 'error'; message: string } = analyticsGranted
    ? { available: false, reason: 'error', message: '' }
    : { available: false, reason: 'scope', message: 'Reconecte o canal em Contas e aceite a permissão de métricas do YouTube para ver visualizações por dia, tempo assistido, inscritos e público.' };
  let previous: YouTubeAnalyticsTotals | null = null;
  if (analyticsGranted) {
    try {
      // YouTube Analytics days are whole calendar days and lag about two days behind.
      analytics = { available: true, ...await readAnalytics(token, day(since), day(endAt)) };
      previous = toTotals(analyticsRows(await youtubeRequest(`${YOUTUBE_ANALYTICS_API}?${new URLSearchParams({ ids: 'channel==MINE', startDate: day(since - days * 86400000), endDate: day(since - 86400000), metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares' })}`, token).catch(() => null))[0]);
    } catch (error) {
      analytics = { available: false, reason: 'error', message: error instanceof Error ? error.message : 'Não foi possível ler as métricas do YouTube Analytics.' };
    }
  }
  const stats = channel?.statistics || {};
  const thumbs = channel?.snippet?.thumbnails || {};
  return {
    network: 'YOUTUBE',
    account: { id: account.id, channelId: account.channelId, title: channel?.snippet?.title || account.title, handle: channel?.snippet?.customUrl || account.handle, thumbnailUrl: thumbs.medium?.url || thumbs.default?.url || account.thumbnailUrl },
    period: { days, since: new Date(since).toISOString(), until: new Date(endAt).toISOString() },
    collectedAt: new Date().toISOString(),
    channel: { subscribers: stats.hiddenSubscriberCount ? null : count(stats.subscriberCount), views: count(stats.viewCount), videos: count(stats.videoCount) },
    posts: videos, totals: summarizeVideos(videos), analytics, previous, complete: !truncated, issues,
    measurement: 'Os contadores de cada vídeo são os totais atuais. Visualizações por dia, tempo assistido e inscritos vêm do YouTube Analytics, que atualiza com cerca de dois dias de atraso.',
  };
}
