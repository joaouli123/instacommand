import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { AppError, ValidationError } from '../utils/errors';
import { cached } from '../utils/ttl-cache';
import { getYouTubeAccessToken, YOUTUBE_API, youtubeRequest } from './youtube.service';
import { parseIsoDuration } from './youtube-report.service';

// Competitors and trends on YouTube for one company. Public data is read with the company's
// own channel connection, so the quota is the company's and no other company is involved.

const prisma = getPrisma();
export const MAX_YOUTUBE_COMPETITORS = 20;
const RECENT_VIDEOS = 15;
const TRENDS_TTL_MS = 60 * 60_000;

export type PublicVideo = { id: string; title: string; channelTitle: string; channelId: string; publishedAt: string; url: string; thumbnail: string | null; views: number | null; likes: number | null; comments: number | null; durationSeconds: number | null };
type ApiVideo = { id: string; snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: Record<string, string>; contentDetails?: { duration?: string } };
type ApiChannel = { id: string; snippet?: { title?: string; customUrl?: string; description?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; viewCount?: string; videoCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } };

const count = (value: unknown) => {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const thumb = (thumbs: Record<string, { url?: string }> = {}) => thumbs.medium?.url || thumbs.high?.url || thumbs.default?.url || null;

export const toPublicVideo = (video: ApiVideo): PublicVideo => ({
  id: video.id, title: video.snippet?.title || 'Vídeo sem título', channelTitle: video.snippet?.channelTitle || '', channelId: video.snippet?.channelId || '',
  publishedAt: video.snippet?.publishedAt || '', url: `https://www.youtube.com/watch?v=${video.id}`, thumbnail: thumb(video.snippet?.thumbnails),
  views: count(video.statistics?.viewCount), likes: count(video.statistics?.likeCount), comments: count(video.statistics?.commentCount),
  durationSeconds: parseIsoDuration(video.contentDetails?.duration),
});

/**
 * What the user typed to find a channel: @handle, a channel URL, a UC… channel id or a name.
 * Returns the query parameter channels.list understands.
 */
export function parseChannelInput(raw: string): { forHandle: string } | { id: string } {
  const value = raw.trim();
  if (!value) throw new ValidationError('Informe o @ do canal, o link ou o ID do canal.');
  let path = value;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) path = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch { /* not a URL */ }
  const channel = /^channel\/(UC[\w-]{22})/.exec(path) || /^(UC[\w-]{22})$/.exec(path);
  if (channel) return { id: channel[1] };
  const handle = (/^@?([\w.-]{3,30})(?:\/.*)?$/.exec(path.replace(/^c\//, '').replace(/^user\//, '')) || [])[1];
  if (!handle) throw new ValidationError('Não reconheci o canal. Use o @ do canal (ex.: @canal), o link youtube.com/@canal ou o ID que começa com UC.');
  return { forHandle: `@${handle}` };
}

/** Averages of the latest videos: what a typical upload of the channel gets. */
export function channelMetrics(videos: PublicVideo[], now = Date.now()) {
  const withViews = videos.filter((video) => video.views != null);
  const average = (pick: (video: PublicVideo) => number | null) => {
    const values = videos.map(pick).filter((value): value is number => value != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const views = withViews.reduce((total, video) => total + (video.views ?? 0), 0);
  const interactions = withViews.reduce((total, video) => total + (video.likes ?? 0) + (video.comments ?? 0), 0);
  const dates = videos.map((video) => Date.parse(video.publishedAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const weeks = dates.length > 1 ? Math.max(1, (now - dates[0]) / (7 * 86400000)) : null;
  return {
    avgViews: average((video) => video.views), avgLikes: average((video) => video.likes), avgComments: average((video) => video.comments),
    engagementRate: views ? interactions / views * 100 : null,
    uploadsPerWeek: weeks ? dates.length / weeks : null,
  };
}

/** The connection of the company's own channel; research on YouTube runs on its quota. */
async function companyToken(userId: string, companyId: string) {
  const company = await prisma.instagramAccount.findFirst({ where: { id: companyId, userId, isActive: true }, select: { id: true } });
  if (!company) throw new AppError('Empresa não encontrada.', 404);
  const channel = await prisma.youTubeAccount.findFirst({ where: { workspaceAccountId: company.id, userId, isActive: true }, orderBy: { connectedAt: 'asc' } });
  if (!channel) throw new AppError('Conecte ou vincule o canal do YouTube desta empresa em Contas para pesquisar no YouTube. As consultas usam a conexão do próprio canal.', 400);
  return { token: await getYouTubeAccessToken(channel.id), ownChannelId: channel.channelId };
}

async function readChannel(token: string, query: { forHandle: string } | { id: string }) {
  const response = await youtubeRequest<{ items?: ApiChannel[] }>(`${YOUTUBE_API}/channels?${new URLSearchParams({ part: 'snippet,statistics,contentDetails', ...query })}`, token);
  return response.items?.[0] || null;
}

async function readVideos(token: string, ids: string[]) {
  if (!ids.length) return [];
  const response = await youtubeRequest<{ items?: ApiVideo[] }>(`${YOUTUBE_API}/videos?${new URLSearchParams({ part: 'snippet,statistics,contentDetails', id: ids.slice(0, 50).join(',') })}`, token);
  return (response.items || []).map(toPublicVideo);
}

async function latestVideos(token: string, uploads?: string) {
  if (!uploads) return [];
  const page = await youtubeRequest<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>(`${YOUTUBE_API}/playlistItems?${new URLSearchParams({ part: 'contentDetails', playlistId: uploads, maxResults: String(RECENT_VIDEOS) })}`, token);
  const videos = await readVideos(token, (page.items || []).map((item) => item.contentDetails?.videoId).filter((id): id is string => !!id));
  return videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

const channelFields = (channel: ApiChannel) => ({
  title: channel.snippet?.title || 'Canal do YouTube', handle: channel.snippet?.customUrl || null, thumbnailUrl: thumb(channel.snippet?.thumbnails),
  description: channel.snippet?.description?.slice(0, 1000) || null,
  subscribers: channel.statistics?.hiddenSubscriberCount ? null : count(channel.statistics?.subscriberCount),
  views: count(channel.statistics?.viewCount), videoCount: count(channel.statistics?.videoCount),
});

async function snapshot(competitorId: string, channel: ApiChannel, videos: PublicVideo[]) {
  const fields = channelFields(channel);
  await prisma.youTubeCompetitor.update({ where: { id: competitorId }, data: fields });
  await prisma.youTubeCompetitorSnapshot.create({ data: {
    competitorId, subscribers: fields.subscribers, views: fields.views, videoCount: fields.videoCount, ...channelMetrics(videos),
    recentVideos: videos as unknown as Prisma.InputJsonValue,
  } });
}

export async function addYouTubeCompetitor(userId: string, companyId: string, input: string) {
  const { token, ownChannelId } = await companyToken(userId, companyId);
  const total = await prisma.youTubeCompetitor.count({ where: { accountId: companyId } });
  if (total >= MAX_YOUTUBE_COMPETITORS) throw new ValidationError(`Limite de ${MAX_YOUTUBE_COMPETITORS} canais concorrentes por empresa. Remova um para adicionar outro.`);
  const channel = await readChannel(token, parseChannelInput(input));
  if (!channel) throw new AppError('Canal não encontrado no YouTube. Confira o @ ou o link.', 404);
  if (channel.id === ownChannelId) throw new ValidationError('Este é o canal da própria empresa. Adicione um concorrente.');
  const existing = await prisma.youTubeCompetitor.findUnique({ where: { accountId_channelId: { accountId: companyId, channelId: channel.id } } });
  if (existing) throw new ValidationError('Este canal já está na lista de concorrentes.');
  const competitor = await prisma.youTubeCompetitor.create({ data: { accountId: companyId, channelId: channel.id, ...channelFields(channel) } });
  await snapshot(competitor.id, channel, await latestVideos(token, channel.contentDetails?.relatedPlaylists?.uploads));
  return competitor;
}

async function ownedCompetitor(userId: string, competitorId: string) {
  const competitor = await prisma.youTubeCompetitor.findFirst({ where: { id: competitorId, account: { userId } } });
  if (!competitor) throw new AppError('Concorrente não encontrado.', 404);
  return competitor;
}

export async function refreshYouTubeCompetitor(userId: string, competitorId: string) {
  const competitor = await ownedCompetitor(userId, competitorId);
  const { token } = await companyToken(userId, competitor.accountId);
  const channel = await readChannel(token, { id: competitor.channelId });
  if (!channel) throw new AppError('O canal não foi encontrado no YouTube. Ele pode ter sido removido.', 404);
  await snapshot(competitor.id, channel, await latestVideos(token, channel.contentDetails?.relatedPlaylists?.uploads));
}

export async function removeYouTubeCompetitor(userId: string, competitorId: string) {
  const competitor = await ownedCompetitor(userId, competitorId);
  await prisma.youTubeCompetitor.delete({ where: { id: competitor.id } });
}

/** The company's own channel next to every tracked competitor, read from stored snapshots and the own channel. */
export async function youtubeCompetitorOverview(userId: string, companyId: string) {
  const company = await prisma.instagramAccount.findFirst({ where: { id: companyId, userId, isActive: true }, select: { id: true } });
  if (!company) throw new AppError('Empresa não encontrada.', 404);
  const [competitors, ownAccount] = await Promise.all([
    prisma.youTubeCompetitor.findMany({ where: { accountId: company.id }, orderBy: { createdAt: 'asc' }, include: { snapshots: { orderBy: { collectedAt: 'desc' }, take: 60 } } }),
    prisma.youTubeAccount.findFirst({ where: { workspaceAccountId: company.id, userId, isActive: true }, orderBy: { connectedAt: 'asc' } }),
  ]);
  let own = null;
  if (ownAccount) {
    own = await cached(`yt-own:${ownAccount.id}`, TRENDS_TTL_MS, async () => {
      const token = await getYouTubeAccessToken(ownAccount.id);
      const channel = await readChannel(token, { id: ownAccount.channelId });
      if (!channel) return null;
      const videos = await latestVideos(token, channel.contentDetails?.relatedPlaylists?.uploads);
      return { channelId: channel.id, ...channelFields(channel), ...channelMetrics(videos), topVideos: [...videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6) };
    }, { keep: Boolean }).catch(() => null);
  }
  return {
    connected: Boolean(ownAccount), own,
    competitors: competitors.map((competitor) => {
      const latest = competitor.snapshots[0];
      const videos = (Array.isArray(latest?.recentVideos) ? latest.recentVideos : []) as unknown as PublicVideo[];
      return {
        id: competitor.id, channelId: competitor.channelId, title: competitor.title, handle: competitor.handle, thumbnailUrl: competitor.thumbnailUrl, description: competitor.description,
        subscribers: competitor.subscribers, views: competitor.views, videoCount: competitor.videoCount, createdAt: competitor.createdAt, lastCollectedAt: latest?.collectedAt ?? null,
        avgViews: latest?.avgViews ?? null, avgLikes: latest?.avgLikes ?? null, avgComments: latest?.avgComments ?? null, engagementRate: latest?.engagementRate ?? null, uploadsPerWeek: latest?.uploadsPerWeek ?? null,
        topVideos: [...videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6),
        history: [...competitor.snapshots].reverse().map((item) => ({ collectedAt: item.collectedAt, subscribers: item.subscribers, views: item.views, videoCount: item.videoCount })),
      };
    }),
  };
}

export const YOUTUBE_TREND_CATEGORIES: Array<[string, string]> = [['', 'Todas as categorias'], ['10', 'Música'], ['17', 'Esportes'], ['20', 'Jogos'], ['22', 'Pessoas e blogs'], ['23', 'Comédia'], ['24', 'Entretenimento'], ['25', 'Notícias e política'], ['26', 'Guias e estilo'], ['27', 'Educação'], ['28', 'Ciência e tecnologia'], ['2', 'Carros e veículos'], ['1', 'Filmes e animação']];

/**
 * Trending videos in Brazil: YouTube's own "em alta" chart by category, or the most viewed
 * recent videos for a keyword. Cached for an hour per query: a keyword search costs 100 quota units.
 */
export async function youtubeTrends(userId: string, companyId: string, options: { category?: string; q?: string; days?: number; refresh?: boolean }) {
  const { token } = await companyToken(userId, companyId);
  const q = (options.q || '').trim().slice(0, 100);
  const category = YOUTUBE_TREND_CATEGORIES.some(([id]) => id === options.category) ? options.category || '' : '';
  const days = [1, 7, 30].includes(Number(options.days)) ? Number(options.days) : 7;
  const key = q ? `yt-trends:q:${q.toLowerCase()}:${days}` : `yt-trends:chart:${category}`;
  const videos = await cached(key, TRENDS_TTL_MS, async () => {
    if (!q) {
      const params = new URLSearchParams({ part: 'snippet,statistics,contentDetails', chart: 'mostPopular', regionCode: 'BR', maxResults: '30', ...(category ? { videoCategoryId: category } : {}) });
      const response = await youtubeRequest<{ items?: ApiVideo[] }>(`${YOUTUBE_API}/videos?${params}`, token);
      return (response.items || []).map(toPublicVideo);
    }
    const search = await youtubeRequest<{ items?: Array<{ id?: { videoId?: string } }> }>(`${YOUTUBE_API}/search?${new URLSearchParams({
      part: 'id', type: 'video', q, regionCode: 'BR', relevanceLanguage: 'pt', order: 'viewCount', maxResults: '30',
      publishedAfter: new Date(Date.now() - days * 86400000).toISOString(),
    })}`, token);
    const found = await readVideos(token, (search.items || []).map((item) => item.id?.videoId).filter((id): id is string => !!id));
    return found.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  }, { refresh: options.refresh, keep: (list) => Array.isArray(list) });
  return { mode: q ? 'search' : 'chart', q: q || null, category, days: q ? days : null, region: 'BR', videos, collectedAt: new Date().toISOString() };
}

/** Daily job: refresh every tracked YouTube competitor, one company connection at a time. */
export async function refreshAllYouTubeCompetitors() {
  const competitors = await prisma.youTubeCompetitor.findMany({ select: { id: true, account: { select: { userId: true } } } });
  for (const competitor of competitors) {
    try { await refreshYouTubeCompetitor(competitor.account.userId, competitor.id); }
    catch (error) { console.error(`YouTube competitor ${competitor.id} refresh failed:`, error instanceof Error ? error.message : 'unknown'); }
  }
}
