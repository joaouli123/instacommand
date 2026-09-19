import { Router } from 'express';
import { getConnectedAccounts, disconnectAccount } from '../services/instagram/auth.service';
import { saveProfileSnapshot } from '../services/instagram/insights.service';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

router.get('/', async (req: any, res, next) => {
  try {
    const accounts = await getConnectedAccounts(req.user.id);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: any, res, next) => {
  try {
    const account = await prisma.instagramAccount.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    await disconnectAccount(req.params.id, req.user.id);
    res.json({ message: 'Account disconnected' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/sync', async (req: any, res, next) => {
  try {
    // Basic verification that user owns account
    const account = await prisma.instagramAccount.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    await saveProfileSnapshot(account.id);
    res.json({ message: 'Account synced' });
  } catch (error) {
    next(error);
  }
});

export default router;
