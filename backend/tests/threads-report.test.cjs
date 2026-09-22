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
    return { ok: !result.error, status: result.error ? 403 : 200, json: async () => result };
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
  assert.deepEqual(report.issues.map(issue => issue.section), [
    'account_insights:views', 'account_insights:likes', 'account_insights:replies',
    'account_insights:reposts', 'account_insights:quotes', 'account_insights:followers_count',
  ]);
  assert.ok(!JSON.stringify(report).includes('test-token'));
});
test('keeps Meta error codes safe and omits unsupported period params from account insights', async () => {
  responder = url => url.pathname.endsWith('threads_insights')
    ? { error: { code: 10, error_subcode: 987, message: 'Permission denied; access_token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab' } }
    : { data: [] };
  const report = await getThreadsReport('owner', 'account', 30);
  assert.deepEqual(report.issues.find(issue => issue.section === 'account_insights:views'), {
    section: 'account_insights:views', reason: 'permission', status: 403, code: 10, subcode: 987,
    message: 'Permission denied; access_token=[redigido]',
  });
  const insightsRequests = requests.filter(item => item.url.pathname.endsWith('threads_insights'));
  assert.equal(insightsRequests.length, 7);
  assert.equal(insightsRequests[0].url.searchParams.get('metric'), 'views,likes,replies,reposts,quotes,followers_count');
  assert.deepEqual(insightsRequests.slice(1).map(item => item.url.searchParams.get('metric')),
    ['views', 'likes', 'replies', 'reposts', 'quotes', 'followers_count']);
  assert.ok(insightsRequests.every(item => !item.url.searchParams.has('since') && !item.url.searchParams.has('until')));
});
test('maps combined account insight response by metric name using a single request', async () => {
  responder = url => url.pathname.endsWith('threads_insights') ? {
    data: [
      { name: 'views', values: [{ value: 120, end_time: new Date().toISOString() }] },
      { name: 'likes', values: [{ value: 18, end_time: new Date().toISOString() }] },
      { name: 'followers_count', values: [{ value: 321 }] },
    ],
  } : { data: [] };
  const report = await getThreadsReport('owner', 'account', 30);
  assert.equal(report.metrics.views.value, 120);
  assert.equal(report.metrics.likes.value, 18);
  assert.equal(report.metrics.followers_count.value, 321);
  assert.equal(report.metrics.replies.available, false);
  assert.equal(requests.filter(item => item.url.pathname.endsWith('threads_insights')).length, 1);
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
  assert.ok(report.issues.every(issue => issue.section.startsWith('account_insights:')));
  const insightRequests = requests.filter(item => item.url.pathname.endsWith('threads_insights'));
  assert.equal(insightRequests.length, 7);
  assert.deepEqual(insightRequests.slice(1).map(item => item.url.searchParams.get('metric')),
    ['views', 'likes', 'replies', 'reposts', 'quotes', 'followers_count']);
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
