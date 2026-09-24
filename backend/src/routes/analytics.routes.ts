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
import { getAudienceDemographics, getBestTimeToPost, getContentTypeAnalysis } from '../services/instagram/insights.service';
import { getDecryptedToken } from '../services/instagram/auth.service';
import { PrismaClient } from '@prisma/client';
import { MediaType } from '@prisma/client';
import { InstagramApiError } from '../utils/errors';
import { getFacebookReport } from '../services/facebook-report.service';
import { analyticsDays } from '../services/analytics-period';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/networks/facebook/:accountId', async (req: any, res, next) => {
  const days = Number(req.query.days || 30);
  if (![7, 30, 90, 365, 730].includes(days)) return res.status(400).json({ error: 'Escolha um período disponível no relatório.' });
  try {
    const report = await getFacebookReport(req.user.id, req.params.accountId, days);
    if (!report) return res.status(404).json({ error: 'Conta não encontrada.' });
    return res.json(report);
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
    const token = await getDecryptedToken(req.params.accountId);
    const audience = req.query.audience === 'engaged' ? 'engaged' : 'followers';
    const data = await getAudienceDemographics(req.account.igUserId, token, audience);
    res.json({
      available: data.length > 0,
      audience,
      timeframe: 'last_30_days',
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
