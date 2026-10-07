import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { decryptSecret, encryptSecret } from './instagram/auth.service';
import { readLimitedBody, safeGet } from '../utils/safe-fetch';

const prisma = new PrismaClient();

export const X_API = 'https://api.x.com';
export const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
// offline.access returns a refresh token so scheduled posts keep working after the 2h access token expires.
export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];
export const X_TEXT_LIMIT = 280;
export const X_MAX_IMAGES = 4;

// Never answer 401 for X problems: the web app treats 401 as "InstaCommand session expired" and signs the user out.
export const isXConfigured = () => Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET);
const requireConfig = () => {
  if (!isXConfigured()) throw new AppError('X_OAUTH_NOT_CONFIGURED', 503);
  return { clientId: env.X_CLIENT_ID!, clientSecret: env.X_CLIENT_SECRET!, redirectUri: env.X_REDIRECT_URI };
};

const base64url = (buffer: Buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Authorization URL with PKCE. The code_verifier travels inside the signed
 * state, encrypted, so only this server can use it; the state expires in 10 minutes.
 */
export function createXAuthorization(userId: string) {
  const { clientId, redirectUri } = requireConfig();
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = jwt.sign({ sub: userId, purpose: 'x', v: encryptSecret(verifier), nonce: crypto.randomUUID() }, env.JWT_SECRET, { expiresIn: '10m' });
  const url = new URL(X_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: X_SCOPES.join(' '),
    state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  return { url: url.toString() };
}

export function readXState(state: unknown): { userId: string; verifier: string } | null {
  if (typeof state !== 'string' || !state) return null;
  try {
    const payload = jwt.verify(state, env.JWT_SECRET) as { sub?: string; purpose?: string; v?: string };
    if (payload.purpose !== 'x' || !payload.sub || !payload.v) return null;
    return { userId: payload.sub, verifier: decryptSecret(payload.v) };
  } catch { return null; }
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireConfig();
  const response = await fetch(`${X_API}/2/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
    body: new URLSearchParams({ ...body, client_id: clientId }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({})) as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new AppError(data.error_description || 'O X recusou a autorização. Tente conectar novamente.', 400);
  return data;
}

/** Friendly message for X API errors (credits, permissions, limits). */
export function describeXError(status: number, body: any): string {
  const detail = body?.detail || body?.title || body?.errors?.[0]?.message || body?.error_description || '';
  if (status === 402 || /credit|payment|spend/i.test(detail)) return 'A conta de desenvolvedor do X está sem créditos ou atingiu o limite de gasto. Adicione créditos no Developer Console do X.';
  if (status === 401) return 'A conexão com o X expirou ou foi revogada. Conecte a conta novamente.';
  if (status === 403) return detail ? `O X recusou a ação: ${detail}` : 'O X recusou a ação. Verifique as permissões (leitura e escrita) do app.';
  if (status === 429) return 'O X limitou temporariamente as requisições. Tente novamente em alguns minutos.';
  return detail ? `X: ${detail}` : `O X respondeu com erro (HTTP ${status}).`;
}

export async function xRequest<T = any>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${X_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(60_000),
  });
  if (response.status === 204) return {} as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new AppError(describeXError(response.status, data), response.status >= 500 ? 502 : 400);
    (error as AppError & { xStatus?: number }).xStatus = response.status;
    throw error;
  }
  return data as T;
}

type XProfile = { id: string; username: string; name?: string; profile_image_url?: string; public_metrics?: { followers_count?: number } };

export async function handleXCallback(code: string, state: unknown) {
  const parsed = readXState(state);
  if (!parsed) throw new AppError('A autorização do X expirou. Tente conectar novamente.', 400);
  const { redirectUri } = requireConfig();
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: parsed.verifier });
  const me = await xRequest<{ data: XProfile }>('/2/users/me?user.fields=profile_image_url,public_metrics,name,username', tokens.access_token);
  const profile = me.data;
  const existing = await prisma.xAccount.findUnique({ where: { xUserId: profile.id } });
  if (existing && existing.userId !== parsed.userId && existing.isActive) throw new AppError('X_ACCOUNT_CONFLICT', 409);
  if (existing && existing.userId !== parsed.userId) {
    // The previous owner disconnected: nothing of theirs (scheduled posts, stored metrics,
    // automations) may move to the new workspace or be published with the new tokens.
    await prisma.scheduledPost.updateMany({ where: { xAccountId: existing.id }, data: { xAccountId: null } });
    await prisma.xAccount.delete({ where: { id: existing.id } });
  }
  const data = {
    userId: parsed.userId, username: profile.username, name: profile.name || null, profilePicUrl: profile.profile_image_url || null,
    followersCount: profile.public_metrics?.followers_count ?? null,
    accessToken: encryptSecret(tokens.access_token), refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null, scopes: tokens.scope || null,
    isActive: true, lastSyncAt: new Date(),
  };
  const account = await prisma.xAccount.upsert({ where: { xUserId: profile.id }, update: data, create: { ...data, xUserId: profile.id } });
  return { userId: parsed.userId, account };
}

const refreshing = new Map<string, Promise<string>>();

/** A token that cannot be decrypted (corrupted, wrong key) means the user has to connect again. */
const readToken = (value: string) => {
  try { return decryptSecret(value); } catch { throw new AppError('A conexão com o X precisa ser refeita. Conecte a conta novamente em Contas.', 400); }
};

/** Valid access token for an account, refreshing (and rotating the refresh token) when it is about to expire. */
export async function getXAccessToken(accountId: string): Promise<string> {
  const account = await prisma.xAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) throw new AppError('Conta do X não encontrada ou desconectada.', 404);
  const expiresSoon = account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < 120_000;
  if (!expiresSoon) return readToken(account.accessToken);
  if (!account.refreshToken) throw new AppError('A conexão com o X expirou. Conecte a conta novamente.', 400);
  // One refresh at a time per account: X rotates refresh tokens, a second call would use a spent one.
  const pending = refreshing.get(accountId);
  if (pending) return pending;
  const run = (async () => {
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: readToken(account.refreshToken!) });
    await prisma.xAccount.update({ where: { id: accountId }, data: {
      accessToken: encryptSecret(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : account.refreshToken,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    } });
    return tokens.access_token;
  })().finally(() => refreshing.delete(accountId));
  refreshing.set(accountId, run);
  return run;
}

export const getConnectedXAccounts = (userId: string) => prisma.xAccount.findMany({
  where: { userId, isActive: true }, orderBy: { connectedAt: 'asc' },
  select: { id: true, xUserId: true, username: true, name: true, profilePicUrl: true, followersCount: true, connectedAt: true, lastSyncAt: true, tokenExpiresAt: true },
});

export async function disconnectXAccount(accountId: string, userId: string) {
  const account = await prisma.xAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return false;
  // Best effort: tell X to revoke the token; the local record is removed either way.
  try {
    const { clientId, clientSecret } = requireConfig();
    await fetch(`${X_API}/2/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
      body: new URLSearchParams({ token: decryptSecret(account.accessToken), token_type_hint: 'access_token', client_id: clientId }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* ignore */ }
  // Every post of this connection loses it, scheduled ones included: they must never be
  // published later through a reconnection by someone else.
  await prisma.scheduledPost.updateMany({ where: { xAccountId: accountId }, data: { xAccountId: null } });
  await prisma.xAccount.update({ where: { id: accountId }, data: { isActive: false, accessToken: encryptSecret('revoked'), refreshToken: null } });
  return true;
}

const isVideoUrl = (url: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(url);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const CHUNK = 4 * 1024 * 1024;

async function download(url: string, maxBytes: number) {
  const { response, abort } = await safeGet(url, { timeoutMs: 60_000 });
  try {
    if ((response.statusCode || 500) >= 400) throw new AppError('Não foi possível ler a mídia da publicação.', 400);
    return { body: await readLimitedBody(response, maxBytes), type: String(response.headers['content-type'] || '').split(';')[0] };
  } finally { abort(); }
}

/** Uploads one image or video and returns the media id to attach to the post. */
export async function uploadXMedia(url: string, token: string): Promise<string> {
  const video = isVideoUrl(url);
  const { body, type } = await download(url, video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
  if (!video) {
    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(body)], { type: type || "image/jpeg" }));
    form.append('media_category', 'tweet_image');
    const result = await xRequest<{ data: { id: string } }>('/2/media/upload', token, { method: 'POST', body: form });
    return result.data.id;
  }
  const init = await xRequest<{ data: { id: string } }>('/2/media/upload/initialize', token, {
    method: 'POST', body: JSON.stringify({ media_type: type && type.startsWith('video/') ? type : 'video/mp4', total_bytes: body.length, media_category: 'tweet_video' }),
  });
  const id = init.data.id;
  for (let offset = 0, segment = 0; offset < body.length; offset += CHUNK, segment++) {
    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(body.subarray(offset, offset + CHUNK))]));
    form.append('segment_index', String(segment));
    await xRequest(`/2/media/upload/${id}/append`, token, { method: 'POST', body: form });
  }
  let info = (await xRequest<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>(`/2/media/upload/${id}/finalize`, token, { method: 'POST' })).data.processing_info;
  // Videos are processed asynchronously; wait until X says they can be attached.
  for (let attempt = 0; info && info.state !== 'succeeded' && attempt < 60; attempt++) {
    if (info.state === 'failed') throw new AppError('O X não conseguiu processar o vídeo. Verifique formato e duração.', 400);
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, info?.check_after_secs || 3) * 1000));
    info = (await xRequest<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>(`/2/media/upload?command=STATUS&media_id=${encodeURIComponent(id)}`, token)).data.processing_info;
  }
  if (info && info.state !== 'succeeded') throw new AppError('O processamento do vídeo no X demorou demais. Tente novamente.', 504);
  return id;
}

