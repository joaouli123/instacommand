const { test } = require('node:test');
const assert = require('node:assert/strict');
const calls = [];
let behavior = () => ({ data: [] }), tokenCalls = 0;
const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports }; };
mock('@prisma/client', { PrismaClient: class {}, MediaType: {} });
mock('../dist/utils/instagram-api', { graphGet: async (path, token, params) => { calls.push({ path, params }); return behavior(params); } });
mock('../dist/services/instagram/auth.service', { getDecryptedToken: async () => { tokenCalls++; return 'fixture-only'; } });
mock('../dist/services/notifications.service', {});
const { getProfilePeriodInsights, getInstagramProfileReport, getAudienceDemographics } = require('../dist/services/instagram/insights.service');
const now = new Date('2026-09-28T06:45:00Z');
const field = (name, value) => ({ name, total_value: { value } });
const followers = results => ({ name: 'follows_and_unfollows', total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results }] } });
test('profile totals use an explicit interval and do not substitute sums or the latest snapshot', async () => {
  calls.length = 0;
  behavior = ({ metric }) => ({ data: metric.startsWith('views') ? [field('views', 20994), field('reach', 7699), field('accounts_engaged', 191), field('total_interactions', 580)]
    : metric.startsWith('likes') ? [field('likes', 402), field('comments', 21), field('shares', 41), field('saves', 9), field('replies', 65), field('reposts', 1)]
    : metric === 'profile_links_taps' ? [field(metric, 0)]
    : [followers([{ dimension_values: ['FOLLOWER'], value: 42 }, { dimension_values: ['NON_FOLLOWER'], value: 48 }])] });
  const result = await getProfilePeriodInsights('owned', 'fixture', 30, now);
  assert.equal(result.metrics.interactions, 580); // Component sum is not the provider definition.
  assert.equal(result.metrics.profileLinkTaps, 0);
  assert.equal(result.metrics.reach, 7699);
  assert.deepEqual(result.followers, { gained: 42, lost: 48, net: -6 });
  assert.equal(result.frequency, 20994 / 7699);
  assert.equal(result.engagementRate, 191 / 7699 * 100);
  assert.equal(calls.length, 5);
  assert.ok(calls.every(({ params }) => params.until - params.since === 30 * 86400 && params.until === now.getTime() / 1000));
  assert.equal(calls.find(({ params }) => params.metric === 'follows_and_unfollows').params.breakdown, 'follow_type');
});
test('long publication ranges explicitly cap the profile window without adding overlapping reach', async () => {
  behavior = () => ({ data: [field('reach', 100)] });
  for (const days of [7, 30, 90, 365, 730]) {
    calls.length = 0;
    const result = await getProfilePeriodInsights('owned', 'fixture', days, now);
    assert.equal(result.period.days, Math.min(days, 30));
    assert.equal(result.period.requestedDays, days);
    assert.equal(result.period.limited, days > 30);
    assert.equal(result.metrics.reach, 100);
    assert.ok(calls.every(({ params }) => params.until - params.since <= 2592000));
  }
  calls.length = 0;
  await assert.rejects(getProfilePeriodInsights('owned', 'fixture', 31, now));
  assert.equal(calls.length, 0);
});
test('absent, invalid and daily-only values stay missing; incomplete follow breakdown never fabricates net', async () => {
  behavior = ({ metric }) => ({ data: metric === 'follows_and_unfollows' ? [followers([{ dimension_values: ['FOLLOWER'], value: 0 }])]
    : [field('likes', '8'), field('reach', -1), field('views', NaN), { name: 'saves', values: [{ value: 8 }] }] });
  const result = await getProfilePeriodInsights('owned', 'fixture', 7, now);
  assert.ok(Object.values(result.metrics).every(value => value === null));
  assert.deepEqual(result.followers, { gained: 0, lost: null, net: null });
  assert.equal(result.frequency, null);
  assert.equal(result.engagementRate, null);
  assert.equal(result.available, true);
});
test('empty and permission-denied reports do not pretend zero or multiply failed reads', async () => {
  calls.length = 0;
  behavior = () => { throw Object.assign(new Error('Fixture denied'), { metaCode: 190 }); };
  const result = await getProfilePeriodInsights('owned', 'fixture', 30, now);
  assert.equal(result.available, false);
  assert.ok(result.message);
  assert.equal(calls.length, 5);
  assert.deepEqual(result.followers, { gained: null, lost: null, net: null });
});
test('zero reach leaves ratio undefined rather than infinite or a fabricated zero percent', async () => {
  behavior = () => ({ data: [field('reach', 0), field('views', 0), field('accounts_engaged', 0)] });
  const result = await getProfilePeriodInsights('owned', 'fixture', 30, now);
  assert.equal(result.frequency, null);
  assert.equal(result.engagementRate, null);
});
test('daily reach uses provider day boundaries, keeps zero and never replaces unique period reach', async () => {
  behavior = ({ metric_type }) => ({ data: metric_type === 'time_series' ? [{ name: 'reach', values: [
    { value: 0, end_time: '2026-09-26T07:00:00Z' }, { value: 20, end_time: '2026-09-27T07:00:00Z' },
    { value: 20, end_time: '2026-09-27T07:00:00Z' }, { value: 999, end_time: '2020-01-01T07:00:00Z' }, { value: null, end_time: '2026-09-28T07:00:00Z' },
  ] }] : [field('reach', 15)] });
  const result = await getProfilePeriodInsights('owned', 'fixture', 7, now);
  assert.equal(result.metrics.reach, 15);
  assert.deepEqual(result.dailyReach, [{ date: '2026-09-25', value: 0 }, { date: '2026-09-26', value: 20 }]);
});
test('profile cache deduplicates reads, isolates accounts/periods and invalidates after a sync', async () => {
  tokenCalls = 0; behavior = () => ({ data: [field('reach', 1)] });
  const account = { id: 'cache-fixture', igUserId: 'ig-fixture', lastSyncAt: new Date('2026-09-27') };
  await Promise.all([getInstagramProfileReport(account, 30), getInstagramProfileReport(account, 30)]);
  assert.equal(tokenCalls, 1);
  await getInstagramProfileReport({ ...account, id: 'other-fixture' }, 30);
  await getInstagramProfileReport(account, 7);
  await getInstagramProfileReport({ ...account, lastSyncAt: now }, 30);
  assert.equal(tokenCalls, 4);
});
test('engaged demographics uses the current rolling-month parameter; followers keeps its supported window', async () => {
  behavior = () => ({ data: [] });
  for (const audience of ['followers', 'engaged']) {
    calls.length = 0;
    assert.deepEqual(await getAudienceDemographics('owned', 'fixture', audience), []);
    assert.equal(calls.length, 4);
    assert.ok(calls.every(({ params }) => params.timeframe === (audience === 'engaged' ? 'this_month' : 'last_30_days')));
  }
});
test('the report compares with the window of the same length right before it', async () => {
  const { getProfileReportWithComparison } = require('../dist/services/instagram/insights.service');
  const end = now.getTime() / 1000;
  behavior = ({ until }) => ({ data: [field('reach', until === end ? 1000 : 800), field('accounts_engaged', 50)] });
  calls.length = 0;
  const report = await getProfileReportWithComparison('owned', 'fixture', 7, now);
  assert.equal(report.metrics.reach, 1000);
  assert.equal(report.previous.metrics.reach, 800);
  assert.equal(report.previous.period.until, new Date((end - 7 * 86400) * 1000).toISOString());
  // A previous window Meta cannot answer is omitted, never shown as zero.
  behavior = ({ until }) => ({ data: until === end ? [field('reach', 1000)] : [] });
  assert.equal((await getProfileReportWithComparison('owned', 'fixture', 7, now)).previous, null);
});
