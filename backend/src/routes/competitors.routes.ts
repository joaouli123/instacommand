import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { addCompetitor, removeCompetitor, collectCompetitorData } from '../services/instagram/discovery.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.use(async (req: any, res, next) => {
  try {
    const accountId = req.params.accountId || undefined;
    const competitorId = req.params.id || undefined;
    if (accountId) {
      const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, userId: req.user.id, isActive: true } });
      if (!account) return res.status(404).json({ error: 'Account not found' });
      req.account = account;
    } else if (competitorId) {
      const competitor = await prisma.competitor.findFirst({ where: { id: competitorId, account: { userId: req.user.id } } });
      if (!competitor) return res.status(404).json({ error: 'Competitor not found' });
      req.competitor = competitor;
    }
    next();
  } catch (error) { next(error); }
});

router.get('/:accountId', async (req: any, res, next) => {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { accountId: req.params.accountId, account: { userId: req.user.id } }
      , include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } }
    });
    res.json(competitors);
  } catch (error) { next(error); }
});

router.post('/:accountId', async (req: any, res, next) => {
  try {
    const { igUsername } = req.body;
    if (typeof igUsername !== 'string' || !igUsername.trim()) return res.status(400).json({ error: 'Informe o @username do concorrente.' });
    const competitor = await addCompetitor(req.params.accountId, igUsername.trim().replace(/^@/, ''));
    res.status(201).json(competitor);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    await removeCompetitor(req.params.id);
    res.json({ message: 'Competitor removed' });
  } catch (error) { next(error); }
});

router.get('/:id/insights', async (req: any, res, next) => {
  try {
    const insights = await prisma.competitorInsight.findMany({
      where: { competitorId: req.params.id },
      orderBy: { collectedAt: 'desc' },
      take: 30
    });
    res.json(insights);
  } catch (error) { next(error); }
});

router.post('/:id/refresh', async (req: any, res, next) => {
  try {
    await collectCompetitorData(req.params.id);
    res.json({ message: 'Competitor data refreshed' });
  } catch (error) { next(error); }
});

export default router;
