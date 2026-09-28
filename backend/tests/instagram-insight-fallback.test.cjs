const { test } = require('node:test');
const assert = require('node:assert/strict');
let behavior;
const calls = [];
const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports }; };
mock('@prisma/client', { PrismaClient: class {}, MediaType: {} });
mock('../dist/utils/instagram-api', { graphGet: async (path, token, params) => { calls.push(params.metric); return behavior(params.metric); } });
mock('../dist/services/instagram/auth.service', {});
mock('../dist/services/notifications.service', {});
const { getPostInsights } = require('../dist/services/instagram/insights.service');
const fail = code => { throw Object.assign(new Error('Fixture provider failure'), { metaCode: code }); };
test('one unsupported media metric does not hide supported counters or a real zero', async () => {
  calls.length = 0;
  behavior = metric => metric === 'saved,replies' || metric === 'replies' ? fail(100) : { data: [{ name: metric === 'saved' ? 'saved' : metric.split(',')[0], values: [{ value: 0 }] }] };
  const result = await getPostInsights('owned-media', 'fixture');
  assert.ok(result.some(item => item.name === 'saved' && item.values[0].value === 0));
  assert.equal(calls.filter(item => item === 'saved').length, 1);
  assert.equal(calls.length, 6);
});
test('permission, expiry and rate limit failures never fan out into per-field reads', async () => {
  for (const code of [10, 190, 4, 613]) {
    calls.length = 0; behavior = () => fail(code);
    assert.deepEqual(await getPostInsights('owned-media', 'fixture'), []);
    assert.equal(calls.length, 4);
  }
});
test('an account-wide error during fallback stops the remaining fields in that group', async () => {
  calls.length = 0;
  behavior = metric => metric === 'likes,comments,shares' ? fail(100) : metric === 'likes' ? fail(4) : { data: [] };
  await getPostInsights('owned-media', 'fixture');
  assert.ok(calls.includes('likes'));
  assert.ok(!calls.includes('comments'));
  assert.ok(!calls.includes('shares'));
});
