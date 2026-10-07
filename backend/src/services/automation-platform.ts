import { AutomationPlatform, PrismaClient } from '@prisma/client';
import { getDecryptedThreadsToken, getDecryptedToken, getInstagramGrantedPermissions, getThreadsCredentials } from './instagram/auth.service';
import { verifyFacebookPageLink } from './instagram/facebook-link.service';
import { graphPost } from '../utils/instagram-api';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { setTimeout as delay } from 'node:timers/promises';

export const automationDb = new PrismaClient();
export type Platform = AutomationPlatform;
export type AutomationAccount = { id: string; userId: string; platform: Platform; externalId: string; username: string; pageId?: string; igUserId?: string };
/** Networks where automations only answer publicly and new items are collected by polling. */
export const isPublicReplyPlatform = (platform: Platform) => platform === 'THREADS' || platform === 'X';
/** Longest automatic reply each network accepts. */
export const replyLimit = (platform: Platform) => platform === 'X' ? 280 : platform === 'THREADS' ? 500 : 1000;

export const accountScope = (accountId: string, platform: Platform = 'INSTAGRAM') => ({
  platform, accountId: isPublicReplyPlatform(platform) ? null : accountId,
  threadsAccountId: platform === 'THREADS' ? accountId : null,
  xAccountId: platform === 'X' ? accountId : null,
});

export async function ownedAutomationAccount(userId: string, accountId: string, platform: Platform = 'INSTAGRAM'): Promise<AutomationAccount> {
  if (platform === 'X') {
    const account = await automationDb.xAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
    if (!account) throw new NotFoundError('Conta do X não encontrada.');
    return { id: account.id, userId, platform, externalId: account.xUserId, username: account.username };
  }
  if (platform === 'THREADS') {
    const account = await automationDb.threadsAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
    if (!account) throw new NotFoundError('Conta do Threads não encontrada.');
    return { id: account.id, userId, platform, externalId: account.threadsUserId, username: account.username };
  }
  const account = await automationDb.instagramAccount.findFirst({ where: { id: accountId, userId, isActive: true, selectionPending: false } });
  if (!account) throw new NotFoundError('Conta do Instagram não encontrada.');
  if (platform === 'FACEBOOK' && !account.pageId) throw new ValidationError('Esta conta não tem uma Página do Facebook vinculada.');
  return { id: account.id, userId, platform, externalId: platform === 'FACEBOOK' ? account.pageId : account.igUserId,
    username: platform === 'FACEBOOK' ? account.pageName || account.igUsername : account.igUsername, pageId: account.pageId, igUserId: account.igUserId };
}

// Only locally composed, non-sensitive diagnostics may be shown to the owner.
export class ThreadsAutomationError extends AppError {
  constructor(message: string) { super(message, 502); }
}

// No URL, token or provider response body is copied into diagnostics. In
// particular, an empty HTTP 500 must remain a failure, not an empty success.
export async function threadsAutomationRequest(path: string, token: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET') {
  if (!/^\/[A-Za-z0-9_/-]+$/.test(path)) throw new ValidationError('Caminho do Threads inválido.');
  const url = new URL(`https://graph.threads.net${path}`);
  const body = new URLSearchParams(params);
  if (method === 'GET') body.forEach((value, key) => url.searchParams.set(key, value));
  let response: Response;
  try {
    response = await fetch(url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? body : undefined, signal: AbortSignal.timeout(20_000), redirect: 'error' });
  } catch {
    throw new ThreadsAutomationError('O Threads não confirmou a operação por falha de conexão ou tempo esgotado. Confira a rede antes de reenviar; não repetimos o envio automaticamente.');
  }
  const result = await response.json().catch(() => null);
  const valid = result !== null && typeof result === 'object' && !Array.isArray(result);
  if (!response.ok || !valid || result.error) {
    const code = Number(result?.error?.code);
    throw new ThreadsAutomationError(`O Threads não concluiu a operação (HTTP ${response.status}${Number.isFinite(code) ? `, código ${code}` : ''})${!valid ? ': resposta vazia ou inválida' : ''}. Confira a conexão e as permissões. Nenhum envio será repetido automaticamente.`);
  }
  return result;
}

export async function waitForThreadsReplyContainer(containerId: string, token: string, assertCanSend: () => Promise<void> = async () => {}) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await assertCanSend();
    const result = await threadsAutomationRequest(`/${containerId}`, token, { fields: 'id,status' });
    if (result.status === 'FINISHED') return;
    // PUBLISHED is not a ready container: do not publish it for a second time.
    if (result.status !== 'IN_PROGRESS') throw new ThreadsAutomationError('O Threads não confirmou que a resposta está pronta para publicar. Confira a conversa antes de tentar novamente.');
    if (attempt < 11) await delay(2500);
  }
  throw new ThreadsAutomationError('O Threads ainda está preparando a resposta. Nenhuma publicação foi iniciada; confira a conversa antes de tentar novamente.');
}

