import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { addCompetitor, removeCompetitor, collectCompetitorData, normalizeCompetitorInsight } from '../services/instagram/discovery.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/:accountId', async (req: any, res, next) => {
  try {
    const account = await prisma.instagramAccount.findFirst({ where: { id: req.params.accountId, userId: req.user.id, isActive: true } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const competitors = await prisma.competitor.findMany({
      where: { accountId: req.params.accountId, account: { userId: req.user.id } }
      , include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } }
    });
    res.json(competitors.map((competitor) => ({
      ...competitor,
      insights: competitor.insights.map(normalizeCompetitorInsight),
    })));
  } catch (error) { next(error); }
});

router.post('/:accountId', async (req: any, res, next) => {
  try {
    const { igUsername } = req.body;
    if (typeof igUsername !== 'string' || !igUsername.trim()) return res.status(400).json({ error: 'Informe o @username do concorrente.' });
    const competitor = await addCompetitor(req.params.accountId, req.user.id, igUsername);
    res.status(201).json(competitor);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    await removeCompetitor(req.params.id, req.user.id);
    res.json({ message: 'Competitor removed' });
  } catch (error) { next(error); }
});

router.get('/:id/insights', async (req: any, res, next) => {
  try {
    const competitor = await prisma.competitor.findFirst({ where: { id: req.params.id, account: { userId: req.user.id } }, select: { id: true } });
    if (!competitor) return res.status(404).json({ error: 'Competitor not found' });
    const insights = await prisma.competitorInsight.findMany({
      where: { competitorId: req.params.id },
      orderBy: { collectedAt: 'desc' },
      take: 30
    });
    res.json(insights.map(normalizeCompetitorInsight));
  } catch (error) { next(error); }
});

router.post('/:id/refresh', async (req: any, res, next) => {
  try {
    await collectCompetitorData(req.params.id, req.user.id);
    res.json({ message: 'Competitor data refreshed' });
  } catch (error) { next(error); }
});

export default router;
