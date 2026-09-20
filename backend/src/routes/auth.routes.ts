import { Router } from 'express';
import { getOAuthUrl, handleOAuthCallback, getThreadsOAuthUrl, handleThreadsOAuthCallback } from '../services/instagram/auth.service';
import { authenticate, verifyAuthToken } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { randomUUID } from 'node:crypto';

const router = Router();
const prisma = new PrismaClient();

type OAuthPurpose = 'meta' | 'threads';

const normalizeEmail = (email: unknown) => String(email || '').trim().toLowerCase();

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE === 'true',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const issueSession = (res: any, user: { id: string; email: string }) => {
  const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('instacommand_token', token, sessionCookieOptions);
  return token;
};

const loginUrl = (next = '/accounts') => {
  const base = `${env.FRONTEND_URL.replace(/\/$/, '')}/login`;
  return `${base}?next=${encodeURIComponent(next)}`;
};

const getAuthenticatedUser = async (req: any) => {
  const payload = verifyAuthToken(req);
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.id } });
};

const createOAuthState = (userId: string, purpose: OAuthPurpose) => jwt.sign(
  { sub: userId, purpose, nonce: randomUUID() },
  env.JWT_SECRET,
  { expiresIn: '10m' },
);

const getOAuthUserId = (value: unknown, purpose: OAuthPurpose) => {
  if (typeof value !== 'string' || !value) return null;
  try {
    const payload = jwt.verify(value, env.JWT_SECRET) as { sub?: string; purpose?: OAuthPurpose };
    return payload.purpose === purpose && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
};

const getPublicUser = (user: { id: string; email: string; name: string; avatarUrl: string | null }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
});

// Public account creation for the future SaaS onboarding flow.
router.post('/register', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
    }
    if (name.length < 2) {
      return res.status(400).json({ error: 'Informe seu nome.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: await bcrypt.hash(password, 12),
      },
    });
    const token = issueSession(res, user);

    return res.status(201).json({
      message: 'Conta criada com sucesso',
      token,
      user: getPublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

// Normal email/password login. No default user or fallback password is accepted.
router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

    if (!user?.password || !password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const token = issueSession(res, user);
    return res.json({
      message: 'Login realizado com sucesso',
      token,
      user: getPublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

// Start Meta Login for the currently authenticated SaaS user.
router.get('/facebook', async (req: any, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.redirect(loginUrl('/accounts'));

    const state = createOAuthState(user.id, 'meta');
    const url = await getOAuthUrl(user.id, state);
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
});

// Meta callback: the signed state decides which user receives the connection.
router.get('/facebook/callback', async (req, res) => {
  const stateUserId = getOAuthUserId(req.query.state, 'meta');
  if (!stateUserId) return res.redirect(`${loginUrl('/accounts')}&reason=oauth_state`);

  try {
    const { code, error } = req.query;
    if (error) {
      return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=meta_denied`);
    }
    if (!code || typeof code !== 'string') {
      return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=meta_code`);
    }

    const user = await prisma.user.findUnique({ where: { id: stateUserId } });
    if (!user) return res.redirect(loginUrl('/accounts'));

    const accounts = await handleOAuthCallback(code, user.id);
    issueSession(res, user);
    const destination = accounts.length > 0
      ? `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=1`
      : `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=no_professional_instagram`;
    return res.redirect(destination);
  } catch (error) {
    console.error('Meta OAuth callback failed:', error);
    return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=meta_connection`);
  }
});

// Start Threads Login for the currently authenticated SaaS user.
router.get('/threads', async (req: any, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.redirect(loginUrl('/accounts'));

    const state = createOAuthState(user.id, 'threads');
    const url = await getThreadsOAuthUrl(user.id, state);
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
});

router.get('/threads/callback', async (req, res) => {
  const stateUserId = getOAuthUserId(req.query.state, 'threads');
  if (!stateUserId) return res.redirect(`${loginUrl('/accounts')}&reason=oauth_state`);

  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?threads_connected=0`);
    }

    const user = await prisma.user.findUnique({ where: { id: stateUserId } });
    if (!user) return res.redirect(loginUrl('/accounts'));

    await handleThreadsOAuthCallback(code, user.id);
    issueSession(res, user);
    return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?threads_connected=1`);
  } catch (error) {
    console.error('Threads OAuth callback failed:', error);
    return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?threads_connected=0`);
  }
});

// Meta calls these endpoints when a user removes the app or requests data deletion.
async function removeThreadsConnection(threadsUserId: string | undefined) {
  if (!threadsUserId) return;
  const accounts = await prisma.threadsAccount.findMany({
    where: { threadsUserId },
    select: { id: true },
  });
  const accountIds = accounts.map((account) => account.id);
  if (!accountIds.length) return;

  await prisma.$transaction([
    prisma.scheduledPost.updateMany({
      where: { threadsAccountId: { in: accountIds } },
      data: { threadsAccountId: null },
    }),
    prisma.threadsAccount.deleteMany({ where: { id: { in: accountIds } } }),
  ]);
}

router.post('/threads/uninstall', async (req, res) => {
  try {
    await removeThreadsConnection(String(req.body?.user_id || req.query.user_id || '') || undefined);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Threads uninstall callback failed:', error);
    return res.status(500).send('Unable to process uninstall callback');
  }
});

router.post('/threads/delete', async (req, res) => {
  try {
    await removeThreadsConnection(String(req.body?.user_id || req.query.user_id || '') || undefined);
    return res.status(200).json({
      url: `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts`,
      confirmation_code: randomUUID(),
    });
  } catch (error) {
    console.error('Threads data deletion callback failed:', error);
    return res.status(500).json({ error: 'Unable to process data deletion request' });
  }
});

router.post('/logout', authenticate, (req, res) => {
  res.clearCookie('instacommand_token');
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
