import { PrismaClient } from '@prisma/client';
import { graphGet } from '../utils/instagram-api';
import { getDecryptedToken } from './instagram/auth.service';
import { AppError, InstagramApiError, NotFoundError, ValidationError } from '../utils/errors';
import {
  normalizePost,
  rankPosts,
  RankedPost,
  RankFormat,
  RankSort,
  TtlCache,
} from './instagram/content-ranking';

const prisma = new PrismaClient();

/**
 * Instagram has no public "explore/trending" endpoint. The closest real signal
 * the Graph API offers is hashtag search: /{hashtag-id}/top_media (most popular
 * posts for the tag) and /{hashtag-id}/recent_media (posted in the last 24h).
 * Meta allows at most 30 unique hashtags per Instagram account in a rolling
 * 7-day window, so results are cached and hashtag ids are reused from the DB.
 */
export const HASHTAG_WEEKLY_LIMIT = 30;
const HASHTAG_CACHE_TTL_MS = 60 * 60 * 1000;
const hashtagCache = new TtlCache<HashtagSearchResult>(HASHTAG_CACHE_TTL_MS);

// Fields documented for hashtag media. thumbnail_url and view counts are not
// exposed on hashtag edges, so videos may come without a preview image.
const HASHTAG_MEDIA_FIELDS = 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count';

export type HashtagSearchResult = {
  hashtag: string;
  igHashtagId: string;
  topMediaCount: number;
  recentMediaCount: number;
  topMedia: any[];
  recentMedia: any[];
  searchedAt: string;
  cached?: boolean;
};

export const normalizeHashtag = (value: unknown): string => {
  // "app transporte" / "#App Transporte" -> "apptransporte" (hashtags have no spaces).
  const tag = String(value ?? '').trim().replace(/#/g, '').replace(/[\s\-.]+/g, '').toLowerCase();
  if (!tag || tag.length > 100 || !/^[\p{L}\p{N}_]+$/u.test(tag)) {
    throw new ValidationError('Hashtag inválida. Use só letras, números e _ (sem espaços).');
  }
  return tag;
};

/** For a multi-word query, offer the joined tag plus each word as its own hashtag. */
export const hashtagSuggestions = (value: unknown): string[] => {
  const words = String(value ?? '').replace(/#/g, ' ').split(/[\s\-.,]+/).map((word) => word.toLowerCase()).filter((word) => /^[\p{L}\p{N}_]{2,100}$/u.test(word));
  if (words.length < 2) return [];
  return [...new Set([words.join(''), ...words])].slice(0, 6);
};

/** Translate hashtag Graph errors into clear Portuguese. Never a 401. */
export const hashtagLookupError = (error: unknown, tag: string): AppError => {
  if (!(error instanceof InstagramApiError)) {
    return error instanceof AppError && error.statusCode !== 401 ? error : new AppError('Não foi possível consultar a Meta agora. Tente novamente.', 502);
  }
  const code = error.metaCode;
  const sub = error.metaSubcode;
  if (code === 24 || sub === 2207042 || sub === 2207034) return new AppError('Limite da Meta atingido: cada conta pode consultar até 30 hashtags diferentes a cada 7 dias. Use uma hashtag já monitorada ou tente mais tarde.', 429);
  if (code === 4 || code === 17 || code === 32 || code === 613) return new AppError('Muitas consultas seguidas à Meta. Aguarde alguns minutos.', 429);
  if (code === 190) return new AppError('A autorização da Meta expirou. Reconecte a conta em Contas conectadas.', 400);
  if (code === 10 || code === 200 || (code !== undefined && code > 200 && code < 300)) return new AppError('A Meta não liberou a busca de hashtags para este app (permissão Instagram Public Content Access). Reconecte a conta ou fale com o administrador.', 400);
  if (code === 100 || code === 110) return new AppError(`A Meta não aceitou #${tag}. Confira se a hashtag existe e não contém espaços ou símbolos.`, 404);
  return new AppError(`A Meta recusou a busca por #${tag}${code !== undefined ? ` (código ${code})` : ''}.`, 502);
};

const loadAccount = async (accountId: string) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new NotFoundError('Conta não encontrada.');
  return account;
};

const resolveHashtagId = async (tag: string, igUserId: string, token: string) => {
  // Hashtag ids are global; reuse a stored one before spending a search.
  const known = await prisma.hashtagSearch.findFirst({ where: { hashtag: tag, igHashtagId: { not: null } }, select: { igHashtagId: true } });
  if (known?.igHashtagId) return known.igHashtagId;
  const idSearch = await graphGet('/ig_hashtag_search', token, { user_id: igUserId, q: tag });
  const id = Array.isArray(idSearch?.data) ? idSearch.data[0]?.id : undefined;
  if (!id) throw new NotFoundError(`A Meta não encontrou a hashtag #${tag}.`);
  return String(id);
};

export const searchHashtag = async (hashtag: string, accountId: string, options: { force?: boolean } = {}): Promise<HashtagSearchResult> => {
  const tag = normalizeHashtag(hashtag);
  const cacheKey = `${accountId}:${tag}`;
  if (!options.force) {
    const cached = hashtagCache.get(cacheKey);
    if (cached) return { ...cached.value, cached: true };
  }
  const account = await loadAccount(accountId);
  const token = await getDecryptedToken(accountId);
  let igHashtagId: string;
  let topResponse: any;
  let recentResponse: any;
  try {
    igHashtagId = await resolveHashtagId(tag, account.igUserId, token);
    const mediaParams = { user_id: account.igUserId, fields: HASHTAG_MEDIA_FIELDS, limit: 50 };
    [topResponse, recentResponse] = await Promise.all([
      graphGet(`/${igHashtagId}/top_media`, token, mediaParams),
      graphGet(`/${igHashtagId}/recent_media`, token, mediaParams),
    ]);
  } catch (error) { throw hashtagLookupError(error, tag); }
  const topMedia = Array.isArray(topResponse?.data) ? topResponse.data : [];
  const recentMedia = Array.isArray(recentResponse?.data) ? recentResponse.data : [];

  const result: HashtagSearchResult = {
    hashtag: tag,
    igHashtagId,
    topMediaCount: topMedia.length,
    recentMediaCount: recentMedia.length,
    topMedia,
    recentMedia,
    searchedAt: new Date().toISOString(),
  };
  hashtagCache.set(cacheKey, result);
  // Keep counters and the last search time fresh for a tracked tag.
  await prisma.hashtagSearch.updateMany({
    where: { accountId, hashtag: tag },
    data: { igHashtagId, topMediaCount: topMedia.length, recentMediaCount: recentMedia.length, lastSearchedAt: new Date() },
  });
  return result;
};

export const saveHashtagSearch = async (accountId: string, hashtag: string, data: any) => {
  const tag = normalizeHashtag(hashtag);
  const existing = await prisma.hashtagSearch.findFirst({ where: { accountId, hashtag: tag } });
  const values = {
    igHashtagId: typeof data?.igHashtagId === 'string' ? data.igHashtagId : existing?.igHashtagId ?? null,
    topMediaCount: Number(data?.topMediaCount || 0),
    recentMediaCount: Number(data?.recentMediaCount || 0),
  };
  if (existing) return prisma.hashtagSearch.update({ where: { id: existing.id }, data: { ...values, lastSearchedAt: new Date() } });
  const total = await prisma.hashtagSearch.count({ where: { accountId } });
  if (total >= 15) throw new ValidationError('Limite de 15 hashtags monitoradas. A Meta só permite 30 hashtags diferentes por semana.');
  return prisma.hashtagSearch.create({ data: { accountId, hashtag: tag, ...values } });
};

export const getHashtagInsights = async (hashtagId: string, accountId: string) => {
  return prisma.hashtagSearch.findFirst({ where: { id: hashtagId, accountId } });
};

export const getSavedHashtags = async (accountId: string) => {
  return prisma.hashtagSearch.findMany({
    where: { accountId },
    orderBy: { lastSearchedAt: 'desc' },
  });
};

/** Unique hashtags this account searched in the last 7 days (an estimate of Meta's quota usage). */
export const hashtagQuotaEstimate = async (accountId: string) => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await prisma.hashtagSearch.findMany({ where: { accountId, lastSearchedAt: { gte: since } }, select: { hashtag: true } });
  return { used: new Set(rows.map((row) => row.hashtag)).size, limit: HASHTAG_WEEKLY_LIMIT };
};

