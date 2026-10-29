import { getPrisma } from '../lib/prisma';
import { linkAfterConnect } from './workspace-links';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { AppError, ValidationError } from '../utils/errors';
import { decryptSecret, encryptSecret } from './instagram/auth.service';
import { readLimitedBody, safeGet } from '../utils/safe-fetch';
import { consumeOAuthNonce } from '../utils/oauth-nonce';
import { normalizeMediaUrl } from '../utils/public-media';
import { TIKTOK_CAPTION_LIMIT, validateTikTokSettings, type TikTokPrivacy } from './tiktok-settings';

// TikTok Login Kit (web) and the Content Posting API (Direct Post), for the signed-in user.

const prisma = getPrisma();

export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_API = 'https://open.tiktokapis.com/v2';
/** Profile, stats and video list for reports; video.publish for Direct Post. */
export const TIKTOK_SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.publish'];

export const isTikTokConfigured = () => Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);

const requireConfig = () => {
  if (!isTikTokConfigured()) throw new AppError('TIKTOK_OAUTH_NOT_CONFIGURED', 503);
  return { clientKey: env.TIKTOK_CLIENT_KEY!, clientSecret: env.TIKTOK_CLIENT_SECRET!, redirectUri: env.TIKTOK_REDIRECT_URI };
};

/** TikTok authorization URL. The signed state carries the user and the company and expires in 10 minutes. */
export function createTikTokAuthorization(userId: string, workspaceAccountId?: string | null) {
  const { clientKey, redirectUri } = requireConfig();
  const state = jwt.sign({ sub: userId, purpose: 'tiktok', nonce: crypto.randomUUID(), ws: workspaceAccountId || undefined }, env.JWT_SECRET, { expiresIn: '10m' });
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.search = new URLSearchParams({ client_key: clientKey, scope: TIKTOK_SCOPES.join(','), response_type: 'code', redirect_uri: redirectUri, state }).toString();
  return { url: url.toString() };
}

export function readTikTokState(state: unknown): { userId: string; workspaceAccountId: string | null } | null {
  if (typeof state !== 'string' || !state) return null;
  try {
    const payload = jwt.verify(state, env.JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string; purpose?: string; ws?: string };
    if (payload.purpose !== 'tiktok' || !payload.sub) return null;
    return { userId: payload.sub, workspaceAccountId: payload.ws || null };
  } catch { return null; }
}

const TIKTOK_ERRORS: Record<string, string> = {
  access_token_invalid: 'A conexão com o TikTok expirou ou foi revogada. Conecte o perfil novamente em Contas.',
  scope_not_authorized: 'O TikTok não recebeu todas as permissões. Conecte o perfil de novo em Contas e aceite todas.',
  rate_limit_exceeded: 'O TikTok limitou as requisições por alguns minutos. Tente novamente em instantes.',
  spam_risk_too_many_posts: 'O TikTok atingiu o limite diário de publicações deste perfil. Tente amanhã.',
  spam_risk_user_banned_from_posting: 'O TikTok bloqueou novas publicações deste perfil. Confira o aplicativo do TikTok.',
  reached_active_user_cap: 'O app atingiu o limite diário de perfis que publicam pela API do TikTok. Tente mais tarde.',
  unaudited_client_can_only_post_to_private_accounts: 'Enquanto o app não passa pela auditoria do TikTok, só dá para publicar com o perfil do TikTok em modo privado e a privacidade "Só eu". Deixe o perfil privado no app do TikTok e tente de novo.',
  privacy_level_option_mismatch: 'A privacidade escolhida não está disponível para este perfil do TikTok. Escolha outra opção.',
  url_ownership_unverified: 'O TikTok recusou o endereço da mídia.',
};

/** User-facing message for a TikTok API error; never a 401, which would sign the user out of UX Code Social. */
export function describeTikTokError(status: number, body: any) {
  const code = String(body?.error?.code || body?.error || '');
  if (TIKTOK_ERRORS[code]) return TIKTOK_ERRORS[code];
  const message = String(body?.error?.message || body?.error_description || '');
  if (status === 401) return TIKTOK_ERRORS.access_token_invalid;
  if (status === 429) return TIKTOK_ERRORS.rate_limit_exceeded;
  return message ? `TikTok: ${message}` : `O TikTok respondeu com erro (HTTP ${status}).`;
}

const tiktokError = (status: number, body: unknown) => new AppError(describeTikTokError(status, body), status >= 500 ? 502 : 400);

