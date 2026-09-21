import { Router } from 'express';
import { getConnectedAccounts, getPendingConnectedAccounts, selectConnectedAccounts, disconnectAccount, getConnectedThreadsAccounts, disconnectThreadsAccount } from '../services/instagram/auth.service';
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

router.get('/threads', async (req: any, res, next) => {
  try {
    const accounts = await getConnectedThreadsAccounts(req.user.id);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
});

router.get('/pending', async (req: any, res, next) => {
  try {
    res.json(await getPendingConnectedAccounts(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.post('/select', async (req: any, res, next) => {
  try {
    const accountIds = Array.isArray(req.body?.accountIds)
      ? req.body.accountIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    if (accountIds.length > 100) return res.status(400).json({ error: 'Selecione no máximo 100 contas.' });
    res.json({ message: 'Contas selecionadas com sucesso', accounts: await selectConnectedAccounts(req.user.id, accountIds) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: any, res, next) => {
  try {
    const account = await prisma.instagramAccount.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: {
        id: true,
        igUserId: true,
        igUsername: true,
        igName: true,
        igProfilePicUrl: true,
        igBio: true,
        igFollowersCount: true,
        igFollowsCount: true,
        igMediaCount: true,
        pageId: true,
        pageName: true,
        isActive: true,
        connectedAt: true,
        lastSyncAt: true,
      },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (error) {
    next(error);
  }
});

router.delete('/threads/:id', async (req: any, res, next) => {
  try {
    await disconnectThreadsAccount(req.params.id, req.user.id);
    res.json({ message: 'Conta do Threads desconectada' });
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

    const sync = await saveProfileSnapshot(account.id);
    res.json({ message: 'Account synced', sync });
  } catch (error) {
    next(error);
  }
});

export default router;
