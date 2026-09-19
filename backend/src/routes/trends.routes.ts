import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { searchHashtag, saveHashtagSearch, getSavedHashtags } from '../services/trends.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/:accountId/hashtags', async (req: any, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Query parameter q is required' });

    const result = await searchHashtag(q, req.params.accountId);
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/:accountId/saved', async (req, res, next) => {
  try {
    const hashtags = await getSavedHashtags(req.params.accountId);
    res.json(hashtags);
  } catch (error) { next(error); }
});

router.post('/:accountId/hashtags/track', async (req: any, res, next) => {
  try {
    const { hashtag, data } = req.body;
    const tracked = await saveHashtagSearch(req.params.accountId, hashtag, data);
    res.status(201).json(tracked);
  } catch (error) { next(error); }
});

router.delete('/:accountId/hashtags/:id', async (req, res, next) => {
  try {
    await prisma.hashtagSearch.delete({ where: { id: req.params.id } });
    res.json({ message: 'Hashtag tracking stopped' });
  } catch (error) { next(error); }
});

export default router;
