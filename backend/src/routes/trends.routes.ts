import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { searchHashtag, saveHashtagSearch, getSavedHashtags, getTrendFeed, hashtagSuggestions } from '../services/trends.service';
import { parsePeriodDays, parseRankFormat, parseRankSort } from '../services/instagram/content-ranking';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.use('/:accountId', async (req: any, res, next) => {
  try {
    const account = await prisma.instagramAccount.findFirst({ where: { id: req.params.accountId, userId: req.user.id, isActive: true } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    req.account = account;
    next();
  } catch (error) { next(error); }
});

router.get('/:accountId/hashtags', async (req: any, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Query parameter q is required' });

    const suggestions = hashtagSuggestions(q);
    try {
      const result = await searchHashtag(q, req.params.accountId, { force: req.query.refresh === '1' });
      res.json({ ...result, suggestions });
    } catch (error: any) {
      // Multi-word query: still return the per-word suggestions with the error.
      if (suggestions.length && error?.statusCode && error.statusCode !== 401) return res.status(error.statusCode).json({ error: error.message, suggestions });
      throw error;
    }
  } catch (error) { next(error); }
});

// "Em alta": ranked posts from tracked hashtags (top + last-24h media) and
// tracked competitors. Hashtag results are cached for 1h to save Meta quota.
router.get('/:accountId/feed', async (req: any, res, next) => {
  try {
    const hashtags = typeof req.query.hashtags === 'string' && req.query.hashtags.trim()
      ? req.query.hashtags.split(',').map((tag: string) => tag.trim()).filter(Boolean).slice(0, 8)
      : undefined;
    const feed = await getTrendFeed(req.params.accountId, {
      hashtags,
      sort: parseRankSort(req.query.sort),
      format: parseRankFormat(req.query.format ?? 'ALL'),
      periodDays: parsePeriodDays(req.query.days),
      refresh: req.query.refresh === '1',
      includeCompetitors: req.query.competitors !== '0',
    });
    res.json(feed);
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
    const { hashtag, data } = req.body || {};
    const tracked = await saveHashtagSearch(req.params.accountId, hashtag, data);
    res.status(201).json(tracked);
  } catch (error) { next(error); }
});

router.delete('/:accountId/hashtags/:id', async (req, res, next) => {
  try {
    const removed = await prisma.hashtagSearch.deleteMany({ where: { id: req.params.id, accountId: req.params.accountId } });
    if (!removed.count) return res.status(404).json({ error: 'Hashtag not found' });
    res.json({ message: 'Hashtag tracking stopped' });
  } catch (error) { next(error); }
});

export default router;
