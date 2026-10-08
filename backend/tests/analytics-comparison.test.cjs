const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let snapshots, dailyRows, posts, postQueries;
require.cache[require.resolve('@prisma/client')] = { exports: { MediaType: { STORY: 'STORY', REEL: 'REEL', IMAGE: 'IMAGE', CAROUSEL: 'CAROUSEL' }, PrismaClient: class {
  profileInsight = { findMany: async ({ where }) => snapshots.filter((s) => s.collectedAt >= where.collectedAt.gte && s.collectedAt <= where.collectedAt.lte) };
  accountDailyInsight = { findMany: async ({ where }) => dailyRows.filter((row) => row.date >= where.date.gte && row.date <= where.date.lte) };
  instagramAccount = { findUnique: async (args) => args.include ? { igFollowersCount: 1100, profileInsights: [], publishedPosts: posts.filter((p) => p.publishedAt >= args.include.publishedPosts.where.publishedAt.gte) } : { igFollowersCount: 1100 } };
  publishedPost = { findMany: async ({ where }) => { postQueries.push(where); return posts.filter((p) => p.publishedAt >= where.publishedAt.gte && p.publishedAt <= where.publishedAt.lte); } };
  scheduledPost = { count: async () => 0 };
} } };
const { summarizeFollowerWindow, getFollowerComparison, getDashboardStats } = require('../dist/services/analytics.service');

const NOW = new Date('2026-10-07T18:00:00Z');
const day = (date, gained, lost) => ({ date, followsGained: gained, followsLost: lost, reach: null, views: null, accountsEngaged: null, totalInteractions: null });
const snap = (iso, followers) => ({ collectedAt: new Date(iso), followers, reach: null, views: null, totalInteractions: null });
beforeEach(() => { snapshots = []; dailyRows = []; posts = []; postQueries = []; });

test('a window summary needs two stored totals for the net change and keeps unknown follows as null', () => {
  const points = [
    { date: '2026-10-01', followers: 100, followsGained: 5, followsLost: 2 },
    { date: '2026-10-02', followers: null, followsGained: null, followsLost: 1 },
    { date: '2026-10-03', followers: 104, followsGained: null, followsLost: null },
  ];
  assert.deepEqual(summarizeFollowerWindow(points, '2026-10-01', '2026-10-03'), { since: '2026-10-01', until: '2026-10-03', start: 100, end: 104, net: 4, gained: 5, lost: 3 });
  const single = summarizeFollowerWindow(points, '2026-10-03', '2026-10-03');
  assert.equal(single.net, null);
  assert.equal(single.gained, null);
});

test('follower growth is compared with the same-length window right before, from stored snapshots', async () => {
  snapshots = [snap('2026-09-24T15:00:00Z', 1000), snap('2026-09-29T15:00:00Z', 1020), snap('2026-10-01T15:00:00Z', 1030), snap('2026-10-07T15:00:00Z', 1100)];
  dailyRows = [day('2026-09-25', 10, 4), day('2026-10-05', 30, 6)];
  const { current, previous } = await getFollowerComparison('a', 7, NOW);
  assert.equal(current.since, '2026-09-30');
  assert.equal(current.net, 70);
  assert.equal(current.gained, 30);
  assert.equal(current.lost, 6);
  assert.equal(previous.until, '2026-09-29');
  assert.equal(previous.net, 20);
  assert.equal(previous.gained, 10);
  assert.equal(previous.lost, 4);
});

test('long ranges are not compared', async () => {
  const result = await getFollowerComparison('a', 365, NOW);
  assert.equal(result.previous, null);
});

test('dashboard returns stored post totals of the previous window', async () => {
  const insight = (likes, engagement) => [{ likes, comments: 1, saves: 0, shares: 0, engagement }];
  posts = [
    { publishedAt: new Date('2026-10-05T12:00:00Z'), insights: insight(9, 4) },
    { publishedAt: new Date('2026-09-26T12:00:00Z'), insights: insight(4, 2) },
  ];
  const stats = await getDashboardStats('a', 7, NOW);
  assert.equal(stats.interactions, 10);
  assert.equal(stats.previous.interactions, 5);
  assert.equal(stats.previous.engagementRate, 2);
  assert.equal(postQueries[0].publishedAt.lte.toISOString(), '2026-09-30T18:00:00.000Z');
});

test('dashboard skips the previous window for long ranges', async () => {
  const stats = await getDashboardStats('a', 365, NOW);
  assert.equal(stats.previous, null);
  assert.equal(postQueries.length, 0);
});
