import { getPrisma } from '../lib/prisma';
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { 
  getDashboardStats, 
  getGrowthData, 
  getEngagementTimeSeries, 
  getTopPosts, 
  getPostPerformanceTable, 
  getRecommendations 
} from '../services/analytics.service';
import { getAudienceDemographics, getBestTimeToPost, getContentTypeAnalysis, getInstagramProfileReport } from '../services/instagram/insights.service';
import { getDecryptedToken, getInstagramGrantedPermissions } from '../services/instagram/auth.service';

import { MediaType } from '@prisma/client';
import { InstagramApiError } from '../utils/errors';
import { getFacebookReport } from '../services/facebook-report.service';
import { getThreadsReport } from '../services/threads-report.service';
import { analyticsDays } from '../services/analytics-period';
import { readLimitedBody, safeGet } from '../utils/safe-fetch';
import { detectMediaSignature } from '../utils/media-signature';
import { cached } from '../utils/ttl-cache';

// Provider-backed reports are reused for a few minutes per user/account/period.
const REPORT_TTL_MS = 5 * 60_000;

const router = Router();
const prisma = getPrisma();

// Meta CDN hosts that serve post thumbnails; nothing else is proxied.
export const isMetaCdnHost = (host: string) => /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(host);

router.use(authenticate);

// Thumbnails for the PDF report. Meta's CDN sends no CORS headers, so the
// browser cannot draw those images into a PDF; the signed-in user gets them
// here as data URLs. Only small HTTPS images from Meta's CDN.
router.get('/media-preview', async (req: any, res, next) => {
  try {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    let url: URL;
    try { url = new URL(raw); } catch { return res.status(400).json({ error: 'URL inválida.' }); }
    if (url.protocol !== 'https:' || !isMetaCdnHost(url.hostname)) return res.status(400).json({ error: 'Somente imagens da Meta.' });
    const { response, abort } = await safeGet(url.toString(), { allowHttp: false, timeoutMs: 10_000, maxRedirects: 0 });
    try {
      if ((response.statusCode || 500) >= 400) return res.status(404).json({ error: 'Imagem indisponível.' });
      const body = await readLimitedBody(response, 5 * 1024 * 1024);
      const media = detectMediaSignature(body.subarray(0, 64));
      if (media?.kind !== 'image') return res.status(415).json({ error: 'O arquivo não é uma imagem.' });
      res.setHeader('Cache-Control', 'private, max-age=600');
      return res.json({ dataUrl: `data:${media.mimeType};base64,${body.toString('base64')}` });
    } finally { abort(); }
  } catch (error) { next(error); }
});

router.get('/networks/x/:accountId', async (req: any, res, next) => {
  const days = Number(req.query.days || 30);
  if (![7, 30, 90].includes(days)) return res.status(400).json({ error: 'Escolha um período disponível no relatório.' });
  try {
    // Loaded on demand: the X client is only needed for this route.
    const { getXReport } = require('../services/x-report.service') as typeof import('../services/x-report.service');
    const now = Date.now();
    // Previous window of the same length for the comparison badges; it never blocks the current report.
    // Current period first (it may refresh the stored numbers); the previous one is read from the database only.
    const report = await getXReport(req.user.id, req.params.accountId, days, { endAt: now, refresh: req.query.refresh === '1' });
    const previous = report ? await getXReport(req.user.id, req.params.accountId, days, { endAt: now - days * 86400000, skipSync: true }).catch(() => null) : null;
    if (!report) return res.status(404).json({ error: 'Conta do X não encontrada.' });
    return res.json({ ...report, previous: previous ? { period: previous.period, totals: previous.totals, engagementRate: previous.engagementRate } : null });
  } catch (error) { next(error); }
});

// Network-specific routes must precede the Instagram account middleware.
router.get('/networks/threads/:accountId', async (req: any, res, next) => {
  const days = Number(req.query.days || 30);
  if (![7, 30, 90].includes(days)) return res.status(400).json({ error: 'Escolha um período disponível no relatório.' });
  try {
    const body = await cached(`threads:${req.user.id}:${req.params.accountId}:${days}`, REPORT_TTL_MS, async () => {
      const now = Date.now();
      // The window of the same length right before, for "vs. período anterior"; never blocks the current report.
      // Current report first; the previous window only after it, to avoid a burst of provider calls.
      const report = await getThreadsReport(req.user.id, req.params.accountId, days, now);
      const previous = report ? await getThreadsReport(req.user.id, req.params.accountId, days, now - days * 86400000).catch(() => null) : null;
      return report ? { ...report, previous: previous ? { period: previous.period, metrics: previous.metrics, posts: previous.contentAvailable ? previous.posts.length : null } : null } : null;
    }, { refresh: req.query.refresh === '1', keep: Boolean });
    if (!body) return res.status(404).json({ error: 'Conta do Threads não encontrada.' });
    return res.json(body);
  } catch (error) { next(error); }
});

