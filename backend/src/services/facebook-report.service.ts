import { PrismaClient } from '@prisma/client';
import { getDecryptedToken } from './instagram/auth.service';
import { verifyFacebookPageLink } from './instagram/facebook-link.service';
import { graphGet } from '../utils/instagram-api';

const prisma = new PrismaClient();
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export async function getFacebookReport(userId: string, accountId: string, days: number) {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
    select: { id: true, igUserId: true, igUsername: true, pageId: true },
  });
  if (!account) return null;
  const token = await getDecryptedToken(account.id);
  const page = await verifyFacebookPageLink(account.pageId, account.igUserId, token);
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const issues: string[] = [];
  let profile: any = {};
  try { profile = await graphGet(`/${page.id}`, token, { fields: 'id,name,followers_count,fan_count' }); }
  catch { issues.push('Não foi possível consultar os totais atuais da Página.'); }

  const posts: Array<{ id: string; text: string; createdAt: string; permalink: string | null; reactions: number | null; comments: number | null; shares: number | null }> = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let after = '';
  let complete = false;
  let contentAvailable = false;
  for (let index = 0; index < 4; index++) {
    try {
      const result = await graphGet(`/${page.id}/posts`, token, {
        fields: 'id,message,created_time,permalink_url,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares',
        limit: 100, since, until, ...(after ? { after } : {}),
      });
      if (!Array.isArray(result.data)) throw new Error('Invalid content response');
      contentAvailable = true;
      for (const item of result.data) {
        const timestamp = Math.floor(Date.parse(item.created_time) / 1000);
        if (typeof item.id !== 'string' || seen.has(item.id) || !(timestamp >= since && timestamp <= until)) continue;
        seen.add(item.id);
        posts.push({ id: item.id, text: typeof item.message === 'string' ? item.message : '', createdAt: item.created_time,
          permalink: typeof item.permalink_url === 'string' ? item.permalink_url : null,
          reactions: count(item.reactions?.summary?.total_count), comments: count(item.comments?.summary?.total_count), shares: count(item.shares?.count) });
      }
      if (!result.paging?.next) { complete = true; break; }
      const cursor = result.paging?.cursors?.after;
      if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) break;
      cursors.add(cursor); after = cursor;
    } catch {
      issues.push('A consulta de publicações não foi concluída. Os resultados já recuperados foram preservados.');
      break;
    }
  }
  posts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const totals = Object.fromEntries((['reactions', 'comments', 'shares'] as const).map(key => [key, {
    value: posts.reduce((sum, post) => sum + (post[key] ?? 0), 0),
    availablePosts: posts.filter(post => post[key] !== null).length,
    complete: contentAvailable && complete && posts.every(post => post[key] !== null),
  }]));
  return { network: 'FACEBOOK', account: { id: account.id, instagram: account.igUsername }, page,
    period: { days, since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString() },
    collectedAt: new Date().toISOString(), followers: count(profile.followers_count), pageLikes: count(profile.fan_count),
    posts, totals, contentAvailable, complete, issues,
    measurement: 'Interações acumuladas até a consulta nas publicações criadas no período. Não são interações ocorridas exclusivamente dentro do período.',
  };
}
