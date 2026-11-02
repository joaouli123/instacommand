const { test } = require('node:test');
const assert = require('node:assert/strict');
const health = require('../dist/utils/graph-health');

const headers = (values) => ({ get: (name) => values[name] ?? null });

test('temporary Graph failures are retried, permanent ones are not', () => {
  for (const metaCode of [1, 2, 4, 17, 32, 613]) assert.equal(health.isTransientGraphError({ metaCode }), true, `code ${metaCode}`);
  for (const metaCode of [10, 100, 190, 200, 9004]) assert.equal(health.isTransientGraphError({ metaCode }), false, `code ${metaCode}`);
  assert.equal(health.isTransientGraphError({ statusCode: 503 }), true);
  assert.equal(health.isTransientGraphError({ message: 'The operation was aborted due to timeout' }), true);
  assert.equal(health.isTransientGraphError(new Error('Mídia inválida')), false);
});

test('usage is kept per customer token, and the app-wide window counts for everyone', () => {
  health.resetGraphUsage();
  health.recordGraphUsage('token-of-customer-a-000000000000', headers({ 'x-business-use-case-usage': JSON.stringify({ 123: [{ call_count: 95, total_time: 10 }] }) }));
  assert.equal(health.graphUsagePercent('token-of-customer-a-000000000000'), 95);
  // Another customer is not slowed down by customer A's business limit.
  assert.equal(health.graphUsagePercent('token-of-customer-b-111111111111'), 0);
  health.recordGraphUsage('token-of-customer-b-111111111111', headers({ 'x-app-usage': JSON.stringify({ call_count: 40, total_cputime: 92, total_time: 12 }) }));
  assert.equal(health.graphUsagePercent('token-of-customer-b-111111111111'), 92);
  assert.equal(health.graphUsagePercent('token-of-customer-a-000000000000'), 95);
  health.resetGraphUsage();
});
