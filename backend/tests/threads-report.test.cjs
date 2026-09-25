const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const originalFetch = global.fetch;
let owner, requests, responder;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  threadsAccount = { findFirst: async ({ where }) => where.userId === owner && where.id === 'account' && where.isActive
    ? { id: 'account', threadsUserId: 'thread-user', username: 'example', name: 'Example' } : null };
} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedThreadsToken: async () => 'test-token',
} };
const { getThreadsReport, parseThreadsMetric } = require('../dist/services/threads-report.service');
beforeEach(() => {
  owner = 'owner'; requests = [];
  responder = () => ({ data: [] });
  global.fetch = async (url, options) => {
    requests.push({ url: new URL(url), options });
    const result = responder(new URL(url));
    return { ok: !result.error, status: result.error ? (result.status || 500) : 200, json: async () => result };
  };
});
after(() => { global.fetch = originalFetch; });
test('distinguishes real zero, missing data, totals and follower snapshots', () => {
  assert.equal(parseThreadsMetric({ values: [{ value: 0 }] }).value, 0);
  assert.equal(parseThreadsMetric({ values: [{ value: 0 }] }).available, true);
  assert.equal(parseThreadsMetric(undefined).available, false);
  assert.equal(parseThreadsMetric({ values: [{ value: null }] }).value, null);
  assert.equal(parseThreadsMetric({ total_value: { value: 12 }, values: [{ value: 4 }] }).value, 12);
  assert.equal(parseThreadsMetric({ values: [{ value: 3 }, { value: 4 }] }).value, 7);
  assert.equal(parseThreadsMetric({ values: [{ value: 3 }, { value: 4 }] }, true).value, 4);
  assert.equal(parseThreadsMetric({ total_value: { value: 12 } }, false, 100, 200).value, null);
  assert.equal(parseThreadsMetric({ total_value: { value: 12 } }, false, 100, 200, true).value, 12);
  assert.equal(parseThreadsMetric({ total_value: { value: 0 } }, false, 100, 200, true).available, true);
  assert.equal(parseThreadsMetric({ values: [
    { value: 2, end_time: '2026-09-10T00:00:00+0000' },
    { value: 3, end_time: '2026-09-20T00:00:00+0000' },
  ] }, false, Date.parse('2026-09-15T00:00:00Z') / 1000, Date.parse('2026-09-22T00:00:00Z') / 1000).value, 3);
});
test('rejects another workspace before decrypting or contacting Meta', async () => {
  assert.equal(await getThreadsReport('other', 'account', 30), null);
  assert.equal(requests.length, 0);
});
test('permission failure preserves content without fabricating insights', async () => {
  responder = url => url.pathname.endsWith('threads_insights') ? { error: { code: 10 } }
    : { data: [{ id: 'post', text: 'Hello', timestamp: new Date().toISOString(), permalink: 'https://www.threads.net/post/test' }] };
  const report = await getThreadsReport('owner', 'account', 30);
  assert.equal(report.network, 'THREADS');
  assert.equal(report.posts.length, 1);
  assert.equal(report.contentAvailable, true);
  assert.equal(report.metrics.views.value, null);
  assert.ok(report.issues.every(issue => issue.reason === 'permission'));
  assert.deepEqual(report.issues.map(issue => issue.section).sort(), ['account_insights', 'followers_count']);
  assert.ok(!JSON.stringify(report).includes('test-token'));
});
test('HTTP 500/code 10 is a permission failure; periods exclude the lifetime follower metric', async () => {
  responder = url => url.pathname.endsWith('threads_insights')
    ? { error: { code: 10, error_subcode: 987, message: 'Permission denied; access_token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab' } }
    : { data: [] };
  const report = await getThreadsReport('owner', 'account', 30);
  assert.deepEqual(report.issues.find(issue => issue.section === 'account_insights'), {
    section: 'account_insights', reason: 'permission', status: 500, code: 10, subcode: 987,
    message: 'Permission denied; access_token=[redigido]',
  });
  const insightsRequests = requests.filter(item => item.url.pathname.endsWith('threads_insights'));
  assert.equal(insightsRequests.length, 2);
  assert.ok(insightsRequests.every(item => item.url.pathname === '/thread-user/threads_insights'));
  const bounded = insightsRequests.find(item => item.url.searchParams.get('metric').includes(','));
  assert.equal(bounded.url.searchParams.get('metric'), 'views,likes,replies,reposts,quotes');
  assert.equal(Number(bounded.url.searchParams.get('since')), Date.parse(report.period.since) / 1000);
  assert.equal(Number(bounded.url.searchParams.get('until')), Date.parse(report.period.until) / 1000);
  const followers = insightsRequests.find(item => item.url.searchParams.get('metric') === 'followers_count');
  assert.equal(followers.url.searchParams.has('since'), false);
  assert.equal(followers.url.searchParams.has('until'), false);
});

