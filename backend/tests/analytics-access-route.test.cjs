const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let server, base, allowed = ['instagram_manage_insights'], calls = 0, reportCalls = 0, reject = false;
const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports }; };
mock('../dist/middleware/auth', { authenticate(req, res, next) { const id = req.get('X-Test-User'); if (!id) return res.sendStatus(401); req.user = { id }; next(); } });
mock('@prisma/client', { PrismaClient: class { instagramAccount = { findFirst: async ({where}) => where.id === 'owned' && where.userId === 'owner' ? { id: 'owned' } : null }; } });
for (const path of ['analytics.service', 'instagram/insights.service', 'facebook-report.service', 'threads-report.service']) mock(`../dist/services/${path}`, {});
mock('../dist/services/instagram/insights.service', { async getInstagramProfileReport(account, days) { reportCalls++; assert.equal(account.id, 'owned'); return { available: true, period: { days } }; } });
mock('../dist/services/instagram/auth.service', { async getInstagramGrantedPermissions(id) { assert.equal(id, 'owned'); calls++; if (reject) throw new Error('Unavailable'); return allowed; } });
before(async () => { const app = express(); app.use('/api/analytics', require('../dist/routes/analytics.routes').default); app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message })); await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}/api/analytics/owned/access`; });
after(async () => new Promise(resolve => server.close(resolve)));
test('access diagnostics require authentication and ownership before provider access', async () => {
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base + '?userId=owner', { headers: { 'X-Test-User': 'other' } })).status, 404);
  assert.equal(calls, 0);
});
test('access diagnostics expose only scoped booleans, never tokens or unrelated grants', async () => {
  const response = await fetch(base, { headers: { 'X-Test-User': 'owner' } });
  assert.deepEqual(await response.json(), { verified: true, instagramInsights: true, facebookInsights: false, facebookCounters: false });
});
test('failed permission inspection is unknown, not a missing authorization', async () => {
  reject = true;
  const response = await fetch(base, { headers: { 'X-Test-User': 'owner' } });
  assert.deepEqual(await response.json(), { verified: false, instagramInsights: null, facebookInsights: null, facebookCounters: null });
});
test('profile report enforces ownership and validates days before reading cached or provider data', async () => {
  const url = base.replace('/access', '/profile-report');
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { 'X-Test-User': 'other' } })).status, 404);
  assert.equal(reportCalls, 0);
  const invalid = await fetch(url + '?days=31', { headers: { 'X-Test-User': 'owner' } });
  assert.equal(invalid.status, 400);
  assert.equal(reportCalls, 0);
  const response = await fetch(url + '?days=7', { headers: { 'X-Test-User': 'owner' } });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { available: true, period: { days: 7 } });
  assert.equal(reportCalls, 1);
});
