const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let server, base, allowed = ['instagram_manage_insights'], calls = 0, reject = false;
const mock = (path, exports) => { require.cache[require.resolve(path)] = { exports }; };
mock('../dist/middleware/auth', { authenticate(req, res, next) { const id = req.get('X-Test-User'); if (!id) return res.sendStatus(401); req.user = { id }; next(); } });
mock('@prisma/client', { PrismaClient: class { instagramAccount = { findFirst: async ({where}) => where.id === 'owned' && where.userId === 'owner' ? { id: 'owned' } : null }; } });
for (const path of ['analytics.service', 'instagram/insights.service', 'facebook-report.service', 'threads-report.service']) mock(`../dist/services/${path}`, {});
mock('../dist/services/instagram/auth.service', { async getInstagramGrantedPermissions(id) { assert.equal(id, 'owned'); calls++; if (reject) throw new Error('Unavailable'); return allowed; } });
before(async () => { const app = express(); app.use('/api/analytics', require('../dist/routes/analytics.routes').default); await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}/api/analytics/owned/access`; });
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
