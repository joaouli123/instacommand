const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { metricValue, receivedMetrics, aggregateMetrics } = require('../dist/services/metric-availability');
const { publicationPeriod, analyticsDays } = require('../dist/services/analytics-period');
let calls, rows, profileInsights;
require.cache[require.resolve('@prisma/client')] = { exports: { MediaType: { IMAGE: 'IMAGE', CAROUSEL: 'CAROUSEL', REEL: 'REEL', STORY: 'STORY' }, PrismaClient: class {
  instagramAccount = { findUnique: async args => {
    calls.push(['account', args]);
    return { igFollowersCount: 100, profileInsights, publishedPosts: rows };
  } };
  scheduledPost = { count: async () => 0 };
  publishedPost = {
    findMany: async args => {
      calls.push(['posts', args]);
      const mediaType = args.where?.mediaType;
      return mediaType ? rows.filter(row => typeof mediaType === 'string' ? row.mediaType === mediaType : mediaType.in.includes(row.mediaType)) : rows;
    },
    count: async args => { calls.push(['count', args]); return rows.length; },
  };
  profileInsight = { findMany: async args => { calls.push(['growth', args]); return []; } };
} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: {} };
const analytics = require('../dist/services/analytics.service');
const insights = require('../dist/services/instagram/insights.service');
beforeEach(() => { calls = []; rows = []; profileInsights = [{ followers: 0, reach: 0, impressions: 0, availableMetrics: ['reach'] }]; });
test('verified zero is different from ambiguous historical zero and absent data', () => {
  assert.equal(metricValue({ likes: 0, availableMetrics: ['likes'] }, 'likes'), 0);
  assert.equal(metricValue({ likes: 0 }, 'likes'), null);
  assert.equal(metricValue({ likes: 8 }, 'likes'), 8);
  assert.equal(metricValue(undefined, 'likes'), null);
  assert.equal(metricValue({ engagement: 8, availableMetrics: ['likes'] }, 'engagement'), null);
});
test('availability records only returned numeric metrics, including zero', () => {
  assert.deepEqual(receivedMetrics([{ name: 'saved', values: [{ value: 0 }] }, { name: 'reach', total_value: { value: 12 } }, { name: 'impressions' }]), ['saves', 'reach']);
  assert.deepEqual(receivedMetrics([{ name: 'views', values: [{ value: 0 }] }, { name: 'video_views', values: [{ value: 8 }] }, { name: 'plays', values: [{ value: 3 }] }]), ['views']);
  assert.deepEqual(receivedMetrics([{ name: 'accounts_engaged', values: [{ value: 4 }] }, { name: 'total_interactions', values: [{ value: 5 }] }, { name: 'profile_links_taps', values: [{ value: 6 }] }]), ['accountsEngaged', 'totalInteractions', 'profileLinkTaps']);
});
test('partial totals expose coverage without inventing reach or interaction values', () => {
  const total = aggregateMetrics([{ likes: 0, availableMetrics: ['likes'] }, { likes: 5, comments: 2, availableMetrics: ['likes', 'comments'] }, {}]);
  assert.equal(total.likes, 5); assert.equal(total.reach, null); assert.equal(total.interactions, 7);
  assert.equal(total.coverage.likes, 2); assert.equal(total.partial, true);
  assert.equal(aggregateMetrics([{}]).interactions, null);
});
test('periods are bounded and unsupported or malformed ranges fail', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  const range = publicationPeriod(7, now);
  assert.equal(range.gte.toISOString(), '2026-09-14T12:00:00.000Z'); assert.equal(+range.lte, +now);
  for (const value of [-1, 0, '7days', 999999, [7,30]]) assert.throws(() => analyticsDays(value));
});
test('all post-based reports filter the chosen period and counts use identical bounds', async () => {
  await analytics.getDashboardStats('account', 7);
  await analytics.getPostPerformanceTable('account', 2, 20, 7);
  await analytics.getRecommendations('account', 7);
  await analytics.getEngagementTimeSeries('account', 7);
  await analytics.getTopPosts('account', 5, 'likes', 7);
  await insights.getBestTimeToPost('account', 7);
  await insights.getContentTypeAnalysis('account', 7);
  for (const [kind, args] of calls) {
    const where = kind === 'account' ? args.include.publishedPosts.where : args.where;
    assert.equal(+where.publishedAt.lte - +where.publishedAt.gte, 7 * 86400000);
    assert.deepEqual(where.igMediaId, { not: null });
    assert.equal(where.instagramDeletedAt, null);
  }
  const table = calls.find(([kind, args]) => kind === 'posts' && args.skip === 20)[1];
  assert.deepEqual(table.where, calls.find(([kind]) => kind === 'count')[1].where);
});
test('dashboard preserves true zero followers and available reach zero', async () => {
  const result = await analytics.getDashboardStats('account', 30);
  assert.equal(result.followers, 0); assert.equal(result.reach, 0);
  assert.equal(result.impressions, null); assert.equal(result.interactions, null);
  assert.equal(result.followerGrowth, null); assert.equal(result.hasFollowerHistory, false);
});
test('dashboard distinguishes a real zero change from missing comparison history', async () => {
  profileInsights = [
    { followers: 100, reach: 0, impressions: 0, availableMetrics: ['reach'] },
    { followers: 100, reach: 0, impressions: 0, availableMetrics: ['reach'] },
  ];
  const result = await analytics.getDashboardStats('account', 30);
  assert.equal(result.followerGrowth, 0);
  assert.equal(result.hasFollowerHistory, true);
});
test('timeline uses Sao Paulo publication date and table exposes missing metrics as null', async () => {
  rows = [{ id: 'p', mediaType: 'IMAGE', publishedAt: new Date('2026-09-21T01:00:00Z'), insights: [{ likes: 0, reach: 0, availableMetrics: ['likes'] }] }];
  const timeline = await analytics.getEngagementTimeSeries('account', 30);
  assert.equal(timeline[0].date, '2026-09-20'); assert.equal(timeline[0].likes, 0); assert.equal(timeline[0].reach, null);
  const table = await analytics.getPostPerformanceTable('account', 1, 20, 30);
  assert.equal(table.data[0].insights[0].reach, null);
  const formats = await insights.getContentTypeAnalysis('account', 30);
  assert.equal(formats[0].reach, null); assert.equal(formats[0].likes, 0);
});
test('time ranking ignores completely unknown counters rather than scoring them zero', async () => {
  rows = [{ mediaType: 'IMAGE', publishedAt: new Date(), insights: [] }];
  assert.deepEqual(await insights.getBestTimeToPost('account', 30), []);
});
test('top-content ranking filters media type and excludes unknown metrics instead of treating them as zero', async () => {
  rows = [
    { id: 'unknown', mediaType: 'REEL', insights: [{ views: 0, likes: 0, availableMetrics: ['likes'] }] },
    { id: 'measured', mediaType: 'REEL', insights: [{ views: 31, availableMetrics: ['views'] }] },
    { id: 'other-format', mediaType: 'IMAGE', insights: [{ views: 99, availableMetrics: ['views'] }] },
  ];
  const result = await analytics.getTopPosts('account', 20, 'views', 30, 'REEL');
  assert.deepEqual(result.map(post => [post.id, post.score]), [['measured', 31]]);
  assert.equal(calls.find(([kind]) => kind === 'posts')[1].where.mediaType, 'REEL');
});
test('story reply counts can support a story interaction ranking without pretending to be comments', async () => {
  rows = [{ id: 'story', mediaType: 'STORY', insights: [{ replies: 6, availableMetrics: ['replies'] }] }];
  const result = await analytics.getTopPosts('account', 20, 'interactions', 30, 'STORY');
  assert.equal(result[0].score, 6);
  assert.equal(result[0].metrics.replies, 6);
  assert.equal(result[0].metrics.interactionsPartial, true);
});
