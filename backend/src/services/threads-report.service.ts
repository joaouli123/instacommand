import { PrismaClient } from '@prisma/client';
import { getDecryptedThreadsToken } from './instagram/auth.service';

const prisma = new PrismaClient();
type Metric = { value: number | null; daily: Array<{ date: string; value: number }>; available: boolean };

export function parseThreadsMetric(item: any, cumulative = false, since?: number, until?: number, totalMatchesPeriod = false): Metric {
  const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const values = Array.isArray(item?.values) ? item.values : [];
  const inPeriod = (v: any) => {
    if (since === undefined || until === undefined || typeof v.end_time !== 'string') return true;
    const timestamp = Math.floor(Date.parse(v.end_time) / 1000);
    return Number.isFinite(timestamp) && timestamp >= since && timestamp <= until;
  };
  const periodValues = values.filter(inPeriod);
  const daily = periodValues.filter((v: any) => numeric(v.value) && typeof v.end_time === 'string')
    .map((v: any) => ({ date: v.end_time, value: v.value }));
  const scalars = periodValues.map((v: any) => v.value).filter(numeric) as number[];
  const hasPeriod = since !== undefined && until !== undefined;
  // Trust a scalar total for a selected period only when the API request used
  // that exact interval. Never relabel an unbounded lifetime total.
  const value = (!hasPeriod || totalMatchesPeriod) && numeric(item?.total_value?.value) ? item.total_value.value
    : scalars.length ? (cumulative ? scalars[scalars.length - 1] : scalars.reduce((a, b) => a + b, 0)) : null;
  return { value, daily, available: value !== null };
}

class ThreadsReportError extends Error {
  constructor(
    public kind: 'permission' | 'expired' | 'rate_limit' | 'unavailable',
    public status: number,
    public code?: number,
    public subcode?: number,
    public providerMessage?: string,
  ) { super(kind); }
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
    const subcode = Number(data.error?.error_subcode);
    const rawMessage = typeof data.error?.message === 'string' ? data.error.message : '';
    const providerMessage = rawMessage.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redigido]')
      .replace(/access_token=([^&\s]+)/gi, 'access_token=[redigido]')
      .replace(/[A-Za-z0-9_-]{48,}/g, '[redigido]').slice(0, 500) || undefined;
    throw new ThreadsReportError(code === 190 ? 'expired'
      : [10, 200].includes(code) ? 'permission'
        : response.status === 429 || [4, 17, 32, 613].includes(code) ? 'rate_limit'
          : response.status === 403 ? 'permission' : 'unavailable',
      response.status, Number.isFinite(code) ? code : undefined, Number.isFinite(subcode) ? subcode : undefined, providerMessage);
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
  const issues: Array<{ section: string; reason: string; status?: number; code?: number; subcode?: number; message?: string }> = [];
  async function optional(section: string, load: () => Promise<any>) {
    try { return await load(); } catch (error) {
      issues.push({ section, reason: error instanceof ThreadsReportError ? error.kind : 'unavailable',
        ...(error instanceof ThreadsReportError ? { status: error.status, code: error.code, subcode: error.subcode,
          ...(error.providerMessage ? { message: error.providerMessage } : {}) } : {}) });
      return null;
    }
  }
  const metrics = ['views', 'likes', 'replies', 'reposts', 'quotes'];
  // An explicit user ID preserves Meta's permission error; /me can mask it
  // as HTTP 500/code 1. Followers do not accept since/until and stay separate.
  const insightsPath = `/${encodeURIComponent(account.threadsUserId)}/threads_insights`;
  const periodParams = { since: String(since), until: String(until) };
  const [accountInsights, followerInsights, content] = await Promise.all([
    optional('account_insights', async () => {
      try {
        return await request(insightsPath, token, { metric: metrics.join(','), ...periodParams });
      } catch (combinedError) {
        // Authorization, expiry and rate limits affect the whole request.
        // Retrying every metric would not fix them and wastes the quota.
        if (combinedError instanceof ThreadsReportError && combinedError.kind !== 'unavailable') throw combinedError;
        const data: any[] = [];
        for (const metric of metrics) {
          try {
            const result = await request(insightsPath, token, { metric, ...periodParams });
            data.push(...(Array.isArray(result.data) ? result.data : []));
          } catch (error) {
            const issue = error instanceof ThreadsReportError ? error : combinedError;
            issues.push({ section: `account_insights:${metric}`,
              reason: issue instanceof ThreadsReportError ? issue.kind : 'unavailable',
              ...(issue instanceof ThreadsReportError ? { status: issue.status, code: issue.code,
                subcode: issue.subcode, ...(issue.providerMessage ? { message: issue.providerMessage } : {}) } : {}) });
            // Keep metrics already returned, but stop on account-wide failures.
            if (issue instanceof ThreadsReportError && issue.kind !== 'unavailable') break;
          }
        }
        return { data };
      }
    }),
    optional('followers_count', () => request(insightsPath, token, { metric: 'followers_count' })),
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
  const insightItems = Array.isArray(accountInsights?.data) ? accountInsights.data : [];
  const data: Record<string, Metric> = {};
  for (const metric of metrics) {
    data[metric] = parseThreadsMetric(insightItems.find((item: any) => item.name === metric), false, since, until, true);
  }
  const followerItems = Array.isArray(followerInsights?.data) ? followerInsights.data : [];
  data.followers_count = parseThreadsMetric(followerItems.find((item: any) => item.name === 'followers_count'), true);
  return {
    network: 'THREADS', account: { id: account.id, username: account.username, name: account.name },
    period: { days, since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString() },
    collectedAt: new Date().toISOString(), metrics: data, posts: content?.posts || [],
    contentAvailable: content !== null, truncated: content?.truncated || false, issues,
  };
}
