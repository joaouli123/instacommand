const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let owned, verified, calls, pages, profile, pageInsights, lookup, tokenReads;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async args => { lookup = args; return owned ? { id: 'account1', igUserId: 'ig1', igUsername: 'profile', pageId: 'page1' } : null; } };
} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getDecryptedToken: async () => { tokenReads++; return 'test-token'; } } };
require.cache[require.resolve('../dist/services/instagram/facebook-link.service')] = { exports: { verifyFacebookPageLink: async () => { if (!verified) throw new Error('Wrong Page'); return { id: 'page1', name: 'Page' }; } } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: { graphGet: async (path, token, params) => {
  calls.push({ path, token, params });
  const result = path === '/page1' ? profile : path === '/page1/insights' ? pageInsights : pages.shift();
  if (result instanceof Error) throw result;
  return result;
} } };
const { getFacebookReport } = require('../dist/services/facebook-report.service');
const post = (id, extra = {}) => ({ id, message: 'Real content', created_time: new Date(Date.now() - 86400000).toISOString(), reactions: { summary: { total_count: 0 } }, comments: { summary: { total_count: 2 } }, ...extra });
beforeEach(() => { owned = true; verified = true; calls = []; tokenReads = 0; pages = [{ data: [] }]; pageInsights = { data: [] }; profile = { followers_count: 0, fan_count: 12 }; });
test('workspace ownership is checked before reading tokens or Meta data', async () => {
  owned = false;
  assert.equal(await getFacebookReport('current', 'account1', 30), null);
  assert.deepEqual(lookup.where, { id: 'account1', userId: 'current', isActive: true });
  assert.equal(tokenReads, 0); assert.equal(calls.length, 0);
});
test('unverified Page cannot supply another Page report', async () => {
  verified = false;
  await assert.rejects(getFacebookReport('current', 'account1', 30), /Wrong Page/);
  assert.equal(calls.length, 0);
});
test('real zero is distinguished from missing shares', async () => {
  pages = [{ data: [post('1')] }];
  const report = await getFacebookReport('current', 'account1', 30);
  assert.equal(report.followers, 0); assert.equal(report.posts[0].reactions, 0); assert.equal(report.posts[0].shares, null);
  assert.equal(report.totals.shares.complete, false); assert.equal(report.totals.shares.availablePosts, 0);
  assert.equal(report.totals.reactions.complete, true);
});
test('pagination preserves exact Page, period and deduplicates posts', async () => {
  pages = [{ data: [post('1')], paging: { next: 'https://untrusted.test/', cursors: { after: 'cursor1' } } },
    { data: [post('1'), post('2'), post('old', { created_time: '2020-01-01T00:00:00Z' })] }];
  const report = await getFacebookReport('current', 'account1', 30);
  assert.equal(report.posts.length, 2); assert.equal(report.complete, true);
  assert.equal(calls[3].path, '/page1/posts'); assert.equal(calls[3].params.after, 'cursor1');
  assert.equal(calls[2].params.since, calls[3].params.since);
});
test('partial failure preserves first page and cannot report a complete total', async () => {
  pages = [{ data: [post('1')], paging: { next: 'next', cursors: { after: 'cursor' } } }, new Error('Graph failure')];
  const report = await getFacebookReport('current', 'account1', 30);
  assert.equal(report.posts.length, 1); assert.equal(report.complete, false); assert.equal(report.contentAvailable, true);
  assert.equal(report.totals.comments.complete, false); assert.equal(report.issues.length, 1);
});
test('failed profile fields do not discard publications', async () => {
  profile = new Error('Permission failure'); pages = [{ data: [post('1')] }];
  const report = await getFacebookReport('current', 'account1', 30);
  assert.equal(report.followers, null); assert.equal(report.posts.length, 1);
});
test('bounded pagination identifies incomplete coverage', async () => {
  pages = Array.from({ length: 4 }, (_, i) => ({ data: [post(String(i))], paging: { next: 'next', cursors: { after: `cursor${i}` } } }));
  const report = await getFacebookReport('current', 'account1', 730);
  assert.equal(report.posts.length, 4); assert.equal(report.complete, false); assert.equal(calls.length, 6);
});
test('sums actual Page media views for the selected period', async () => {
  pageInsights = { data: [{ name: 'page_media_view', values: [{ value: 12 }, { value: 8 }, { value: null }, { value: -1 }] }] };
  const report = await getFacebookReport('current', 'account1', 30);
  assert.equal(report.insights.mediaViews, 20); assert.equal(report.insights.mediaViewsAvailable, true);
  const request = calls.find(call => call.path === '/page1/insights');
  assert.equal(request.params.metric, 'page_media_view'); assert.equal(request.params.period, 'day');
  assert.ok(request.params.since); assert.ok(request.params.until);
});
test('missing Page views remain unavailable and permission failures are explained', async () => {
  pageInsights = new Error('Missing permission read_insights');
  const report = await getFacebookReport('current', 'account1', 30);
  assert.equal(report.insights.mediaViews, null); assert.equal(report.insights.mediaViewsAvailable, false);
  assert.match(report.issues.join(' '), /read_insights/);
});
