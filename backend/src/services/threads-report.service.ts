import { PrismaClient } from '@prisma/client';
import { getDecryptedThreadsToken } from './instagram/auth.service';

const prisma = new PrismaClient();
type Metric = { value: number | null; daily: Array<{ date: string; value: number }>; available: boolean };

export function parseThreadsMetric(item: any, cumulative = false): Metric {
  const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const values = Array.isArray(item?.values) ? item.values : [];
  const daily = values.filter((v: any) => numeric(v.value) && typeof v.end_time === 'string')
    .map((v: any) => ({ date: v.end_time, value: v.value }));
  const scalars = values.map((v: any) => v.value).filter(numeric) as number[];
  const value = numeric(item?.total_value?.value) ? item.total_value.value
    : scalars.length ? (cumulative ? scalars[scalars.length - 1] : scalars.reduce((a, b) => a + b, 0)) : null;
  return { value, daily, available: value !== null };
}

class ThreadsReportError extends Error {
  constructor(public kind: 'permission' | 'expired' | 'rate_limit' | 'unavailable') { super(kind); }
}

async function request(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.threads.net${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const code = Number(data.error?.code);
    throw new ThreadsReportError(code === 190 ? 'expired'
      : [10, 200].includes(code) || response.status === 403 ? 'permission'
        : response.status === 429 || [4, 17, 32, 613].includes(code) ? 'rate_limit' : 'unavailable');
  }
  return data;
}

export async function getThreadsReport(userId: string, accountId: string, days: number) {
  const account = await prisma.threadsAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
    select: { id: true, threadsUserId: true, username: true, name: true, tokenExpiresAt: true },
  });
  if (!account) return null;
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const token = await getDecryptedThreadsToken(account.id);
  const issues: Array<{ section: string; reason: string }> = [];
  async function optional(section: string, load: () => Promise<any>) {
    try { return await load(); } catch (error) {
      issues.push({ section, reason: error instanceof ThreadsReportError ? error.kind : 'unavailable' });
      return null;
    }
  }
  const metrics = ['views', 'likes', 'replies', 'reposts', 'quotes'];
  const [insights, followers, content] = await Promise.all([
    optional('insights', () => request('/me/threads_insights', token, {
      metric: metrics.join(','), since: String(since), until: String(until),
    })),
    optional('followers', () => request('/me/threads_insights', token, { metric: 'followers_count' })),
    optional('content', async () => {
      const posts: any[] = [];
      let after = '';
      const seen = new Set<string>();
      const cursors = new Set<string>();
      let truncated = false;
      for (let page = 0; page < 4; page++) {
        const result = await request('/me/threads', token, {
          fields: 'id,text,timestamp,permalink,media_type', limit: '100',
          since: String(since), until: String(until), ...(after ? { after } : {}),
        });
        for (const post of Array.isArray(result.data) ? result.data : []) {
          const timestamp = Math.floor(Date.parse(post.timestamp) / 1000);
          if (typeof post.id !== 'string' || seen.has(post.id) || !(timestamp >= since && timestamp <= until)) continue;
          seen.add(post.id);
          posts.push({ id: post.id, text: post.text || '', timestamp: post.timestamp,
            permalink: post.permalink || null, mediaType: post.media_type || null });
        }
        if (!result.paging?.next) { truncated = false; break; }
        truncated = true;
        const cursor = result.paging?.cursors?.after;
        if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) break;
        cursors.add(cursor);
        after = cursor;
      }
      return { posts, truncated };
    }),
  ]);
  const data: Record<string, Metric> = {};
  for (const metric of metrics) {
    data[metric] = parseThreadsMetric(insights?.data?.find((item: any) => item.name === metric));
  }
  data.followers_count = parseThreadsMetric(followers?.data?.find((item: any) => item.name === 'followers_count'), true);
  return {
    network: 'THREADS', account: { id: account.id, username: account.username, name: account.name },
    period: { days, since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString() },
    collectedAt: new Date().toISOString(), metrics: data, posts: content?.posts || [],
    contentAvailable: content !== null, truncated: content?.truncated || false, issues,
  };
}
