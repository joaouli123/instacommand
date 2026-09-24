const test = require('node:test');
const assert = require('node:assert/strict');

const requests = [];
const labels = { gender: 'F', age: '25-34', country: 'BR', city: 'Curitiba' };
require.cache[require.resolve('@prisma/client')] = { exports: { MediaType: { STORY: 'STORY' }, PrismaClient: class {} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path, token, params) => {
    requests.push({ path, token, params });
    return { data: [{ name: params.metric, total_value: { breakdowns: [{
      dimension_keys: [params.breakdown],
      results: [{ dimension_values: [labels[params.breakdown]], value: 42 }],
    }] } }] };
  },
  graphGetAllWithStatus: async () => ({ items: [], complete: true, pagesFetched: 1 }),
} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getDecryptedToken: async () => 'token' } };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: { maybeNotifyEngagement: async () => {} } };

const { getAudienceDemographics } = require('../dist/services/instagram/insights.service');

test('audience queries use the currently supported demographic metric and preserve breakdown labels', async () => {
  const result = await getAudienceDemographics('ig-user', 'access-token', 'followers');
  assert.deepEqual(requests.map(({ params }) => params.breakdown), ['gender', 'age', 'country', 'city']);
  assert.ok(requests.every(({ path, params }) => path === '/ig-user/insights'
    && params.metric === 'follower_demographics'
    && params.period === 'lifetime'
    && params.metric_type === 'total_value'
    && params.timeframe === 'last_30_days'));
  assert.deepEqual(result.map((row) => [row.name, row.values[0].value]), [
    ['follower_demographics_gender', { F: 42 }],
    ['follower_demographics_age', { '25-34': 42 }],
    ['follower_demographics_country', { BR: 42 }],
    ['follower_demographics_city', { Curitiba: 42 }],
  ]);
});
