import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { decideConsent, describeConsentRequest, OAuthError } from '../services/oauth.service';

// Consent decisions require the browser session of the signed-in workspace.
// API tokens are rejected for /api/oauth/* by the scope policy.
const router = Router();
const prisma = new PrismaClient();
router.use(authenticate);

const sendError = (res: any, error: unknown, next: (error: unknown) => void) => {
  if (error instanceof OAuthError) return res.status(400).json({ error: error.description, code: error.code });
  return next(error);
};

router.post('/requests/describe', async (req: AuthRequest, res, next) => {
  try {
    const [details, user] = await Promise.all([
      describeConsentRequest(req.body?.request),
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true, email: true } }),
    ]);
    res.json({ ...details, user });
  } catch (error) {
    sendError(res, error, next);
  }
});

router.post('/consent', async (req: AuthRequest, res, next) => {
  try {
    const decision = req.body?.decision;
    if (decision !== 'approve' && decision !== 'deny') return res.status(400).json({ error: 'Escolha autorizar ou negar.' });
    res.json(await decideConsent(req.user!.id, req.body?.request, decision, req.body?.scopes));
  } catch (error) {
    sendError(res, error, next);
  }
});

export default router;
