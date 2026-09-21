import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { deleteComment, listRecentComments, replyToComment } from '../services/instagram/community.service';
import { InstagramApiError } from '../utils/errors';

const router = Router();
router.use(authenticate);

router.get('/comments', async (req: AuthRequest, res, next) => {
  try {
    const accountId = String(req.query.accountId || '');
    if (!accountId) return res.status(400).json({ error: 'Selecione uma conta do Instagram.' });
    const result = await listRecentComments(accountId, req.user!.id, 50);
    res.json(result);
  } catch (error) {
    if (error instanceof InstagramApiError) {
      return res.json({ available: false, comments: [], message: 'A Meta ainda não liberou o gerenciamento de comentários para este aplicativo. Solicite instagram_manage_comments no App Review.' });
    }
    next(error);
  }
});

const commentActionSchema = z.object({
  accountId: z.string().uuid(),
  mediaId: z.string().min(1).max(200),
});

router.post('/comments/:commentId/reply', async (req: AuthRequest, res, next) => {
  try {
    const values = commentActionSchema.extend({ message: z.string().trim().min(1).max(1000) }).parse({ ...req.body, commentId: req.params.commentId });
    const result = await replyToComment(values.accountId, req.user!.id, values.mediaId, req.params.commentId, values.message);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/comments/:commentId', async (req: AuthRequest, res, next) => {
  try {
    const values = commentActionSchema.parse(req.query);
    const result = await deleteComment(values.accountId, req.user!.id, values.mediaId, req.params.commentId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