/** JSON call to the TikTok API; TikTok reports errors in `error.code` even with HTTP 200. */
export async function tiktokRequest<T = any>(path: string, token: string, init: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${TIKTOK_API}${path}`);
  for (const [key, value] of Object.entries(init.query || {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({})) as { error?: { code?: string } };
  if (!response.ok || (data.error?.code && data.error.code !== 'ok')) throw tiktokError(response.status, data);
  return data as T;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientKey, clientSecret } = requireConfig();
  const response = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, ...body }).toString(), signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({})) as TokenResponse & { error?: string };
  if (!response.ok || !data.access_token) throw tiktokError(response.status, data);
  return data;
}

type TikTokUser = { open_id?: string; avatar_url?: string; display_name?: string; username?: string; follower_count?: number; following_count?: number; likes_count?: number; video_count?: number };
export const USER_FIELDS = 'open_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count';

const profileFields = (user: TikTokUser) => ({
  username: user.username || null, displayName: user.display_name || user.username || 'Perfil do TikTok', avatarUrl: user.avatar_url || null,
  followerCount: user.follower_count ?? null, followingCount: user.following_count ?? null, likesCount: user.likes_count ?? null, videoCount: user.video_count ?? null,
});

export async function handleTikTokCallback(code: string, state: unknown) {
  const parsed = readTikTokState(state);
  if (!parsed) throw new AppError('A autorização do TikTok expirou. Tente conectar novamente.', 400);
  const claims = jwt.verify(String(state), env.JWT_SECRET, { algorithms: ['HS256'] }) as { nonce?: string; exp?: number };
  if (!await consumeOAuthNonce(claims, 'tiktok')) throw new AppError('A autorização do TikTok já foi utilizada ou expirou. Conecte novamente.', 400);
  const { redirectUri } = requireConfig();
  const tokens = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  const granted = (tokens.scope || '').split(',');
  if (!granted.includes('video.publish')) throw new AppError('TIKTOK_PUBLISH_NOT_GRANTED', 400);
  const me = await tiktokRequest<{ data?: { user?: TikTokUser } }>('/user/info/', tokens.access_token, { query: { fields: USER_FIELDS } });
  const openId = me.data?.user?.open_id || tokens.open_id;
  if (!openId) throw new AppError('O TikTok não informou o perfil conectado.', 502);
  const existing = await prisma.tikTokAccount.findUnique({ where: { openId } });
  if (existing && existing.userId !== parsed.userId && existing.isActive) throw new AppError('TIKTOK_ACCOUNT_CONFLICT', 409);
  if (existing && existing.userId !== parsed.userId) {
    // The previous owner disconnected: none of their scheduled posts may be published with the new tokens.
    await prisma.scheduledPost.updateMany({ where: { tiktokAccountId: existing.id }, data: { tiktokAccountId: null } });
    await prisma.tikTokAccount.delete({ where: { id: existing.id } });
  }
  const data = {
    userId: parsed.userId, ...profileFields(me.data?.user || {}),
    accessToken: encryptSecret(tokens.access_token), refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    refreshExpiresAt: tokens.refresh_expires_in ? new Date(Date.now() + tokens.refresh_expires_in * 1000) : null,
    scopes: tokens.scope || null, isActive: true, lastSyncAt: new Date(),
  };
  const account = await prisma.tikTokAccount.upsert({ where: { openId }, update: data, create: { ...data, openId } });
  await linkAfterConnect('TIKTOK', account.id, parsed.userId, parsed.workspaceAccountId);
  return { userId: parsed.userId, account };
}

const refreshing = new Map<string, Promise<string>>();
const readToken = (value: string) => {
  try { return decryptSecret(value); } catch { throw new AppError('A conexão com o TikTok precisa ser refeita. Conecte o perfil novamente em Contas.', 400); }
};

/** Valid access token, refreshed when about to expire (TikTok access tokens last 24 hours). */
export async function getTikTokAccessToken(accountId: string): Promise<string> {
  const account = await prisma.tikTokAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) throw new AppError('Perfil do TikTok não encontrado ou desconectado.', 404);
  const expiresSoon = !account.tokenExpiresAt || account.tokenExpiresAt.getTime() - Date.now() < 5 * 60_000;
  if (!expiresSoon) return readToken(account.accessToken);
  if (!account.refreshToken) throw new AppError('A conexão com o TikTok expirou. Conecte o perfil novamente em Contas.', 400);
  const pending = refreshing.get(accountId);
  if (pending) return pending;
  const run = (async () => {
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: readToken(account.refreshToken!) });
    await prisma.tikTokAccount.update({ where: { id: accountId }, data: {
      accessToken: encryptSecret(tokens.access_token),
      ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}),
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      ...(tokens.refresh_expires_in ? { refreshExpiresAt: new Date(Date.now() + tokens.refresh_expires_in * 1000) } : {}),
    } });
    return tokens.access_token;
  })().finally(() => refreshing.delete(accountId));
  refreshing.set(accountId, run);
  return run;
}

export const getConnectedTikTokAccounts = (userId: string) => prisma.tikTokAccount.findMany({
  where: { userId, isActive: true }, orderBy: { connectedAt: 'asc' },
  select: { id: true, openId: true, username: true, displayName: true, avatarUrl: true, followerCount: true, videoCount: true, connectedAt: true, lastSyncAt: true, workspaceAccountId: true },
});

export async function disconnectTikTokAccount(accountId: string, userId: string) {
  const account = await prisma.tikTokAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return false;
  try {
    const { clientKey, clientSecret } = requireConfig();
    await fetch(`${TIKTOK_API}/oauth/revoke/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token: decryptSecret(account.accessToken) }).toString(), signal: AbortSignal.timeout(10_000) });
  } catch { /* ignore: the local record is cleared either way */ }
  await prisma.scheduledPost.updateMany({ where: { tiktokAccountId: accountId }, data: { tiktokAccountId: null } });
  await prisma.tikTokAccount.update({ where: { id: accountId }, data: { isActive: false, accessToken: encryptSecret('revoked'), refreshToken: null } });
  return true;
}

