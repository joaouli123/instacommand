import { PrismaClient } from '@prisma/client';
import { getDecryptedToken } from './instagram/auth.service';
import { verifyFacebookPageLink } from './instagram/facebook-link.service';
import { graphGet } from '../utils/instagram-api';
import { analyticsDays } from './analytics-period';

const prisma = new PrismaClient();
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
type DailyPoint = { date: string; value: number };
const dailyPoints = (metric: any, since: string, until: string): DailyPoint[] => {
  const points = new Map<string, number>();
  for (const item of Array.isArray(metric?.values) ? metric.values : []) {
    const value = count(item.value), end = Date.parse(item.end_time);
    if (value === null || !Number.isFinite(end)) continue;
    const date = new Date(end - 86400000).toISOString().slice(0, 10);
    if (date >= since && date < until) points.set(date, value);
  }
  return [...points].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
};
const historyMetrics = { page_total_media_view_unique: 'viewers', page_follows: 'followers',
  page_daily_follows_unique: 'gained', page_daily_unfollows_unique: 'lost' } as const;

async function pageHistory(pageId: string, token: string, since: string, until: string) {
  let items: any[] = [];
  const fields = Object.keys(historyMetrics);
  try {
    const result = await graphGet(`/${pageId}/insights`, token, { metric: fields.join(','), period: 'day', since, until });
    if (Array.isArray(result.data)) items = result.data;
  } catch (error) {
    // Isolate unsupported metrics, but never fan out a permission/rate failure.
    if ((error as { metaCode?: number }).metaCode === 100) for (const metric of fields) {
      try {
        const result = await graphGet(`/${pageId}/insights`, token, { metric, period: 'day', since, until });
        if (Array.isArray(result.data)) items.push(...result.data);
      } catch (fieldError) { if ((fieldError as { metaCode?: number }).metaCode !== 100) break; }
    }
  }
  return Object.fromEntries(Object.entries(historyMetrics).map(([metric, key]) => [key,
    dailyPoints(items.find(item => item.name === metric), since, until),
  ])) as Record<typeof historyMetrics[keyof typeof historyMetrics], DailyPoint[]>;
}

export async function getFacebookReport(userId: string, accountId: string, days: number, endAt = Date.now()) {
  analyticsDays(days);
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
    select: { id: true, igUserId: true, igUsername: true, pageId: true },
  });
  if (!account) return null;
  const token = await getDecryptedToken(account.id);
  const page = await verifyFacebookPageLink(account.pageId, account.igUserId, token);
  const until = Math.floor(endAt / 1000);
  const since = until - days * 86400;
  // Meta accepts at most 90 days in an Insights request. Keep the publication
  // range intact and disclose the separate profile window instead of silently
  // returning a failed or fabricated long-range aggregate.
  const insightDays = Math.min(days, 90);
  const insightSince = new Date((until - insightDays * 86400) * 1000).toISOString().slice(0, 10);
  const insightUntil = new Date(until * 1000).toISOString().slice(0, 10);
  const issues: string[] = [];
  let profile: any = {};
  try { profile = await graphGet(`/${page.id}`, token, { fields: 'id,name,followers_count,fan_count' }); }
  catch { issues.push('Não foi possível consultar os totais atuais da Página.'); }

  let mediaViews: number | null = null;
  let mediaViewsDaily: Array<{ date: string; value: number }> = [];
  try {
    const insight = await graphGet(`/${page.id}/insights`, token, {
      metric: 'page_media_view', period: 'day',
      since: insightSince, until: insightUntil,
    });
    const metric = Array.isArray(insight.data) ? insight.data.find((item: any) => item.name === 'page_media_view') : null;
    mediaViewsDaily = dailyPoints(metric, insightSince, insightUntil);
    if (mediaViewsDaily.length) {
      mediaViews = mediaViewsDaily.reduce((sum, item) => sum + item.value, 0);
    } else {
      issues.push('A Meta não retornou visualizações da Página (page_media_view). Confira se read_insights está autorizado no app e para esta Página; a disponibilidade também depende da elegibilidade da Página e do período.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    issues.push(/permission|read_insights|insight/i.test(message)
      ? 'Visualizações indisponíveis: o app precisa da permissão read_insights aprovada e autorizada para esta Página.'
      : 'A Meta recusou ou não retornou visualizações. Confirme se read_insights foi aprovado e autorizado para esta Página e se o insight está disponível no período selecionado.');
  }

  const posts: Array<{ id: string; text: string; createdAt: string; permalink: string | null; reactions: number | null; comments: number | null; shares: number | null }> = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let after = '';
  let complete = false;
  let contentAvailable = false;
  let countersRestricted = false;
  const baseFields = 'id,message,created_time,permalink_url,shares';
  for (let index = 0; index < 4; index++) {
    try {
      const params = {
        limit: 100, since, until, ...(after ? { after } : {}),
      };
      let result;
      try {
        result = await graphGet(`/${page.id}/posts`, token, {
          ...params, fields: countersRestricted ? baseFields : `${baseFields},reactions.limit(0).summary(true),comments.limit(0).summary(true)`,
        });
      } catch (error) {
        const code = (error as { metaCode?: number }).metaCode;
        if (countersRestricted || ![10, 200].includes(code ?? 0)) throw error;
        // User-content counters need broader access than the Page's own posts.
        // Retry this read once without those optional fields, never on auth/rate errors.
        countersRestricted = true;
        result = await graphGet(`/${page.id}/posts`, token, { ...params, fields: baseFields });
        issues.push('As publicações estão disponíveis, mas curtidas e comentários precisam de uma autorização adicional na conexão da Página.');
      }
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
  const history = await pageHistory(page.id, token, insightSince, insightUntil);
  if (Object.values(history).some(points => !points.length)) issues.push('Algumas séries de audiência não foram fornecidas para esta Página. Os gráficos preservam as métricas disponíveis sem preencher lacunas com zero.');
  return { network: 'FACEBOOK', account: { id: account.id, instagram: account.igUsername }, page,
    period: { days, since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString() },
    collectedAt: new Date().toISOString(), followers: count(profile.followers_count), pageLikes: count(profile.fan_count),
    posts, totals, insights: { mediaViews, mediaViewsAvailable: mediaViews !== null, daily: mediaViewsDaily,
      mediaViewsPartial: mediaViewsDaily.length < insightDays, history,
      period: { days: insightDays, limited: insightDays !== days, since: insightSince, until: insightUntil },
    }, contentAvailable, complete, countersRestricted, issues,
    measurement: 'Interações acumuladas até a consulta nas publicações criadas no período. Não são interações ocorridas exclusivamente dentro do período.',
  };
}
