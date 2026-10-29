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
import { validateYouTubeSettings, type YouTubeSettings } from './youtube-settings';

const prisma = getPrisma();

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
// Upload, read the channel and its analytics, and answer or moderate comments. Managing or
// deleting videos would need the broader `youtube` scope, which makes verification much heavier.
/** Read-only YouTube Analytics: daily views, watch time, subscribers, traffic and audience for reports. */
export const YOUTUBE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
/** Replying to and moderating comments (Community and automations). */
export const YOUTUBE_COMMENTS_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', YOUTUBE_ANALYTICS_SCOPE, YOUTUBE_COMMENTS_SCOPE];
export const hasYouTubeScope = (scopes: string | null | undefined, scope: string) => (scopes || '').split(/\s+/).includes(scope);

// Never answer 401 for YouTube problems: the web app treats 401 as "UX Code Social session expired" and signs the user out.
export const isYouTubeConfigured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const requireConfig = () => {
  if (!isYouTubeConfigured()) throw new AppError('YOUTUBE_OAUTH_NOT_CONFIGURED', 503);
  return { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri: env.YOUTUBE_REDIRECT_URI };
};

const base64url = (buffer: Buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Google authorization URL with PKCE and offline access. The code_verifier
 * travels inside the signed state, encrypted; the state expires in 10 minutes.
 */
export function createYouTubeAuthorization(userId: string, workspaceAccountId?: string | null) {
  const { clientId, redirectUri } = requireConfig();
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = jwt.sign({ sub: userId, purpose: 'youtube', v: encryptSecret(verifier), nonce: crypto.randomUUID(), ws: workspaceAccountId || undefined }, env.JWT_SECRET, { expiresIn: '10m' });
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: YOUTUBE_SCOPES.join(' '),
    state, code_challenge: challenge, code_challenge_method: 'S256',
    // offline + consent: Google only returns a refresh token on consent, and scheduled posts need one.
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  }).toString();
  return { url: url.toString() };
}

export function readYouTubeState(state: unknown): { userId: string; verifier: string; workspaceAccountId: string | null } | null {
  if (typeof state !== 'string' || !state) return null;
  try {
    const payload = jwt.verify(state, env.JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string; purpose?: string; v?: string; ws?: string };
    if (payload.purpose !== 'youtube' || !payload.sub || !payload.v) return null;
    return { userId: payload.sub, verifier: decryptSecret(payload.v), workspaceAccountId: payload.ws || null };
  } catch { return null; }
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({})) as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    if (data.error === 'invalid_grant') throw new AppError('A conexão com o YouTube expirou ou foi revogada. Conecte o canal novamente em Contas.', 400);
    throw new AppError(data.error_description || 'O Google recusou a autorização. Tente conectar novamente.', 400);
  }
  return data;
}

/** Friendly message for YouTube API errors (quota, upload limits, permissions). */
export function describeYouTubeError(status: number, body: any): string {
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
  const detail = body?.error?.message || '';
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(reason)) return 'A cota diária da API do YouTube acabou. Ela volta à meia-noite do horário do Pacífico; tente depois ou peça aumento de cota no Google Cloud.';
  if (/uploadLimitExceeded/i.test(reason)) return 'O canal atingiu o limite de envios do YouTube por hoje. Tente novamente amanhã.';
  if (/youtubeSignupRequired|channelNotFound/i.test(reason)) return 'Esta conta Google ainda não tem um canal do YouTube. Crie o canal e conecte novamente.';
  if (/invalidTitle/i.test(reason)) return 'O YouTube recusou o título. Use até 100 caracteres, sem < ou >.';
  if (/invalidDescription/i.test(reason)) return 'O YouTube recusou a descrição. Use até 5.000 caracteres, sem < ou >.';
  if (status === 401) return 'A conexão com o YouTube expirou ou foi revogada. Conecte o canal novamente em Contas.';
  if (status === 403) return detail ? `O YouTube recusou a ação: ${detail}` : 'O YouTube recusou a ação. Confira as permissões concedidas ao conectar o canal.';
  if (status === 429) return 'O YouTube limitou temporariamente as requisições. Tente novamente em alguns minutos.';
  return detail ? `YouTube: ${detail}` : `O YouTube respondeu com erro (HTTP ${status}).`;
}

const youtubeError = (status: number, body: unknown) => {
  const error = new AppError(describeYouTubeError(status, body), status >= 500 ? 502 : 400);
  (error as AppError & { youtubeStatus?: number }).youtubeStatus = status;
  return error;
};

export async function youtubeRequest<T = any>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(60_000),
  });
  if (response.status === 204) return {} as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw youtubeError(response.status, data);
  return data as T;
}

type YouTubeChannel = {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
};

const channelThumbnail = (channel: YouTubeChannel) => channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null;