const feedErrorMessage = (error: unknown) => (error instanceof AppError ? error.message : 'Falha ao consultar a hashtag.');

export type TrendFeedOptions = {
  hashtags?: string[];
  sort?: RankSort;
  format?: RankFormat;
  periodDays?: number | null;
  refresh?: boolean;
  includeCompetitors?: boolean;
};

export const getTrendFeed = async (accountId: string, options: TrendFeedOptions = {}) => {
  const { sort = 'engagement', format = 'ALL', periodDays = null, refresh = false, includeCompetitors = true } = options;
  const tracked = await getSavedHashtags(accountId);
  const requested = (options.hashtags?.length ? options.hashtags : tracked.map((item) => item.hashtag))
    .map((tag) => { try { return normalizeHashtag(tag); } catch { return null; } })
    .filter((tag): tag is string => !!tag);
  const hashtags = [...new Set(requested)].slice(0, 8);

  const now = new Date();
  const settled = await Promise.allSettled(hashtags.map((tag) => searchHashtag(tag, accountId, { force: refresh })));
  const posts: RankedPost[] = [];
  const recent: RankedPost[] = [];
  const sources = settled.map((outcome, index) => {
    const tag = hashtags[index];
    if (outcome.status === 'rejected') return { type: 'hashtag' as const, label: tag, status: 'error' as const, error: feedErrorMessage(outcome.reason) };
    const result = outcome.value;
    for (const media of result.topMedia) {
      const post = normalizePost(media, { type: 'hashtag_top', label: tag }, now);
      if (post) posts.push(post);
    }
    for (const media of result.recentMedia) {
      const post = normalizePost(media, { type: 'hashtag_recent', label: tag }, now);
      if (post) { recent.push(post); posts.push(post); }
    }
    return { type: 'hashtag' as const, label: tag, status: 'ok' as const, cached: !!result.cached, searchedAt: result.searchedAt, count: result.topMediaCount + result.recentMediaCount };
  });

  let competitorCount = 0;
  if (includeCompetitors) {
    const competitors = await prisma.competitor.findMany({
      where: { accountId, isActive: true },
      include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
    });
    for (const competitor of competitors) {
      const latest = competitor.insights[0];
      const media = Array.isArray(latest?.recentPostsData) ? latest.recentPostsData as any[] : [];
      if (!media.length) continue;
      competitorCount += 1;
      for (const item of media) {
        const post = normalizePost(item, { type: 'competitor', label: competitor.igUsername, followers: latest.followers || competitor.igFollowersCount }, now);
        if (post) posts.push(post);
      }
    }
  }

  return {
    items: rankPosts(posts, { sort, format, periodDays, limit: 60, now }),
    // recent_media only covers the last 24h: rank it by interactions per hour.
    explodingToday: rankPosts(recent.filter((post) => post.velocity !== null), { sort: 'engagement', format, limit: 200, now })
      .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
      .slice(0, 12),
    sources,
    competitorsIncluded: competitorCount,
    quota: await hashtagQuotaEstimate(accountId),
    generatedAt: now.toISOString(),
  };
};