/** Publishes a scheduled post on X and returns the new post id. */
export async function publishXPost(post: { caption?: string | null; mediaUrls?: string[]; mediaType: string }, accountId: string) {
  const text = (post.caption || '').trim();
  const { xTextLength } = require('./post-readiness') as typeof import('./post-readiness');
  if (xTextLength(text) > X_TEXT_LIMIT) throw new AppError(`O texto passa de ${X_TEXT_LIMIT} caracteres no X (links contam 23 e emojis contam 2).`, 400);
  const token = await getXAccessToken(accountId);
  const urls = (post.mediaUrls || []).slice(0, X_MAX_IMAGES);
  const hasVideo = urls.some(isVideoUrl);
  const mediaIds: string[] = [];
  for (const url of hasVideo ? urls.filter(isVideoUrl).slice(0, 1) : urls) mediaIds.push(await uploadXMedia(url, token));
  if (!text && !mediaIds.length) throw new AppError('Publicação vazia para o X.', 400);
  const result = await xRequest<{ data: { id: string } }>('/2/tweets', token, {
    method: 'POST', body: JSON.stringify({ ...(text ? { text } : {}), ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
  });
  return result.data.id;
}

export async function deleteXPost(postId: string, accountId: string) {
  const token = await getXAccessToken(accountId);
  await xRequest(`/2/tweets/${encodeURIComponent(postId)}`, token, { method: 'DELETE' });
}