router.get('/networks/facebook/:accountId', async (req: any, res, next) => {
  const days = Number(req.query.days || 30);
  if (![7, 30, 90, 365, 730].includes(days)) return res.status(400).json({ error: 'Escolha um período disponível no relatório.' });
  try {
    const body = await cached(`facebook:${req.user.id}:${req.params.accountId}:${days}`, REPORT_TTL_MS, async () => {
      const now = Date.now();
      const report = await getFacebookReport(req.user.id, req.params.accountId, days, now);
      // Comparing 1–2 years would page through years of posts; only up to 90 days is compared.
      const previous = report && days <= 90 ? await getFacebookReport(req.user.id, req.params.accountId, days, now - days * 86400000).catch(() => null) : null;
      return report ? { ...report, previous: previous ? { period: previous.period, mediaViews: previous.insights.mediaViews, totals: previous.totals, posts: previous.contentAvailable ? previous.posts.length : null } : null } : null;
    }, { refresh: req.query.refresh === '1', keep: Boolean });
    if (!body) return res.status(404).json({ error: 'Conta não encontrada.' });
    return res.json(body);
  } catch (error) { next(error); }
});

// Middleware to check account ownership
router.use('/:accountId', async (req: any, res, next) => {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: req.params.accountId, userId: req.user.id }
  });
  if (!account) return res.status(404).json({ error: 'Account not found' });
  req.account = account;
  next();
});

router.get('/:accountId/dashboard', async (req: any, res, next) => {
  try {
    const stats = await getDashboardStats(req.params.accountId, analyticsDays(req.query.days ?? 30));
    res.json(stats);
  } catch (error) { next(error); }
});

router.get('/:accountId/access', async (req: any, res) => {
  try {
    const scopes = await getInstagramGrantedPermissions(req.params.accountId);
    res.json({ verified: true, instagramInsights: scopes.includes('instagram_manage_insights'),
      facebookInsights: scopes.includes('read_insights'), facebookCounters: scopes.includes('pages_read_user_content') });
  } catch {
    // A failed check is unknown, not proof that a permission is missing.
    res.json({ verified: false, instagramInsights: null, facebookInsights: null, facebookCounters: null });
  }
});

router.get('/:accountId/profile-report', async (req: any, res, next) => {
  try {
    const report = await getInstagramProfileReport(req.account, analyticsDays(req.query.days ?? 30));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(report);
  } catch (error) { next(error); }
});

router.get('/:accountId/growth', async (req, res, next) => {
  try {
    const days = analyticsDays(req.query.days ?? 30);
    const data = await getGrowthData(req.params.accountId, days);
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/engagement', async (req, res, next) => {
  try {
    const days = analyticsDays(req.query.days ?? 30);
    const data = await getEngagementTimeSeries(req.params.accountId, days);
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/top-posts', async (req, res, next) => {
  try {
    const days = analyticsDays(req.query.days ?? 30);
    const requestedType = typeof req.query.mediaType === 'string' ? req.query.mediaType : undefined;
    if (requestedType && !['IMAGE', 'CAROUSEL', 'REEL', 'STORY', 'FEED'].includes(requestedType)) return res.status(400).json({ error: 'Tipo de publicação inválido.' });
    const mediaType = requestedType === 'FEED' ? [MediaType.IMAGE, MediaType.CAROUSEL] : requestedType as MediaType | undefined;
    const allowedSorts = ['interactions', 'views', 'reach', 'engagement', 'likes'];
    const sortBy = typeof req.query.sortBy === 'string' && allowedSorts.includes(req.query.sortBy) ? req.query.sortBy : 'interactions';
    const data = await getTopPosts(req.params.accountId, 20, sortBy, days, mediaType as MediaType | undefined);
    res.json({ data, metric: sortBy, mediaType: requestedType || null, days });
  } catch (error) { next(error); }
});

router.get('/:accountId/posts', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'Paginação inválida.' });
    const data = await getPostPerformanceTable(req.params.accountId, page, limit, analyticsDays(req.query.days ?? 30));
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/audience', async (req: any, res, next) => {
  try {
    const audience = req.query.audience === 'engaged' ? 'engaged' : 'followers';
    // Demographics are 30-day aggregates; a sync or reconnect changes the revision part of the key.
    const revision = `${req.account.updatedAt?.getTime?.() ?? ''}:${req.account.lastSyncAt?.getTime?.() ?? ''}`;
    const data = await cached(`audience:${req.params.accountId}:${revision}:${audience}`, 15 * 60_000, async () => {
      const token = await getDecryptedToken(req.params.accountId);
      return getAudienceDemographics(req.account.igUserId, token, audience);
    }, { refresh: req.query.refresh === '1', keep: (rows) => rows.length > 0 });
    res.json({
      available: data.length > 0,
      audience,
      timeframe: audience === 'engaged' ? 'this_month' : 'last_30_days',
      data,
      message: data.length ? undefined : 'A Meta não retornou dados demográficos para este público e período. Verifique as permissões e a elegibilidade da conta.',
    });
  } catch (error) {
    // Audience demographics are an optional Meta permission. Keep analytics
    // usable and tell the UI precisely why this panel is unavailable.
    if (error instanceof InstagramApiError) {
      return res.json({ available: false, data: [], message: 'A Meta ainda não liberou os dados demográficos para esta conexão.' });
    }
    next(error);
  }
});

router.get('/:accountId/best-times', async (req, res, next) => {
  try {
    const times = await getBestTimeToPost(req.params.accountId, analyticsDays(req.query.days ?? 30));
    res.json(times);
  } catch (error) { next(error); }
});

router.get('/:accountId/content-types', async (req, res, next) => {
  try {
    const data = await getContentTypeAnalysis(req.params.accountId, analyticsDays(req.query.days ?? 30));
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/recommendations', async (req, res, next) => {
  try {
    const recs = await getRecommendations(req.params.accountId, analyticsDays(req.query.days ?? 30));
    res.json(recs);
  } catch (error) { next(error); }
});

export default router;