test('maps period totals and fetches current follower count separately', async () => {
  responder = url => !url.pathname.endsWith('threads_insights') ? { data: [] }
    : url.searchParams.get('metric') === 'followers_count' ? { data: [{ name: 'followers_count', total_value: { value: 321 } }] } : {
      data: [
        { name: 'views', values: [{ value: 120, end_time: new Date().toISOString() }] },
        { name: 'likes', total_value: { value: 18 } },
        { name: 'quotes', total_value: { value: 0 } },
      ],
    };
  const report = await getThreadsReport('owner', 'account', 30);
  assert.equal(report.metrics.views.value, 120);
  assert.equal(report.metrics.likes.value, 18);
  assert.equal(report.metrics.followers_count.value, 321);
  assert.equal(report.metrics.quotes.value, 0);
  assert.equal(report.metrics.quotes.available, true);
  assert.equal(report.metrics.replies.available, false);
  assert.equal(requests.filter(item => item.url.pathname.endsWith('threads_insights')).length, 2);
});

test('recovers supported account metrics individually when a combined request fails', async () => {
  responder = url => {
    if (!url.pathname.endsWith('threads_insights')) return { data: [] };
    const metric = url.searchParams.get('metric');
    if (metric.includes(',')) return { error: { code: 1, message: 'Internal error' } };
    if (metric === 'views') return { data: [{ name: 'views', values: [{ value: 42, end_time: new Date().toISOString() }] }] };
    return { error: { code: 1, message: 'Unsupported metric' } };
  };
  const report = await getThreadsReport('owner', 'account', 30);
  assert.equal(report.metrics.views.value, 42);
  assert.equal(report.metrics.likes.available, false);
  assert.equal(report.issues.length, 5);
  assert.ok(report.issues.every(issue => issue.section.startsWith('account_insights:') || issue.section === 'followers_count'));
  const insightRequests = requests.filter(item => item.url.pathname.endsWith('threads_insights'));
  assert.equal(insightRequests.length, 7);
  assert.deepEqual(insightRequests.filter(item => !item.url.searchParams.get('metric').includes(','))
    .map(item => item.url.searchParams.get('metric')).sort(),
    ['views', 'likes', 'replies', 'reposts', 'quotes', 'followers_count'].sort());
  for (const { url } of insightRequests.filter(item => item.url.searchParams.get('metric') !== 'followers_count')) {
    assert.equal(Number(url.searchParams.get('until')) - Number(url.searchParams.get('since')), 30 * 86400);
  }
});

test('expired tokens and rate limits do not fan out into per-metric retries', async () => {
  for (const [code, reason] of [[190, 'expired'], [4, 'rate_limit']]) {
    requests = [];
    responder = url => url.pathname.endsWith('threads_insights') ? { status: 403, error: { code } } : { data: [] };
    const report = await getThreadsReport('owner', 'account', 7);
    assert.ok(report.issues.every(issue => issue.reason === reason));
    assert.equal(requests.filter(item => item.url.pathname.endsWith('threads_insights')).length, 2);
  }
});

test('a rate limit during fallback preserves prior results and stops further requests', async () => {
  responder = url => {
    const metric = url.searchParams.get('metric');
    if (!metric || metric === 'followers_count') return { data: [] };
    if (metric.includes(',')) return { error: { code: 1 } };
    if (metric === 'views') return { data: [{ name: 'views', total_value: { value: 42 } }] };
    return { error: { code: 4 } };
  };
  const report = await getThreadsReport('owner', 'account', 7);
  assert.equal(report.metrics.views.value, 42);
  assert.equal(report.metrics.likes.available, false);
  assert.equal(report.issues[0].reason, 'rate_limit');
  assert.equal(requests.some(item => item.url.searchParams.get('metric') === 'replies'), false);
});

test('only uses Threads host and requested period; cursor URLs cannot redirect credentials', async () => {
  responder = url => url.pathname.endsWith('threads_insights') ? { data: [{ name: 'views', values: [{ value: 0 }] }] }
    : url.searchParams.has('after') ? { data: [{ id: 'old', timestamp: '2000-01-01' }, { id: 'post', timestamp: new Date().toISOString() }] }
      : { data: [{ id: 'post', timestamp: new Date().toISOString() }], paging: { next: 'https://attacker.invalid/?access_token=secret', cursors: { after: 'cursor' } } };
  const report = await getThreadsReport('owner', 'account', 7);
  assert.equal(report.metrics.views.value, 0);
  assert.equal(report.posts.length, 1);
  assert.equal(report.truncated, false);
  assert.ok(requests.every(r => r.url.origin === 'https://graph.threads.net'));
  assert.ok(requests.every(r => !r.url.searchParams.has('access_token')));
  for (const { url } of requests.filter(r => r.url.searchParams.has('since'))) {
    assert.equal(Number(url.searchParams.get('until')) - Number(url.searchParams.get('since')), 7 * 86400);
  }
});
test('bounded pagination reports partial coverage', async () => {
  let page = 0;
  responder = url => url.pathname.endsWith('threads_insights') ? { data: [] }
    : { data: [], paging: { next: 'next', cursors: { after: String(++page) } } };
  const report = await getThreadsReport('owner', 'account', 30);
  assert.equal(page, 4);
  assert.equal(report.truncated, true);
});
