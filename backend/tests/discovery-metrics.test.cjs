const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { calculateCompetitorMetrics, normalizeCompetitorInsight } = require('../dist/services/instagram/discovery.service');

test('missing competitor counters remain unavailable instead of becoming zero', () => {
  assert.deepEqual(calculateCompetitorMetrics([{ id: 'a' }, { id: 'b', like_count: null }], 500), {
    avgLikes: null,
    avgComments: null,
    engagementRate: null,
    metricCoverage: { posts: 2, likes: 0, comments: 0, engagement: 0 },
  });
});

test('real zero counters remain valid observations and produce zero engagement', () => {
  assert.deepEqual(calculateCompetitorMetrics([{ id: 'a', like_count: 0, comments_count: 0 }], 500), {
    avgLikes: 0,
    avgComments: 0,
    engagementRate: 0,
    metricCoverage: { posts: 1, likes: 1, comments: 1, engagement: 1 },
  });
});

test('partial coverage averages only observed values and reports denominators', () => {
  const result = calculateCompetitorMetrics([
    { like_count: 10, comments_count: 2 },
    { like_count: 20 },
    { comments_count: 4 },
  ], 1000);
  assert.equal(result.avgLikes, 15);
  assert.equal(result.avgComments, 3);
  assert.equal(result.engagementRate, 1.2);
  assert.deepEqual(result.metricCoverage, { posts: 3, likes: 2, comments: 2, engagement: 1 });
});

test('legacy aggregate zeros are reconstructed from source posts, never trusted alone', () => {
  const legacy = { avgLikes: 0, avgComments: 0, engagementRate: 0, followers: 100, recentPostsData: [{ like_count: 8, comments_count: 2 }] };
  const normalized = normalizeCompetitorInsight(legacy);
  assert.equal(normalized.avgLikes, 8);
  assert.equal(normalized.avgComments, 2);
  assert.equal(normalized.engagementRate, 10);
  assert.deepEqual(normalized.metricCoverage, { posts: 1, likes: 1, comments: 1, engagement: 1 });
  const unavailable = normalizeCompetitorInsight({ ...legacy, recentPostsData: [{ id: 'old' }] });
  assert.equal(unavailable.avgLikes, null);
  assert.equal(unavailable.avgComments, null);
  assert.equal(unavailable.engagementRate, null);
});