export async function automationPermissions(account: AutomationAccount): Promise<string[]> {
  if (account.platform === 'X') {
    // Scopes granted on the X consent screen are stored with the connection.
    const stored = await automationDb.xAccount.findUnique({ where: { id: account.id }, select: { scopes: true } });
    return (stored?.scopes || '').split(/\s+/).filter(Boolean);
  }
  if (account.platform !== 'THREADS') return getInstagramGrantedPermissions(account.id);
  const token = await getDecryptedThreadsToken(account.id);
  const credentials = await getThreadsCredentials(account.userId);
  if (!credentials.appId || !credentials.appSecret) throw new ValidationError('Configure a conexão do Threads.');
  const app = await threadsAutomationRequest('/oauth/access_token', '', { grant_type: 'client_credentials', client_id: credentials.appId, client_secret: credentials.appSecret });
  if (typeof app.access_token !== 'string') throw new ValidationError('Não foi possível conferir as permissões do Threads.');
  const debug = await threadsAutomationRequest('/debug_token', app.access_token, { input_token: token });
  if (debug.data?.is_valid !== true) throw new ValidationError('A conexão do Threads expirou. Reconecte a conta.');
  return Array.isArray(debug.data.scopes) ? debug.data.scopes.filter((scope: unknown): scope is string => typeof scope === 'string') : [];
}

export const permissionCapabilities = (platform: Platform, scopes: string[]) => platform === 'X' ? ({
  canAutomateComments: ['tweet.read', 'tweet.write', 'users.read'].every(scope => scopes.includes(scope)),
  canAutomateMessages: false,
}) : ({
  canAutomateComments: platform === 'THREADS' ? ['threads_read_replies', 'threads_manage_replies', 'threads_content_publish'].every(scope => scopes.includes(scope))
    : platform === 'INSTAGRAM' && ['instagram_manage_comments', 'instagram_business_manage_comments'].some(scope => scopes.includes(scope)),
  canAutomateMessages: platform === 'THREADS' ? false : platform === 'FACEBOOK' ? scopes.includes('pages_messaging')
    : ['instagram_manage_messages', 'instagram_business_manage_messages'].some(scope => scopes.includes(scope)),
});

export async function sendAutomationResponse(account: AutomationAccount, target: { commentId?: string | null; senderId?: string | null }, text: string, assertCanSend: () => Promise<void> = async () => {}) {
  if (account.platform === 'X') {
    if (!target.commentId) throw new ValidationError('No X, a automação responde publicamente às menções.');
    if ([...text].length > 280) throw new ValidationError('A resposta no X deve ter até 280 caracteres.');
    // Loaded on demand so the other networks never depend on the X client.
    const { getXAccessToken, xRequest } = require('./x.service') as typeof import('./x.service');
    const token = await getXAccessToken(account.id);
    await assertCanSend();
    const result = await xRequest<{ data?: { id?: string } }>('/2/tweets', token, { method: 'POST', body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: target.commentId } }) });
    if (!result.data?.id) throw new AppError('O X não confirmou a resposta. Confira a conversa antes de tentar novamente.', 502);
    return String(result.data.id);
  }
  if (account.platform === 'THREADS') {
    if (!target.commentId) throw new ValidationError('Threads permite somente respostas públicas nesta integração.');
    if ([...text].length > 500) throw new ValidationError('A resposta pública do Threads deve ter até 500 caracteres.');
    const token = await getDecryptedThreadsToken(account.id);
    await assertCanSend();
    const container = await threadsAutomationRequest(`/${account.externalId}/threads`, token, { media_type: 'TEXT', text, reply_to_id: target.commentId }, 'POST');
    if (typeof container.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(container.id)) throw new ThreadsAutomationError('O Threads não confirmou a criação da resposta.');
    await waitForThreadsReplyContainer(container.id, token, assertCanSend);
    await assertCanSend();
    // Creating a container is NOT publishing. Never retry an ambiguous publish.
    const published = await threadsAutomationRequest(`/${account.externalId}/threads_publish`, token, { creation_id: String(container.id) }, 'POST');
    if (!published.id) throw new ThreadsAutomationError('O Threads não confirmou a publicação da resposta.');
    return String(published.id);
  }
  const token = await getDecryptedToken(account.id);
  let result;
  if (target.commentId) {
    if (account.platform !== 'INSTAGRAM') throw new ValidationError('Use o Messenger da Página para esta automação.');
    result = await graphPost(`/${target.commentId}/replies`, token, { message: text });
  } else {
    if (!target.senderId) throw new ValidationError('Destinatário não identificado.');
    const page = await verifyFacebookPageLink(account.pageId!, account.igUserId!, token);
    result = await graphPost(`/${page.id}/messages`, token, { recipient: { id: target.senderId }, message: { text }, messaging_type: 'RESPONSE' });
  }
  const id = result.message_id || result.id;
  if (!id) throw new AppError('A Meta não confirmou o envio. Confira a conversa antes de tentar novamente.', 502);
  return String(id);
}