export async function handleYouTubeCallback(code: string, state: unknown) {
  const parsed = readYouTubeState(state);
  if (!parsed) throw new AppError('A autorização do YouTube expirou. Tente conectar novamente.', 400);
  const claims = jwt.verify(String(state), env.JWT_SECRET, { algorithms: ['HS256'] }) as { nonce?: string; exp?: number };
  if (!await consumeOAuthNonce(claims, 'youtube')) throw new AppError('A autorização do YouTube já foi utilizada ou expirou. Conecte novamente.', 400);
  const { redirectUri } = requireConfig();
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: parsed.verifier });
  const granted = (tokens.scope || '').split(' ');
  if (!granted.includes(YOUTUBE_SCOPES[0])) throw new AppError('YOUTUBE_UPLOAD_NOT_GRANTED', 400);
  const list = await youtubeRequest<{ items?: YouTubeChannel[] }>(`${YOUTUBE_API}/channels?part=snippet,statistics&mine=true`, tokens.access_token);
  const channel = list.items?.[0];
  if (!channel) throw new AppError('YOUTUBE_NO_CHANNEL', 400);
  const existing = await prisma.youTubeAccount.findUnique({ where: { channelId: channel.id } });
  if (existing && existing.userId !== parsed.userId && existing.isActive) throw new AppError('YOUTUBE_ACCOUNT_CONFLICT', 409);
  if (existing && existing.userId !== parsed.userId) {
    // The previous owner disconnected: none of their scheduled posts may be published with the new tokens.
    await prisma.scheduledPost.updateMany({ where: { youtubeAccountId: existing.id }, data: { youtubeAccountId: null } });
    await prisma.youTubeAccount.delete({ where: { id: existing.id } });
  }
  const subscribers = channel.statistics?.hiddenSubscriberCount ? null : Number(channel.statistics?.subscriberCount);
  const data = {
    userId: parsed.userId, title: channel.snippet?.title || 'Canal do YouTube', handle: channel.snippet?.customUrl || null,
    thumbnailUrl: channelThumbnail(channel), subscriberCount: Number.isFinite(subscribers) ? subscribers : null,
    accessToken: encryptSecret(tokens.access_token),
    // Google omits the refresh token when the user had already consented; keep the stored one then.
    ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}),
    tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null, scopes: tokens.scope || null,
    isActive: true, lastSyncAt: new Date(),
  };
  const account = await prisma.youTubeAccount.upsert({ where: { channelId: channel.id }, update: data, create: { ...data, channelId: channel.id } });
  await linkAfterConnect('YOUTUBE', account.id, parsed.userId, parsed.workspaceAccountId);
  return { userId: parsed.userId, account };
}

const refreshing = new Map<string, Promise<string>>();

/** A token that cannot be decrypted (corrupted, wrong key) means the user has to connect again. */
const readToken = (value: string) => {
  try { return decryptSecret(value); } catch { throw new AppError('A conexão com o YouTube precisa ser refeita. Conecte o canal novamente em Contas.', 400); }
};

/** Valid access token for a channel, refreshing it when it is about to expire (Google tokens last 1 hour). */
export async function getYouTubeAccessToken(accountId: string): Promise<string> {
  const account = await prisma.youTubeAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) throw new AppError('Canal do YouTube não encontrado ou desconectado.', 404);
  const expiresSoon = !account.tokenExpiresAt || account.tokenExpiresAt.getTime() - Date.now() < 120_000;
  if (!expiresSoon) return readToken(account.accessToken);
  if (!account.refreshToken) throw new AppError('A conexão com o YouTube expirou. Conecte o canal novamente em Contas.', 400);
  const pending = refreshing.get(accountId);
  if (pending) return pending;
  const run = (async () => {
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: readToken(account.refreshToken!) });
    await prisma.youTubeAccount.update({ where: { id: accountId }, data: {
      accessToken: encryptSecret(tokens.access_token),
      ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}),
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    } });
    return tokens.access_token;
  })().finally(() => refreshing.delete(accountId));
  refreshing.set(accountId, run);
  return run;
}

export const getConnectedYouTubeAccounts = (userId: string) => prisma.youTubeAccount.findMany({
  where: { userId, isActive: true }, orderBy: { connectedAt: 'asc' },
  select: { id: true, channelId: true, title: true, handle: true, thumbnailUrl: true, subscriberCount: true, connectedAt: true, lastSyncAt: true, workspaceAccountId: true },
});

