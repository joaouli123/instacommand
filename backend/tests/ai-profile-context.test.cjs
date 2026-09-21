const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAiProfileContext, aiProfileSelect } = require('../dist/services/ai-profile-context');
const fixture = () => ({ igUsername: 'fixture', igName: 'Fixture', igBio: 'Example',
  igFollowersCount: 12, igFollowsCount: 0, igMediaCount: 2, lastSyncAt: new Date('2026-01-01'),
  accessToken: 'must-not-leak', userId: 'must-not-leak', pageName: 'Not Instagram',
  profileInsights: [{ followers: 0, reach: 0, impressions: 50, profileViews: 0, collectedAt: new Date('2026-01-01'), availableMetrics: [] }],
  publishedPosts: [{ mediaType: 'IMAGE', caption: 'Sample', publishedAt: new Date('2025-12-01'), insights: [
    { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0, engagement: 0, collectedAt: new Date('2026-01-01'), availableMetrics: ['likes'] },
  ] }],
});
test('AI receives confirmed zero separately from unavailable legacy counters', () => {
  const context = buildAiProfileContext(fixture());
  assert.equal(context.profileInsights[0].reach, null);
  assert.equal(context.profileInsights[0].impressions, 50);
  assert.equal(context.publishedPosts[0].insights[0].likes, 0);
  assert.equal(context.publishedPosts[0].insights[0].shares, null);
  assert.equal(context.igFollowsCount, null);
  assert.equal(context.igFollowersCount, 12);
});
test('context preserves dates and network/sample limits without forwarding secrets', () => {
  const context = buildAiProfileContext(fixture());
  assert.equal(context.sourceNetwork, 'Instagram');
  assert.equal(context.publishedPosts[0].insights[0].collectedAt.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.match(context.evidenceLimits.join(' '), /até 8/);
  assert.match(context.evidenceLimits.join(' '), /não devem ser somados/);
  assert.doesNotMatch(JSON.stringify(context), /must-not-leak|Not Instagram/);
  assert.equal(aiProfileSelect.publishedPosts.take, 8);
  assert.equal(aiProfileSelect.profileInsights.select.availableMetrics, true);
});
test('missing insights remain absent and invalid numeric observations are not evidence', () => {
  const row = fixture(); row.profileInsights = []; row.publishedPosts[0].insights = [];
  row.igFollowersCount = NaN;
  const context = buildAiProfileContext(row);
  assert.equal(context.igFollowersCount, null);
  assert.deepEqual(context.profileInsights, []);
  assert.deepEqual(context.publishedPosts[0].insights, []);
});
