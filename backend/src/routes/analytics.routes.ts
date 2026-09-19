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

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

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
  } catch (error) { next(error); }
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
