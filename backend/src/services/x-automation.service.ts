import { accountScope, automationDb as prisma, automationPermissions, ownedAutomationAccount, permissionCapabilities } from './automation-platform';
import { processInstagramAutomationEvent, type InstagramAutomationEvent } from './automation.service';
import { withConversationLock } from './automation-lock';
import { ValidationError } from '../utils/errors';

type RawMention = { id: string; text?: string; author_id?: string; created_at?: string; conversation_id?: string };
type RawUser = { id: string; username?: string };

/**
 * Mentions and replies to the account become public-comment automation events.
 * Own posts, posts older than the first active rule and unknown authors are ignored.
 */
export function xMentionEvents(mentions: RawMention[], users: RawUser[], account: { externalId: string; username: string }, since: number): InstagramAutomationEvent[] {
  const usernames = new Map(users.map((user) => [user.id, user.username || '']));
  return mentions.filter((mention) => mention?.id && mention.author_id && mention.author_id !== account.externalId
    && typeof mention.text === 'string' && Number.isFinite(Date.parse(mention.created_at || ''))
    && Date.parse(mention.created_at!) >= since && Date.parse(mention.created_at!) <= Date.now() + 60_000)
    .map((mention) => ({
      platform: 'X', accountIgId: account.externalId, eventKey: `x:${account.externalId}:mention:${mention.id}`,
      type: 'COMMENT_ANY', senderId: mention.author_id!, senderUsername: usernames.get(mention.author_id!) || undefined,
      // The mention text starts with the @handles being replied to; keep only what the person wrote.
      text: mention.text!.replace(/^(@\w+\s+)+/, '').trim() || mention.text!,
      mediaId: mention.conversation_id || mention.id, commentId: String(mention.id), timestamp: Date.parse(mention.created_at!),
    }));
}

/**
 * Reads new mentions of an X account (only those after the last one already
 * read, so each check only pays for new items) and runs the automation rules.
 */
export async function syncXAutomation(userId: string, accountId: string) {
  const account = await ownedAutomationAccount(userId, accountId, 'X');
  return withConversationLock(`x-collection:${accountId}`, async (assertLease) => {
    const rules = await prisma.socialAutomation.findMany({ where: { ...accountScope(accountId, 'X'), enabled: true, enabledAt: { not: null } } });
    if (!rules.length) return { processed: 0, note: 'Nenhuma regra ativa. Não buscamos nem respondemos a menções antigas.' };
    const since = Math.min(...rules.map((rule) => rule.enabledAt!.getTime()));
    try {
      if (!permissionCapabilities('X', await automationPermissions(account)).canAutomateComments) throw new ValidationError('Reconecte o X autorizando leitura e publicação de posts.');
      const { getXAccessToken, xRequest } = require('./x.service') as typeof import('./x.service');
      const token = await getXAccessToken(accountId);
      const stored = await prisma.xAccount.findUnique({ where: { id: accountId }, select: { automationSinceId: true } });
      const events: InstagramAutomationEvent[] = [];
      let newest = stored?.automationSinceId || undefined;
      let next: string | undefined;
      let partial = false;
      for (let page = 0; page < 3; page++) {
        await assertLease();
        const params = new URLSearchParams({
          max_results: '100', 'tweet.fields': 'created_at,author_id,conversation_id', expansions: 'author_id', 'user.fields': 'username',
          ...(stored?.automationSinceId ? { since_id: stored.automationSinceId } : { start_time: new Date(since).toISOString() }),
        });
        if (next) params.set('pagination_token', next);
        const result = await xRequest<{ data?: RawMention[]; includes?: { users?: RawUser[] }; meta?: { newest_id?: string; next_token?: string } }>(`/2/users/${encodeURIComponent(account.externalId)}/mentions?${params}`, token);
        if (page === 0 && result.meta?.newest_id) newest = result.meta.newest_id;
        events.push(...xMentionEvents(result.data || [], result.includes?.users || [], account, since));
        next = result.meta?.next_token;
        if (!next) break;
        if (page === 2) partial = true;
      }
      const ordered = [...new Map(events.map((event) => [event.eventKey, event])).values()].sort((a, b) => a.timestamp! - b.timestamp!);
      for (const event of ordered) { await assertLease(); await processInstagramAutomationEvent(event); }
      await prisma.xAccount.update({ where: { id: accountId }, data: {
        automationSinceId: newest ?? null, automationSyncAt: new Date(),
        automationSyncError: partial ? 'Muitas menções de uma vez: respondemos as 300 mais recentes. Confira o restante no X.' : null,
      } });
      return { processed: ordered.length, partial };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Falha ao consultar o X. Tente novamente mais tarde.';
      await prisma.xAccount.update({ where: { id: accountId }, data: { automationSyncError: message.slice(0, 500) } });
      throw new ValidationError(message);
    }
  });
}
