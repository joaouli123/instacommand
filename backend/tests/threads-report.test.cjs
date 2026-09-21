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
  assert.ok(!JSON.stringify(report).includes('test-token'));
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
