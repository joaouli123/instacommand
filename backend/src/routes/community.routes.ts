import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { deleteComment, listRecentComments, replyToComment } from '../services/instagram/community.service';

const router = Router();
router.use(authenticate);

// The YouTube client is loaded on demand: Instagram-only requests never depend on it.
const youtube = () => require('../services/youtube-community.service') as typeof import('../services/youtube-community.service');
const meta = () => require('../services/meta-community.service') as typeof import('../services/meta-community.service');
const networkOf = (value: unknown) => String(value || '').toLowerCase();

router.get('/comments', async (req: AuthRequest, res, next) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ error: 'Selecione uma conta do Instagram.' });
    // accountId is always the company; YouTube uses the channel linked to it.
    const network = networkOf(req.query.network);
    const result = network === 'youtube' ? await youtube().listYouTubeComments(req.user!.id, accountId, 100)
      : network === 'facebook' ? await meta().listFacebookComments(req.user!.id, accountId, 100)
      : network === 'threads' ? await meta().listThreadsComments(req.user!.id, accountId, 100)
      : await listRecentComments(accountId, req.user!.id, 100);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const commentActionSchema = z.object({
  accountId: z.string().uuid(),
  mediaId: z.string().min(1).max(200),
  network: z.enum(['instagram', 'youtube', 'facebook', 'threads']).default('instagram'),
});

router.post('/comments/:commentId/reply', async (req: AuthRequest, res, next) => {
  try {
    const values = commentActionSchema.extend({ message: z.string().trim().min(1).max(1000) }).parse({ ...req.body, commentId: req.params.commentId });
    const result = values.network === 'youtube'
      ? await youtube().replyToCompanyYouTubeComment(req.user!.id, values.accountId, req.params.commentId, values.message)
      : values.network === 'facebook' ? await meta().replyToFacebookComment(req.user!.id, values.accountId, req.params.commentId, values.message)
      : values.network === 'threads' ? await meta().replyToThreadsComment(req.user!.id, values.accountId, req.params.commentId, values.message)
      : await replyToComment(values.accountId, req.user!.id, values.mediaId, req.params.commentId, values.message);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/comments/:commentId', async (req: AuthRequest, res, next) => {
  try {
    const values = commentActionSchema.parse(req.query);
    // YouTube, Facebook and Threads hide other people's comments instead of deleting them.
    const result = values.network === 'youtube'
      ? await youtube().hideCompanyYouTubeComment(req.user!.id, values.accountId, req.params.commentId)
      : values.network === 'facebook' ? await meta().hideFacebookComment(req.user!.id, values.accountId, req.params.commentId)
      : values.network === 'threads' ? await meta().hideThreadsComment(req.user!.id, values.accountId, req.params.commentId)
      : await deleteComment(values.accountId, req.user!.id, values.mediaId, req.params.commentId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
