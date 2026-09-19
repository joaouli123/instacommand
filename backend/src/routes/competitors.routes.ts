import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { addCompetitor, removeCompetitor, collectCompetitorData } from '../services/instagram/discovery.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/:accountId', async (req: any, res, next) => {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { accountId: req.params.accountId, account: { userId: req.user.id } }
    });
    res.json(competitors);
  } catch (error) { next(error); }
});

router.post('/:accountId', async (req: any, res, next) => {
  try {
    const { igUsername } = req.body;
    const competitor = await addCompetitor(req.params.accountId, igUsername);
    res.status(201).json(competitor);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    // Should verify ownership
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
