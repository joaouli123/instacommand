const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let snapshots, dailyRows, account, graphCalls, graphAnswer, upserts;
require.cache[require.resolve('@prisma/client')] = { exports: { MediaType: { STORY: 'STORY', REEL: 'REEL', IMAGE: 'IMAGE', CAROUSEL: 'CAROUSEL' }, PrismaClient: class {
  profileInsight = { findMany: async () => snapshots };
  accountDailyInsight = {
    findMany: async ({ where }) => dailyRows.filter((row) => (where.date.in ? where.date.in.includes(row.date) : row.date >= where.date.gte && row.date <= where.date.lte)),
    upsert: async (args) => { upserts.push(args); },
  };
  instagramAccount = { findUnique: async () => account };
  scheduledPost = { count: async () => 0 };
} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGetAllWithStatus: async () => ({ items: [], complete: true }),
  graphGet: async (path, token, params) => { graphCalls.push(params); return graphAnswer(params); },
} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getDecryptedToken: async () => 'fixture' } };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: { maybeNotifyEngagement: async () => {} } };
const { getGrowthData } = require('../dist/services/analytics.service');
const { backfillDailyInsights } = require('../dist/services/instagram/insights.service');

// 2026-10-07 15:00 in São Paulo.
const NOW = new Date('2026-10-07T18:00:00Z');
const day = (date, gained, lost, extra = {}) => ({ date, followsGained: gained, followsLost: lost, reach: null, views: null, accountsEngaged: null, totalInteractions: null, ...extra });

beforeEach(() => { snapshots = []; dailyRows = []; account = { igFollowersCount: 1000 }; graphCalls = []; upserts = []; graphAnswer = () => ({ data: [] }); });

test('followers before the first sync are rebuilt from Meta daily follows and unfollows', async () => {
  // Connected today: only the current total was observed.
  snapshots = [{ collectedAt: new Date('2026-10-07T17:00:00Z'), followers: 1000, availableMetrics: [] }];
  dailyRows = [day('2026-10-07', 10, 2), day('2026-10-06', 5, 0, { reach: 300, views: 900 }), day('2026-10-05', 4, 1)];
  const points = await getGrowthData('acc', 7, NOW);
  const byDate = Object.fromEntries(points.map((point) => [point.date, point]));
  assert.equal(byDate['2026-10-07'].followers, 1000);
  assert.equal(byDate['2026-10-07'].followersEstimated, false);
  assert.equal(byDate['2026-10-06'].followers, 992); // 1000 - (10 - 2)
  assert.equal(byDate['2026-10-06'].followersEstimated, true);
  assert.equal(byDate['2026-10-05'].followers, 987); // 992 - (5 - 0)
  assert.equal(byDate['2026-10-04'].followers, 984); // 987 - (4 - 1)
  assert.equal(byDate['2026-10-06'].reach, 300);
  assert.equal(byDate['2026-10-06'].views, 900);
});

test('reconstruction stops at the first day without follow data; nothing is invented', async () => {
  snapshots = [{ collectedAt: new Date('2026-10-07T17:00:00Z'), followers: 500, availableMetrics: [] }];
  dailyRows = [day('2026-10-07', 3, 1), day('2026-10-06', null, null, { reach: 40 })];
  const points = await getGrowthData('acc', 7, NOW);
  assert.deepEqual(points.map((point) => [point.date, point.followers]), [['2026-10-06', 498], ['2026-10-07', 500]]);
  assert.equal(points[0].reach, 40);
});

test('without any sync yet, the current total anchors the history', async () => {
  dailyRows = [day('2026-10-07', 2, 0)];
  const points = await getGrowthData('acc', 7, NOW);
  assert.deepEqual(points.map((point) => [point.date, point.followers, point.followersEstimated]), [['2026-10-06', 998, true], ['2026-10-07', null, false]]);
});

test('daily backfill asks Meta for each of the last 30 days and stores what it answers', async () => {
  graphAnswer = (params) => params.metric === 'follows_and_unfollows'
    ? { data: [{ name: 'follows_and_unfollows', total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [{ dimension_values: ['FOLLOWER'], value: 7 }, { dimension_values: ['NON_FOLLOWER'], value: 2 }] }] } }] }
    : { data: [{ name: 'reach', total_value: { value: 120 } }, { name: 'views', total_value: { value: 400 } }] };
  const result = await backfillDailyInsights('acc', 'ig', 'token', NOW);
  assert.equal(result.requested, 31);
  assert.equal(result.saved, 31);
  const yesterday = upserts.find((row) => row.where.accountId_date.date === '2026-10-06');
  assert.deepEqual({ ...yesterday.create, fetchedAt: undefined }, { accountId: 'acc', date: '2026-10-06', reach: 120, views: 400, accountsEngaged: null, totalInteractions: null, followsGained: 7, followsLost: 2, fetchedAt: undefined });
  // Each day is its own window, in São Paulo time; today stops at "now".
  const windows = graphCalls.filter((params) => params.metric === 'follows_and_unfollows');
  assert.ok(windows.every((params) => params.until - params.since <= 86400));
  assert.ok(windows.some((params) => params.since === Date.UTC(2026, 9, 6, 3) / 1000));
  assert.ok(windows.every((params) => params.until <= NOW.getTime() / 1000));
});

test('stored days are not fetched again, except the last ones Meta may revise; silence stops early', async () => {
  dailyRows = Array.from({ length: 31 }, (_, index) => day(new Date(Date.UTC(2026, 9, 7 - index)).toISOString().slice(0, 10), 1, 0));
  graphAnswer = () => ({ data: [{ name: 'reach', total_value: { value: 1 } }] });
  const result = await backfillDailyInsights('acc', 'ig', 'token', NOW);
  assert.equal(result.requested, 4); // today + the 3 revisable days
  graphAnswer = () => ({ data: [] });
  dailyRows = [];
  graphCalls = [];
  const silent = await backfillDailyInsights('acc', 'ig', 'token', NOW);
  assert.equal(silent.saved, 0);
  assert.ok(graphCalls.length <= 5, `probe should stop early, made ${graphCalls.length} calls`);
});
