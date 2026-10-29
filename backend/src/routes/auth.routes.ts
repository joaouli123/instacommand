import { getPrisma } from '../lib/prisma';
import { Router } from 'express';
import { getOAuthUrl, handleOAuthCallback, getThreadsOAuthUrl, handleThreadsOAuthCallback } from '../services/instagram/auth.service';
import { authenticate, verifyAuthToken, getBearerOrCookieToken } from '../middleware/auth';

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { createHash, randomUUID } from 'node:crypto';
import { rateLimit } from '../middleware/rateLimit';
import { verifyMetaSignedRequest } from '../utils/meta-signed-request';
import { consumeOAuthNonce } from '../utils/oauth-nonce';
import { z } from 'zod';
import { isSessionRevoked, revokeSession } from '../utils/session-security';
import { syncAccountsInBackground } from '../services/account-sync.service';
import { createXAuthorization, handleXCallback, readXState } from '../services/x.service';
import { createYouTubeAuthorization, handleYouTubeCallback, readYouTubeState } from '../services/youtube.service';
import { autoLinkThreadsAccounts, linkAfterConnect, ownedWorkspaceId } from '../services/workspace-links';

const router = Router();
const prisma = getPrisma();

type OAuthPurpose = 'meta' | 'threads';

type OAuthSessionHandoff = {
  sub?: string;
  purpose?: 'oauth_session';
  nonce?: string;
  exp?: number;
  binding?: string;
};

const normalizeEmail = (email: unknown) => String(email || '').trim().toLowerCase();

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SECURE === 'true',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const issueSession = (res: any, user: { id: string; email: string }) => {
  const token = jwt.sign({ id: user.id, email: user.email, jti: randomUUID() }, env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('instacommand_token', token, sessionCookieOptions);
  return token;
};

// CLI integrations keep their explicit token response; browser sessions are cookie-only.
const browserSafeToken = (req: any, token: string) => req.get('origin') || req.get('sec-fetch-site') ? undefined : token;

// The browser uses a same-origin HttpOnly facade. Handoffs may renew an
// existing matching workspace, never sign a stranger into the link owner's account.
const sessionBinding = (token: string) => createHash('sha256').update(token).digest('hex');
const createOAuthSessionHandoff = (userId: string, binding: string) => jwt.sign(
  { sub: userId, purpose: 'oauth_session', nonce: randomUUID(), binding },
  env.JWT_SECRET,
  { expiresIn: '2m' },
);

const getOAuthSessionUser = async (value: unknown, currentUserId: string, currentToken: string) => {
  if (typeof value !== 'string' || !value) return null;
  try {
    const payload = jwt.verify(value, env.JWT_SECRET, { algorithms: ['HS256'] }) as OAuthSessionHandoff;
    if (payload.purpose !== 'oauth_session' || !payload.sub || payload.sub !== currentUserId) return null;
    if (!payload.binding || payload.binding !== sessionBinding(currentToken)) return null;
    if (!await consumeOAuthNonce(payload, 'oauth_session')) return null;
    return prisma.user.findUnique({ where: { id: payload.sub } });
  } catch {
    return null;
  }
};

const loginUrl = (next = '/accounts') => {
  const base = `${env.FRONTEND_URL.replace(/\/$/, '')}/login`;
  return `${base}?next=${encodeURIComponent(next)}`;
};

const getAuthenticatedUser = async (req: any) => {
  const payload = verifyAuthToken(req);
  if (!payload) return null;
  if (await isSessionRevoked(getBearerOrCookieToken(req)!)) return null;
  return prisma.user.findUnique({ where: { id: payload.id } });
};

const createOAuthState = (userId: string, purpose: OAuthPurpose, token: string, workspaceAccountId?: string | null) => jwt.sign(
  { sub: userId, purpose, nonce: randomUUID(), binding: sessionBinding(token), ws: workspaceAccountId || undefined },
  env.JWT_SECRET,
  { expiresIn: '10m' },
);

const getOAuthState = async (value: unknown, purpose: OAuthPurpose) => {
  if (typeof value !== 'string' || !value) return null;
  try {
    const payload = jwt.verify(value, env.JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string; purpose?: OAuthPurpose; nonce?: string; exp?: number; binding?: string; ws?: string };
    if (payload.purpose !== purpose || !payload.sub || !payload.binding || !/^[a-f0-9]{64}$/.test(payload.binding)) return null;
    return await consumeOAuthNonce(payload, purpose) ? { userId: payload.sub, binding: payload.binding, workspaceAccountId: payload.ws || null } : null;
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
const loginLimit = rateLimit({ name: 'login', windowMs: 15 * 60_000, max: 25, byAddressOnly: true, shared: env.NODE_ENV === 'production' });
const registrationLimit = rateLimit({ name: 'registration', windowMs: 60 * 60_000, max: 10, byAddressOnly: true, shared: env.NODE_ENV === 'production' });
const credentialsSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'A senha pode ter até 72 bytes.') });
const registrationSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(120), password: credentialsSchema.shape.password.refine((value) => value.length >= 10, 'Use pelo menos 10 caracteres.') });

