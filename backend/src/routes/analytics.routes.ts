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
import { InstagramApiError } from '../utils/errors';
import { getThreadsReport } from '../services/threads-report.service';
import { getFacebookReport } from '../services/facebook-report.service';

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

// Separate identity and token: never substitute Instagram metrics for Threads.
router.get('/networks/threads/:accountId', async (req: any, res, next) => {
  const days = Number(req.query.days || 30);
  if (![7, 30, 90].includes(days)) return res.status(400).json({ error: 'Escolha 7, 30 ou 90 dias.' });
  try {
    const report = await getThreadsReport(req.user.id, req.params.accountId, days);
    if (!report) return res.status(404).json({ error: 'Conta do Threads não encontrada.' });
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
    const stats = await getDashboardStats(req.params.accountId);
    res.json(stats);
  } catch (error) { next(error); }
});

router.get('/:accountId/growth', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = await getGrowthData(req.params.accountId, days);
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/engagement', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = await getEngagementTimeSeries(req.params.accountId, days);
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/posts', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await getPostPerformanceTable(req.params.accountId, page, limit);
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/audience', async (req: any, res, next) => {
  try {
    const token = await getDecryptedToken(req.params.accountId);
    const data = await getAudienceDemographics(req.account.igUserId, token);
    res.json(data);
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
    const times = await getBestTimeToPost(req.params.accountId);
    res.json(times);
  } catch (error) { next(error); }
});

router.get('/:accountId/content-types', async (req, res, next) => {
  try {
    const data = await getContentTypeAnalysis(req.params.accountId);
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/:accountId/recommendations', async (req, res, next) => {
  try {
    const recs = await getRecommendations(req.params.accountId);
    res.json(recs);
  } catch (error) { next(error); }
});

export default router;