export async function disconnectYouTubeAccount(accountId: string, userId: string) {
  const account = await prisma.youTubeAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return false;
  // Best effort: revoking the refresh token also ends the access token; the local record is cleared either way.
  try {
    const token = account.refreshToken ? decryptSecret(account.refreshToken) : decryptSecret(account.accessToken);
    await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* ignore */ }
  // Scheduled posts lose the channel: they must never be published later through someone else's reconnection.
  await prisma.scheduledPost.updateMany({ where: { youtubeAccountId: accountId }, data: { youtubeAccountId: null } });
  await prisma.youTubeAccount.update({ where: { id: accountId }, data: { isActive: false, accessToken: encryptSecret('revoked'), refreshToken: null } });
  return true;
}

const MAX_VIDEO_BYTES = 256 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

async function download(url: string, maxBytes: number) {
  const { response, abort } = await safeGet(url, { timeoutMs: 120_000 });
  try {
    if ((response.statusCode || 500) >= 400) throw new AppError('Não foi possível ler a mídia da publicação.', 400);
    return { body: await readLimitedBody(response, maxBytes), type: String(response.headers['content-type'] || '').split(';')[0] };
  } finally { abort(); }
}

/** Snippet and status sent to YouTube. The description is the post caption. */
export function buildYouTubeMetadata(settings: YouTubeSettings, caption?: string | null) {
  return {
    snippet: {
      title: settings.title,
      description: (caption || '').trim(),
      categoryId: settings.categoryId,
      ...(settings.tags.length ? { tags: settings.tags } : {}),
      ...(settings.defaultLanguage ? { defaultLanguage: settings.defaultLanguage } : {}),
      ...(settings.defaultAudioLanguage ? { defaultAudioLanguage: settings.defaultAudioLanguage } : {}),
    },
    status: {
      privacyStatus: settings.privacyStatus,
      selfDeclaredMadeForKids: settings.madeForKids === true,
      containsSyntheticMedia: settings.alteredContent,
      embeddable: settings.embeddable,
      publicStatsViewable: settings.publicStatsViewable,
      license: settings.license,
    },
    ...(settings.recordingDate ? { recordingDetails: { recordingDate: `${settings.recordingDate}T00:00:00Z` } } : {}),
  };
}

/** Parts of the video resource the upload writes; recordingDetails only when a date was chosen. */
export const youtubeUploadParts = (settings: YouTubeSettings) => ['snippet', 'status', ...(settings.recordingDate ? ['recordingDetails'] : [])].join(',');

/**
 * Deletes a video of the channel for good. Needs the comment/manage permission (youtube.force-ssl);
 * channels connected before it must reconnect. A video already gone counts as deleted.
 */