router.post('/register', registrationLimit, async (req, res, next) => {
  try {
    const input = registrationSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const password = input.password;
    const name = input.name;

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
      token: browserSafeToken(req, token),
      user: getPublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

// Normal email/password login. No default user or fallback password is accepted.
router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const input = credentialsSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const password = input.password;
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

    if (!user?.password || !password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const token = issueSession(res, user);
    return res.json({
      message: 'Login realizado com sucesso',
      token: browserSafeToken(req, token),
      user: getPublicUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

// Start Meta Login for the currently authenticated SaaS user.
router.get('/facebook/url', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: 'Sessão inválida.' });

    const state = createOAuthState(user.id, 'meta', getBearerOrCookieToken(req)!);
    return res.json({ url: await getOAuthUrl(user.id, state) });
  } catch (error) {
    return next(error);
  }
});

router.get('/facebook', async (req: any, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.redirect(loginUrl('/accounts'));

    const state = createOAuthState(user.id, 'meta', getBearerOrCookieToken(req)!);
    const url = await getOAuthUrl(user.id, state);
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
});

// Meta callback: the signed state decides which user receives the connection.
router.get('/facebook/callback', async (req, res) => {
  const state = await getOAuthState(req.query.state, 'meta');
  if (!state) return res.redirect(`${loginUrl('/accounts')}&reason=oauth_state`);

  try {
    const { code, error } = req.query;
    if (error) {
      return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=meta_denied`);
    }
    if (!code || typeof code !== 'string') {
      return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=meta_code`);
    }

    const user = await prisma.user.findUnique({ where: { id: state.userId } });
    if (!user) return res.redirect(loginUrl('/accounts'));

    const accounts = await handleOAuthCallback(code, user.id);
    // Import profile, posts and metrics now instead of waiting for the
    // scheduled collector; the redirect does not wait for it.
    syncAccountsInBackground(accounts.filter((account: any) => account.isActive).map((account: any) => account.id));
    const oauthSession = createOAuthSessionHandoff(user.id, state.binding);
    const destination = accounts.length > 0
      ? `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=${accounts.some((account: any) => account.selectionPending) ? 'pending' : '1'}&oauth_session=${encodeURIComponent(oauthSession)}`
      : `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=no_professional_instagram&oauth_session=${encodeURIComponent(oauthSession)}`;
    return res.redirect(destination);
  } catch (error) {
    console.error('Meta OAuth callback failed'); // provider errors may contain credentials
    const reason = error instanceof Error && error.message === 'META_ACCOUNT_WORKSPACE_CONFLICT'
      ? 'account_workspace_conflict'
      : 'meta_connection';
    return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?connected=0&reason=${reason}`);
  }
});

// Start Threads Login for the currently authenticated SaaS user.
router.get('/threads/url', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: 'Sessão inválida.' });

    const state = createOAuthState(user.id, 'threads', getBearerOrCookieToken(req)!, await ownedWorkspaceId(user.id, req.query.workspace));
    return res.json({ url: await getThreadsOAuthUrl(user.id, state, req.query.automations === '1') });
  } catch (error) {
    return next(error);
  }
});

router.get('/threads', async (req: any, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.redirect(loginUrl('/accounts'));

    const state = createOAuthState(user.id, 'threads', getBearerOrCookieToken(req)!, await ownedWorkspaceId(user.id, req.query.workspace));
    const url = await getThreadsOAuthUrl(user.id, state, req.query.automations === '1');
    return res.redirect(url);
  } catch (error) {
    return next(error);
  }
});

router.get('/threads/callback', async (req, res) => {
  const state = await getOAuthState(req.query.state, 'threads');
  if (!state) return res.redirect(`${loginUrl('/accounts')}&reason=oauth_state`);

  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      const reason = req.query.error ? 'threads_denied' : 'threads_callback_missing_code';
      return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?threads_connected=0&reason=${reason}`);
    }

    const user = await prisma.user.findUnique({ where: { id: state.userId } });
    if (!user) return res.redirect(loginUrl('/accounts'));

    const threadsAccount = await handleThreadsOAuthCallback(code, user.id);
    if (state.workspaceAccountId) await linkAfterConnect('THREADS', threadsAccount.id, user.id, state.workspaceAccountId);
    else await autoLinkThreadsAccounts(user.id);
    const oauthSession = createOAuthSessionHandoff(user.id, state.binding);
    return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?threads_connected=1&oauth_session=${encodeURIComponent(oauthSession)}`);
  } catch (error) {
    // Avoid logging provider payloads that may contain OAuth codes or tokens.
    console.error('Threads OAuth callback failed');
    const reason = error instanceof Error && error.message.includes('já está conectada')
      ? 'threads_account_conflict'
      : 'threads_connection';
    return res.redirect(`${env.FRONTEND_URL.replace(/\/$/, '')}/accounts?threads_connected=0&reason=${reason}`);
  }
});

// X (Twitter): OAuth 2.0 with PKCE for the signed-in user.
router.get('/x/url', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: 'Sessão inválida.' });
    return res.json(createXAuthorization(user.id, await ownedWorkspaceId(user.id, req.query.workspace)));
  } catch (error) {
    return next(error);
  }
});

router.get('/x/callback', async (req, res) => {
  const accounts = `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts`;
  const parsed = readXState(req.query.state);
  if (!parsed) return res.redirect(`${loginUrl('/accounts')}&reason=oauth_state`);
  const { code } = req.query;
  if (!code || typeof code !== 'string') return res.redirect(`${accounts}?x_connected=0&reason=${req.query.error ? 'x_denied' : 'x_callback_missing_code'}`);
  try {
    // No session handoff here: a link with someone else's code and state must not sign
    // the visitor into that workspace (login CSRF). The tab that started it is already signed in.
    await handleXCallback(code, req.query.state);
    return res.redirect(`${accounts}?x_connected=1`);
  } catch (error) {
    // Never log provider payloads: they may contain codes or tokens.
    console.error('X OAuth callback failed');
    const reason = error instanceof Error && error.message === 'X_ACCOUNT_CONFLICT' ? 'x_account_conflict' : 'x_connection';
    return res.redirect(`${accounts}?x_connected=0&reason=${reason}`);
  }
});

// YouTube: Google OAuth 2.0 with PKCE and offline access for the signed-in user.
router.get('/youtube/url', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: 'Sessão inválida.' });
    return res.json(createYouTubeAuthorization(user.id, await ownedWorkspaceId(user.id, req.query.workspace)));
  } catch (error) {
    return next(error);
  }
});

const YOUTUBE_FAILURE_REASONS: Record<string, string> = {
  YOUTUBE_ACCOUNT_CONFLICT: 'youtube_account_conflict',
  YOUTUBE_NO_CHANNEL: 'youtube_no_channel',
  YOUTUBE_UPLOAD_NOT_GRANTED: 'youtube_scope_missing',
};

router.get('/youtube/callback', async (req, res) => {
  const accounts = `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts`;
  const parsed = readYouTubeState(req.query.state);
  if (!parsed) return res.redirect(`${loginUrl('/accounts')}&reason=oauth_state`);
  const { code } = req.query;
  if (!code || typeof code !== 'string') return res.redirect(`${accounts}?youtube_connected=0&reason=${req.query.error ? 'youtube_denied' : 'youtube_callback_missing_code'}`);
  try {
    // Same as X: no session handoff, so a forwarded link cannot sign someone into this workspace.
    await handleYouTubeCallback(code, req.query.state);
    return res.redirect(`${accounts}?youtube_connected=1`);
  } catch (error) {
    // Never log provider payloads: they may contain codes or tokens.
    console.error('YouTube OAuth callback failed');
    const reason = (error instanceof Error && YOUTUBE_FAILURE_REASONS[error.message]) || 'youtube_connection';
    return res.redirect(`${accounts}?youtube_connected=0&reason=${reason}`);
  }
});

// A handoff is not a login credential. Require the existing matching session.
router.post('/oauth-session', authenticate, async (req: any, res, next) => {
  try {
    if (req.auth?.kind !== 'session') return res.status(403).json({ error: 'Use sua sessão do painel.' });
    const user = await getOAuthSessionUser(req.body?.token, req.user.id, getBearerOrCookieToken(req)!);
    if (!user) return res.status(401).json({ error: 'Sessão OAuth expirada ou inválida.' });

    const token = issueSession(res, user);
    return res.json({ token: browserSafeToken(req, token), user: getPublicUser(user) });
  } catch (error) {
    return next(error);
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
    const secret = env.THREADS_APP_SECRET || env.FB_APP_SECRET;
    if (!secret) return res.status(503).json({ error: 'Callback não configurado.' });
    const userId = verifyMetaSignedRequest(req.body?.signed_request, secret);
    if (!userId) return res.status(401).json({ error: 'Assinatura inválida.' });
    await removeThreadsConnection(userId);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Threads uninstall callback failed');
    return res.status(500).send('Unable to process uninstall callback');
  }
});

router.post('/threads/delete', async (req, res) => {
  try {
    const secret = env.THREADS_APP_SECRET || env.FB_APP_SECRET;
    if (!secret) return res.status(503).json({ error: 'Callback não configurado.' });
    const userId = verifyMetaSignedRequest(req.body?.signed_request, secret);
    if (!userId) return res.status(401).json({ error: 'Assinatura inválida.' });
    await removeThreadsConnection(userId);
    return res.status(200).json({
      url: `${env.FRONTEND_URL.replace(/\/$/, '')}/accounts`,
      confirmation_code: randomUUID(),
    });
  } catch (error) {
    console.error('Threads data deletion callback failed');
    return res.status(500).json({ error: 'Unable to process data deletion request' });
  }
});

router.post('/logout', authenticate, async (req: any, res, next) => {
  try {
    if (req.auth?.kind !== 'session') return res.status(403).json({ error: 'Use sua sessão do painel.' });
    await revokeSession(getBearerOrCookieToken(req)!);
    res.clearCookie('instacommand_token', { path: '/', httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' || env.COOKIE_SECURE === 'true' });
    res.json({ message: 'Logged out successfully' });
  } catch (error) { next(error); }
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
