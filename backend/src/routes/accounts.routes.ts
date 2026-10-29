import { getPrisma } from '../lib/prisma';
import { invalidateCached } from '../utils/ttl-cache';
import { Router } from 'express';
import { getConnectedAccounts, getPendingConnectedAccounts, selectConnectedAccounts, disconnectAccount, getConnectedThreadsAccounts, disconnectThreadsAccount } from '../services/instagram/auth.service';
import { isAccountSyncRunning, syncAccountOnce, syncAccountsInBackground } from '../services/account-sync.service';
import { authenticate } from '../middleware/auth';
import { disconnectXAccount, getConnectedXAccounts, isXConfigured } from '../services/x.service';
import { disconnectYouTubeAccount, getConnectedYouTubeAccounts, isYouTubeConfigured } from '../services/youtube.service';
import { autoLinkThreadsAccounts, linkNetworkAccount, type LinkedNetwork } from '../services/workspace-links';


const router = Router();
const prisma = getPrisma();

router.use(authenticate);

router.get('/', async (req: any, res, next) => {
  try {
    const accounts = await getConnectedAccounts(req.user.id);
    // `syncing` lets open tabs show progress and refresh when the first import ends.
    res.json(accounts.map((account) => ({ ...account, syncing: isAccountSyncRunning(account.id) })));
  } catch (error) {
    next(error);
  }
});

router.get('/threads', async (req: any, res, next) => {
  try {
    await autoLinkThreadsAccounts(req.user.id);
    const accounts = await getConnectedThreadsAccounts(req.user.id);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
});

router.get('/x', async (req: any, res, next) => {
  try {
    res.json({ configured: isXConfigured(), accounts: await getConnectedXAccounts(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.get('/youtube', async (req: any, res, next) => {
  try {
    res.json({ configured: isYouTubeConfigured(), accounts: await getConnectedYouTubeAccounts(req.user.id) });
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
    const accounts = await selectConnectedAccounts(req.user.id, accountIds);
    syncAccountsInBackground(accounts.filter((account) => accountIds.includes(account.id)).map((account) => account.id));
    res.json({ message: 'Contas selecionadas com sucesso', accounts });
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

// Moves a Threads, X or YouTube profile to a company (or unlinks it with null).
router.patch('/:network(threads|x|youtube)/:id/workspace', async (req: any, res, next) => {
  try {
    const network = String(req.params.network).toUpperCase() as LinkedNetwork;
    const value = req.body?.workspaceAccountId;
    if (value !== null && typeof value !== 'string') return res.status(400).json({ error: 'Informe a empresa.' });
    res.json(await linkNetworkAccount(network, req.params.id, req.user.id, value));
  } catch (error) {
    next(error);
  }
});

router.delete('/youtube/:id', async (req: any, res, next) => {
  try {
    if (!(await disconnectYouTubeAccount(req.params.id, req.user.id))) return res.status(404).json({ error: 'Canal do YouTube não encontrado.' });
    res.json({ message: 'Canal do YouTube desconectado' });
  } catch (error) {
    next(error);
  }
});

router.delete('/x/:id', async (req: any, res, next) => {
  try {
    if (!(await disconnectXAccount(req.params.id, req.user.id))) return res.status(404).json({ error: 'Conta do X não encontrada.' });
    res.json({ message: 'Conta do X desconectada' });
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

    const sync = await syncAccountOnce(account.id);
    // Fresh numbers were just imported; drop cached provider reports for this account.
    invalidateCached(account.id);
    res.json({ message: 'Account synced', sync });
  } catch (error) {
    next(error);
  }
});

export default router;