export type TikTokCreatorInfo = {
  nickname: string; username: string | null; avatarUrl: string | null; privacyLevelOptions: TikTokPrivacy[];
  commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxVideoPostDurationSec: number | null; canPost: boolean;
};

/** What this creator can post right now; TikTok requires reading it every time the post screen opens. */
export async function getTikTokCreatorInfo(accountId: string): Promise<TikTokCreatorInfo> {
  const token = await getTikTokAccessToken(accountId);
  try {
    const result = await tiktokRequest<{ data?: { creator_nickname?: string; creator_username?: string; creator_avatar_url?: string; privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean; max_video_post_duration_sec?: number } }>('/post/publish/creator_info/query/', token, { method: 'POST', body: {} });
    const data = result.data || {};
    return {
      nickname: data.creator_nickname || data.creator_username || 'Perfil do TikTok', username: data.creator_username || null, avatarUrl: data.creator_avatar_url || null,
      privacyLevelOptions: (data.privacy_level_options || []).filter((option): option is TikTokPrivacy => ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(option)),
      commentDisabled: data.comment_disabled === true, duetDisabled: data.duet_disabled === true, stitchDisabled: data.stitch_disabled === true,
      maxVideoPostDurationSec: typeof data.max_video_post_duration_sec === 'number' ? data.max_video_post_duration_sec : null, canPost: true,
    };
  } catch (error) {
    // TikTok answers spam_risk_* here when the creator cannot post right now.
    if (error instanceof AppError && /limite diário|bloqueou novas publicações/.test(error.message)) {
      return { nickname: 'Perfil do TikTok', username: null, avatarUrl: null, privacyLevelOptions: [], commentDisabled: true, duetDisabled: true, stitchDisabled: true, maxVideoPostDurationSec: null, canPost: false };
    }
    throw error;
  }
}

const MAX_VIDEO_BYTES = 256 * 1024 * 1024;
const MIN_CHUNK = 5 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;

/** TikTok's FILE_UPLOAD rules: chunks of 5–64 MB, the last one takes the remainder; small files go whole. */
export function tiktokChunkPlan(size: number) {
  if (size <= MIN_CHUNK) return { chunkSize: size, totalChunks: 1 };
  const totalChunks = Math.max(1, Math.floor(size / CHUNK));
  return { chunkSize: CHUNK, totalChunks };
}

export type TikTokPublishResult = { publishId: string; postId: string | null; status: string; url: string | null; warnings: string[] };

/**
 * Sends the post's video to TikTok with Direct Post (FILE_UPLOAD in chunks) and waits a little for
 * TikTok to finish processing. The caption is the post text; privacy and options come from the composer.
 */