export async function deleteYouTubeVideo(accountId: string, videoId: string) {
  if (!/^[\w-]{6,20}$/.test(videoId)) throw new ValidationError('Vídeo do YouTube inválido.');
  const account = await prisma.youTubeAccount.findUnique({ where: { id: accountId }, select: { scopes: true } });
  if (!hasYouTubeScope(account?.scopes, YOUTUBE_COMMENTS_SCOPE)) throw new ValidationError('Reconecte o canal do YouTube em Contas e aceite todas as permissões para apagar vídeos por aqui.');
  const token = await getYouTubeAccessToken(accountId);
  const response = await fetch(`${YOUTUBE_API}/videos?id=${encodeURIComponent(videoId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (response.ok || response.status === 404) return;
  throw youtubeError(response.status, await response.json().catch(() => ({})));
}

export type YouTubePlaylist = { id: string; title: string; privacyStatus: string; itemCount: number | null; thumbnailUrl: string | null };

/** The channel's own playlists, newest first (up to 200). */
export async function listYouTubePlaylists(accountId: string): Promise<YouTubePlaylist[]> {
  const token = await getYouTubeAccessToken(accountId);
  const playlists: YouTubePlaylist[] = [];
  let pageToken = '';
  for (let page = 0; page < 4; page++) {
    const result = await youtubeRequest<{ items?: Array<{ id: string; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }; status?: { privacyStatus?: string }; contentDetails?: { itemCount?: number } }>; nextPageToken?: string }>(
      `${YOUTUBE_API}/playlists?${new URLSearchParams({ part: 'snippet,status,contentDetails', mine: 'true', maxResults: '50', ...(pageToken ? { pageToken } : {}) })}`, token);
    for (const item of result.items || []) {
      playlists.push({ id: item.id, title: item.snippet?.title || 'Playlist sem nome', privacyStatus: item.status?.privacyStatus || 'public',
        itemCount: typeof item.contentDetails?.itemCount === 'number' ? item.contentDetails.itemCount : null,
        thumbnailUrl: item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.medium?.url || null });
    }
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }
  return playlists;
}

/**
 * Puts a just-published video in the chosen playlists (creating the new one first). Never fails the
 * publication: every playlist that could not receive the video becomes a warning.
 */
async function addToPlaylists(accountId: string, token: string, videoId: string, settings: YouTubeSettings) {
  const account = await prisma.youTubeAccount.findUnique({ where: { id: accountId }, select: { scopes: true } });
  if (!hasYouTubeScope(account?.scopes, YOUTUBE_COMMENTS_SCOPE)) {
    return ['O vídeo foi publicado, mas não entrou nas playlists: reconecte o canal do YouTube em Contas e aceite todas as permissões.'];
  }
  const warnings: string[] = [];
  const targets = [...settings.playlistIds];
  if (settings.newPlaylist) {
    try {
      const created = await youtubeRequest<{ id?: string }>(`${YOUTUBE_API}/playlists?part=snippet,status`, token, { method: 'POST', body: JSON.stringify({ snippet: { title: settings.newPlaylist.title }, status: { privacyStatus: settings.newPlaylist.privacyStatus } }) });
      if (created.id) targets.push(created.id);
    } catch (error) {
      warnings.push(`O vídeo foi publicado, mas a playlist "${settings.newPlaylist.title}" não foi criada: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }
  for (const playlistId of targets) {
    try {
      await youtubeRequest(`${YOUTUBE_API}/playlistItems?part=snippet`, token, { method: 'POST', body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }) });
    } catch (error) {
      warnings.push(`O vídeo foi publicado, mas não entrou em uma das playlists: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }
  return warnings;
}

export type YouTubePublishResult = { id: string; url: string; privacyStatus?: string; warnings: string[] };

/**
 * Uploads the post's video with a resumable session and returns the new video.
 * The custom thumbnail is optional: when YouTube refuses it (unverified channel),
 * the video stays published and the reason becomes a warning.
 */
export async function publishYouTubeVideo(
  post: { caption?: string | null; mediaUrls?: string[]; mediaType: string; youtubeSettings?: unknown },
  accountId: string,
): Promise<YouTubePublishResult> {
  const settings = validateYouTubeSettings(post.youtubeSettings, { requireComplete: true });
  if (!settings) throw new AppError('Preencha o título do vídeo para o YouTube.', 400);
  const videoUrl = post.mediaUrls?.[0];
  if (post.mediaType !== 'REEL' || !videoUrl) throw new AppError('O YouTube aceita apenas vídeo. Escolha o formato Vídeo/Reel com um arquivo de vídeo.', 400);
  const token = await getYouTubeAccessToken(accountId);
  const { body, type } = await download(normalizeMediaUrl(videoUrl), MAX_VIDEO_BYTES);
  const contentType = type.startsWith('video/') ? type : 'video/mp4';

  const query = new URLSearchParams({ uploadType: 'resumable', part: youtubeUploadParts(settings), notifySubscribers: String(settings.notifySubscribers) });
  const session = await fetch(`${YOUTUBE_UPLOAD_API}/videos?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(body.length), 'X-Upload-Content-Type': contentType,
    },
    body: JSON.stringify(buildYouTubeMetadata(settings, post.caption)),
    signal: AbortSignal.timeout(30_000),
  });
  const location = session.headers.get('location');
  if (!session.ok || !location) throw youtubeError(session.status, await session.json().catch(() => ({})));

  const upload = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15 * 60_000),
  });
  const video = await upload.json().catch(() => ({})) as { id?: string; status?: { privacyStatus?: string; uploadStatus?: string } };
  if (!upload.ok || !video.id) throw youtubeError(upload.status, video);

  const warnings: string[] = [];
  // Projects that have not passed YouTube's API audit have every upload locked as private.
  if (video.status?.privacyStatus && video.status.privacyStatus !== settings.privacyStatus) {
    warnings.push('O YouTube manteve o vídeo como privado: o app ainda não passou pela auditoria da API do YouTube. Altere a visibilidade no YouTube Studio.');
  }
  // The YouTube API does not set custom thumbnails on Shorts: they use a frame chosen in the app.
  if (settings.thumbnailUrl && settings.format === 'video') {
    try {
      const image = await download(normalizeMediaUrl(settings.thumbnailUrl), MAX_THUMBNAIL_BYTES);
      await youtubeRequest(`${YOUTUBE_UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(video.id)}`, token, {
        method: 'POST', headers: { 'Content-Type': /^image\/(png|jpeg)$/.test(image.type) ? image.type : 'image/jpeg' }, body: new Uint8Array(image.body),
      });
    } catch (error) {
      warnings.push(`O vídeo foi publicado, mas a miniatura não foi aplicada: ${error instanceof Error ? error.message : 'erro desconhecido'} (miniaturas exigem canal verificado por telefone).`);
    }
  }
  if (settings.playlistIds.length || settings.newPlaylist) warnings.push(...await addToPlaylists(accountId, token, video.id, settings));
  const url = settings.format === 'short' ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}`;
  return { id: video.id, url, privacyStatus: video.status?.privacyStatus, warnings };
}
