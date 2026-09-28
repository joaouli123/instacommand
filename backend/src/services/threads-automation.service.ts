import { accountScope, automationDb as prisma, automationPermissions, ownedAutomationAccount, permissionCapabilities, threadsAutomationRequest } from './automation-platform';
import { getDecryptedThreadsToken } from './instagram/auth.service';
import { processInstagramAutomationEvent, type InstagramAutomationEvent } from './automation.service';
import { withConversationLock } from './automation-lock';
import { ValidationError } from '../utils/errors';

// Official collection: fbsamples/threads_api/postman/threads-api.postman_collection.json.
// Public replies only. A reply container must subsequently be published.
// This bounded polling collector never scrapes profiles or initiates private messages.
export function threadsReplyEvents(replies: any[], accountId: string, username: string, rootId: string, since: number): InstagramAutomationEvent[] {
  return replies.filter(reply => reply?.id && reply.is_reply === true && reply.is_reply_owned_by_me === false &&
    typeof reply.username === 'string' && reply.username.toLowerCase() !== username.toLowerCase() && typeof reply.text === 'string' &&
    reply.root_post?.id === rootId && Number.isFinite(Date.parse(reply.timestamp)) && Date.parse(reply.timestamp) >= since && Date.parse(reply.timestamp) <= Date.now() + 60_000)
    .map(reply => ({ platform: 'THREADS', accountIgId: accountId, eventKey: `threads:${accountId}:reply:${reply.id}`,
      type: 'COMMENT_ANY', senderId: reply.username.toLowerCase(), senderUsername: reply.username, text: reply.text,
      mediaId: rootId, commentId: String(reply.id), timestamp: Date.parse(reply.timestamp) }));
}

export async function syncThreadsAutomation(userId: string, accountId: string) {
  const account = await ownedAutomationAccount(userId, accountId, 'THREADS');
  return withConversationLock(`threads-collection:${accountId}`, async assertLease => {
    const rules = await prisma.socialAutomation.findMany({ where: { ...accountScope(accountId, 'THREADS'), enabled: true, enabledAt: { not: null } } });
    if (!rules.length) return { processed: 0, note: 'Nenhuma regra pública está ativa. Não buscamos nem respondemos a comentários antigos.' };
    const since = Math.min(...rules.map(rule => rule.enabledAt!.getTime()));
    try {
      if (!permissionCapabilities('THREADS', await automationPermissions(account)).canAutomateComments) throw new ValidationError('Reconecte o Threads autorizando leitura de respostas e publicação.');
      const token = await getDecryptedThreadsToken(accountId);
      const posts = await threadsAutomationRequest(`/${account.externalId}/threads`, token, {
        fields: 'id,username,is_reply,has_replies,timestamp', limit: '100', since: String(Math.floor((Date.now() - 30 * 86400_000) / 1000)),
      });
      if (!Array.isArray(posts.data)) throw new ValidationError('O Threads não retornou a lista de publicações.');
      const events: InstagramAutomationEvent[] = [];
      let partial = Boolean(posts.paging?.next);
      for (const post of posts.data) {
        if (!post.id || post.is_reply || post.has_replies === false || post.username?.toLowerCase() !== account.username.toLowerCase()) continue;
        let after: string | undefined;
        const seen = new Set<string>();
        for (let page = 0; page < 5; page++) {
          await assertLease();
          const result = await threadsAutomationRequest(`/${post.id}/conversation`, token, {
            fields: 'id,text,timestamp,username,is_reply,is_reply_owned_by_me,root_post,replied_to', reverse: 'true', limit: '100', ...(after ? { after } : {}),
          });
          if (!Array.isArray(result.data)) throw new ValidationError('O Threads não retornou a lista de respostas.');
          events.push(...threadsReplyEvents(result.data, account.externalId, account.username, String(post.id), since));
          if (result.data.some((reply: any) => Date.parse(reply.timestamp) < since)) break;
          const cursor = result.paging?.next ? result.paging?.cursors?.after : undefined;
          if (!cursor) break;
          if (seen.has(cursor) || page === 4) { partial = true; break; }
          seen.add(cursor); after = cursor;
        }
      }
      const ordered = [...new Map(events.map(event => [event.eventKey, event])).values()].sort((a, b) => a.timestamp! - b.timestamp!);
      for (const event of ordered) { await assertLease(); await processInstagramAutomationEvent(event); }
      await prisma.threadsAccount.update({ where: { id: accountId }, data: { automationSyncAt: new Date(), automationSyncError: partial ? 'Consulta parcial: limite de 100 publicações recentes ou 500 respostas por publicação atingido. Confira o restante no Threads.' : null } });
      return { processed: ordered.length, partial };
    } catch (error) {
      const message = error instanceof ValidationError ? error.message : 'Falha ao consultar o Threads. Confira a autorização e tente novamente mais tarde.';
      await prisma.threadsAccount.update({ where: { id: accountId }, data: { automationSyncError: message.slice(0, 500) } });
      throw new ValidationError(message);
    }
  });
}
