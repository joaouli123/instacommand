import { AutomationPlatform, PrismaClient } from '@prisma/client';
import { getDecryptedThreadsToken, getDecryptedToken, getInstagramGrantedPermissions, getThreadsCredentials } from './instagram/auth.service';
import { verifyFacebookPageLink } from './instagram/facebook-link.service';
import { graphPost } from '../utils/instagram-api';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';

export const automationDb = new PrismaClient();
export type Platform = AutomationPlatform;
export type AutomationAccount = { id: string; userId: string; platform: Platform; externalId: string; username: string; pageId?: string; igUserId?: string };
export const accountScope = (accountId: string, platform: Platform = 'INSTAGRAM') => ({
  platform, accountId: platform === 'THREADS' ? null : accountId,
  threadsAccountId: platform === 'THREADS' ? accountId : null,
});

export async function ownedAutomationAccount(userId: string, accountId: string, platform: Platform = 'INSTAGRAM'): Promise<AutomationAccount> {
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

// No URL, token or provider response body is copied into diagnostics.
export async function threadsAutomationRequest(path: string, token: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET') {
  if (!/^\/[A-Za-z0-9_/-]+$/.test(path)) throw new ValidationError('Caminho do Threads inválido.');
  const url = new URL(`https://graph.threads.net${path}`);
  const body = new URLSearchParams(params);
  if (method === 'GET') body.forEach((value, key) => url.searchParams.set(key, value));
  const response = await fetch(url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? body : undefined, signal: AbortSignal.timeout(20_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new AppError(`Threads não autorizou ou não concluiu a operação (HTTP ${response.status}, código ${Number(result.error?.code) || 0}). Confira a conexão e as permissões.`, 502);
  return result;
}

export async function automationPermissions(account: AutomationAccount): Promise<string[]> {
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

export const permissionCapabilities = (platform: Platform, scopes: string[]) => ({
  canAutomateComments: platform === 'THREADS' ? ['threads_read_replies', 'threads_content_publish'].every(scope => scopes.includes(scope))
    : platform === 'INSTAGRAM' && ['instagram_manage_comments', 'instagram_business_manage_comments'].some(scope => scopes.includes(scope)),
  canAutomateMessages: platform === 'THREADS' ? false : platform === 'FACEBOOK' ? scopes.includes('pages_messaging')
    : ['instagram_manage_messages', 'instagram_business_manage_messages'].some(scope => scopes.includes(scope)),
});

export async function sendAutomationResponse(account: AutomationAccount, target: { commentId?: string | null; senderId?: string | null }, text: string) {
  if (account.platform === 'THREADS') {
    if (!target.commentId) throw new ValidationError('Threads permite somente respostas públicas nesta integração.');
    if ([...text].length > 500) throw new ValidationError('A resposta pública do Threads deve ter até 500 caracteres.');
    const token = await getDecryptedThreadsToken(account.id);
    const container = await threadsAutomationRequest(`/${account.externalId}/threads`, token, { media_type: 'TEXT', text, reply_to_id: target.commentId }, 'POST');
    if (!container.id) throw new AppError('O Threads não confirmou a criação da resposta.', 502);
    // Creating a container is NOT publishing. Never retry an ambiguous publish.
    const published = await threadsAutomationRequest(`/${account.externalId}/threads_publish`, token, { creation_id: String(container.id) }, 'POST');
    if (!published.id) throw new AppError('O Threads não confirmou a publicação da resposta.', 502);
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
