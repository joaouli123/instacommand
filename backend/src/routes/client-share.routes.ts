import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import * as share from '../services/client-share.service';

/** Owner side: create, list and revoke client links; read and answer comments. */
export const ownerRouter = Router();
ownerRouter.use(authenticate);

ownerRouter.get('/', async (req: AuthRequest, res, next) => {
  try { res.json(await share.listShareLinks(req.user!.id)); } catch (error) { next(error); }
});

ownerRouter.post('/', async (req: AuthRequest, res, next) => {
  try { res.status(201).json(await share.createShareLink(req.user!.id, req.body)); } catch (error) { next(error); }
});

ownerRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try { res.json(await share.revokeShareLink(req.user!.id, req.params.id)); } catch (error) { next(error); }
});

ownerRouter.get('/posts/:postId/comments', async (req: AuthRequest, res, next) => {
  try { res.json(await share.listPostComments(req.user!.id, req.params.postId)); } catch (error) { next(error); }
});

ownerRouter.post('/comments/:id/resolve', async (req: AuthRequest, res, next) => {
  try { res.json(await share.setCommentResolved(req.user!.id, req.params.id, req.body?.resolved !== false)); } catch (error) { next(error); }
});

ownerRouter.post('/comments/:id/reply', async (req: AuthRequest, res, next) => {
  try { res.status(201).json(await share.replyToComment(req.user!.id, req.params.id, req.body)); } catch (error) { next(error); }
});

/** Public side: no authentication, the token in the path is the only key. */
export const publicRouter = Router();
const viewLimit = rateLimit({ name: 'share-view', windowMs: 5 * 60_000, max: 120, byAddressOnly: true });
const commentLimit = rateLimit({ name: 'share-comment', windowMs: 10 * 60_000, max: 30, byAddressOnly: true });

publicRouter.use((_req, res, next) => {
  // The link itself is the credential: never let it leak through Referer or caches.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

publicRouter.get('/:token', viewLimit, async (req, res, next) => {
  try { res.json(await share.getPublicSchedule(req.params.token, req.query as any)); } catch (error) { next(error); }
});

publicRouter.post('/:token/posts/:postId/comments', commentLimit, async (req, res, next) => {
  try { res.status(201).json(await share.createPublicComment(req.params.token, req.params.postId, req.body)); } catch (error) { next(error); }
});