export async function publishTikTokVideo(post: { caption?: string | null; mediaUrls?: string[]; mediaType: string; tiktokSettings?: unknown }, accountId: string): Promise<TikTokPublishResult> {
  const settings = validateTikTokSettings(post.tiktokSettings, { requireComplete: true })!;
  const videoUrl = post.mediaUrls?.[0];
  if (post.mediaType !== 'REEL' || !videoUrl) throw new ValidationError('O TikTok publica vídeo nesta integração. Use o formato Vídeo com um arquivo de vídeo.');
  const caption = (post.caption || '').trim();
  if (caption.length > TIKTOK_CAPTION_LIMIT) throw new ValidationError(`A legenda do TikTok pode ter até ${TIKTOK_CAPTION_LIMIT} caracteres.`);
  const creator = await getTikTokCreatorInfo(accountId);
  if (!creator.canPost) throw new ValidationError('O TikTok não permite novas publicações deste perfil agora. Tente mais tarde.');
  if (!creator.privacyLevelOptions.includes(settings.privacyLevel!)) throw new ValidationError(TIKTOK_ERRORS.privacy_level_option_mismatch);
  const token = await getTikTokAccessToken(accountId);
  const { response, abort } = await safeGet(normalizeMediaUrl(videoUrl), { timeoutMs: 120_000 });
  let body: Buffer, type: string;
  try {
    if ((response.statusCode || 500) >= 400) throw new AppError('Não foi possível ler o vídeo da publicação.', 400);
    body = await readLimitedBody(response, MAX_VIDEO_BYTES);
    type = String(response.headers['content-type'] || '').split(';')[0];
  } finally { abort(); }
  const contentType = ['video/mp4', 'video/quicktime', 'video/webm'].includes(type) ? type : 'video/mp4';
  const { chunkSize, totalChunks } = tiktokChunkPlan(body.length);
  const init = await tiktokRequest<{ data?: { publish_id?: string; upload_url?: string } }>('/post/publish/video/init/', token, { method: 'POST', body: {
    post_info: {
      title: caption, privacy_level: settings.privacyLevel,
      disable_comment: creator.commentDisabled || !settings.allowComment,
      disable_duet: creator.duetDisabled || !settings.allowDuet,
      disable_stitch: creator.stitchDisabled || !settings.allowStitch,
      brand_content_toggle: settings.commercialContent && settings.brandedContent,
      brand_organic_toggle: settings.commercialContent && settings.yourBrand,
      is_aigc: settings.aiGenerated,
    },
    source_info: { source: 'FILE_UPLOAD', video_size: body.length, chunk_size: chunkSize, total_chunk_count: totalChunks },
  } });
  const publishId = init.data?.publish_id, uploadUrl = init.data?.upload_url;
  if (!publishId || !uploadUrl) throw new AppError('O TikTok não abriu o envio do vídeo. Nada foi publicado.', 502);
  for (let index = 0; index < totalChunks; index++) {
    const start = index * chunkSize;
    const end = index === totalChunks - 1 ? body.length : start + chunkSize;
    const part = body.subarray(start, end);
    const upload = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType, 'Content-Length': String(part.length), 'Content-Range': `bytes ${start}-${end - 1}/${body.length}` }, body: new Uint8Array(part), signal: AbortSignal.timeout(10 * 60_000) });
    if (!upload.ok) throw new AppError(`O TikTok recusou o envio do vídeo (parte ${index + 1} de ${totalChunks}, HTTP ${upload.status}).`, 502);
  }
  const status = await waitForTikTokPublish(token, publishId);
  const warnings: string[] = [];
  if (status.status !== 'PUBLISH_COMPLETE') warnings.push('O TikTok ainda está processando o vídeo. Ele pode levar alguns minutos para aparecer no perfil.');
  if (settings.privacyLevel === 'SELF_ONLY') warnings.push('Publicado como "Só eu": o vídeo fica visível apenas para o dono do perfil no TikTok.');
  const postId = status.postId;
  return { publishId, postId, status: status.status, url: postId && creator.username ? `https://www.tiktok.com/@${creator.username}/video/${postId}` : null, warnings };
}

/** Polls the publish status for up to ~90 seconds; FAILED becomes an error with TikTok's reason. */
export async function waitForTikTokPublish(token: string, publishId: string, attempts = 18, delayMs = 5000) {
  let last = 'PROCESSING_UPLOAD';
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await tiktokRequest<{ data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> } }>('/post/publish/status/fetch/', token, { method: 'POST', body: { publish_id: publishId } });
    last = result.data?.status || last;
    if (last === 'FAILED') throw new AppError(`O TikTok não publicou o vídeo${result.data?.fail_reason ? `: ${result.data.fail_reason}` : ''}.`, 400);
    if (last === 'PUBLISH_COMPLETE') return { status: last, postId: result.data?.publicaly_available_post_id?.[0] != null ? String(result.data.publicaly_available_post_id[0]) : null };
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { status: last, postId: null };
}
