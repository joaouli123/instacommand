import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  addYouTubeCompetitor, refreshYouTubeCompetitor, removeYouTubeCompetitor, youtubeCompetitorOverview, youtubeTrends, YOUTUBE_TREND_CATEGORIES,
} from '../services/youtube-research.service';

// YouTube competitors and trends of one company (an Instagram account of the user).
const router = Router();
router.use(authenticate);

router.get('/:accountId/competitors', async (req: any, res, next) => {
  try { res.json(await youtubeCompetitorOverview(req.user.id, req.params.accountId)); } catch (error) { next(error); }
});

router.post('/:accountId/competitors', async (req: any, res, next) => {
  try {
    const channel = req.body?.channel;
    if (typeof channel !== 'string' || !channel.trim() || channel.length > 300) return res.status(400).json({ error: 'Informe o @ do canal, o link ou o ID do canal.' });
    res.status(201).json(await addYouTubeCompetitor(req.user.id, req.params.accountId, channel));
  } catch (error) { next(error); }
});

router.post('/competitors/:id/refresh', async (req: any, res, next) => {
  try { await refreshYouTubeCompetitor(req.user.id, req.params.id); res.json({ message: 'Canal atualizado' }); } catch (error) { next(error); }
});

router.delete('/competitors/:id', async (req: any, res, next) => {
  try { await removeYouTubeCompetitor(req.user.id, req.params.id); res.json({ message: 'Concorrente removido' }); } catch (error) { next(error); }
});

router.get('/:accountId/trends', async (req: any, res, next) => {
  try {
    res.json({ ...await youtubeTrends(req.user.id, req.params.accountId, {
      category: typeof req.query.category === 'string' ? req.query.category : '',
      q: typeof req.query.q === 'string' ? req.query.q : '',
      days: Number(req.query.days || 7), refresh: req.query.refresh === '1',
    }), categories: YOUTUBE_TREND_CATEGORIES.map(([id, label]) => ({ id, label })) });
  } catch (error) { next(error); }
});

export default router;
