const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let server, baseUrl, instagramReads = 0;
const calls = [];
const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports }; };
mock('../dist/middleware/auth', { authenticate: (req, res, next) => {
  const id = req.get('X-Test-User');
  if (!id) return res.status(401).json({ error: 'Unauthorized' });
  req.user = { id }; next();
} });
mock('@prisma/client', { PrismaClient: class {
  instagramAccount = { findFirst: async () => { instagramReads++; return null; } };
} });
mock('../dist/services/analytics.service', {});
mock('../dist/services/instagram/insights.service', {});
mock('../dist/services/instagram/auth.service', {});
mock('../dist/services/facebook-report.service', {});
mock('../dist/services/threads-report.service', { getThreadsReport: async (userId, accountId, days) => {
  calls.push({ userId, accountId, days });
  if (accountId === 'provider-error') throw new Error('provider unavailable');
  return userId === 'owner' && accountId === 'threads-account'
    ? { network: 'THREADS', account: { id: accountId }, period: { days } } : null;
} });
before(async () => {
  const app = express();
  app.use('/api/analytics', require('../dist/routes/analytics.routes').default);
  app.use((error, req, res, next) => res.status(502).json({ error: error.message }));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/analytics/networks/threads/`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
test('Threads route reaches its service before Instagram ownership middleware', async () => {
  const response = await fetch(`${baseUrl}threads-account?days=7`, { headers: { 'X-Test-User': 'owner' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { network: 'THREADS', account: { id: 'threads-account' }, period: { days: 7 } });
  assert.deepEqual(calls.at(-1), { userId: 'owner', accountId: 'threads-account', days: 7 });
  assert.equal(instagramReads, 0);
});
test('anonymous requests are rejected before the service', async () => {
  const count = calls.length;
  assert.equal((await fetch(`${baseUrl}threads-account`)).status, 401);
  assert.equal(calls.length, count);
});
test('ownership lookup receives the authenticated user, not query input', async () => {
  const response = await fetch(`${baseUrl}threads-account?userId=owner`, { headers: { 'X-Test-User': 'other' } });
  assert.equal(response.status, 404);
  assert.equal(calls.at(-1).userId, 'other');
});
test('unsupported periods are rejected before contacting the service', async () => {
  const count = calls.length;
  for (const days of ['0', '-1', '365', '7.5', 'invalid']) {
    assert.equal((await fetch(`${baseUrl}threads-account?days=${days}`, { headers: { 'X-Test-User': 'owner' } })).status, 400);
  }
  assert.equal(calls.length, count);
});
test('missing account and provider failure retain distinct errors', async () => {
  assert.equal((await fetch(`${baseUrl}missing`, { headers: { 'X-Test-User': 'owner' } })).status, 404);
  assert.equal((await fetch(`${baseUrl}provider-error`, { headers: { 'X-Test-User': 'owner' } })).status, 502);
});
