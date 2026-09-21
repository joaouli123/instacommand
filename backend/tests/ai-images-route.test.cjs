const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let server, base, calls = 0;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {} } };
require.cache[require.resolve('../dist/middleware/auth')] = { exports: { authenticate: (req, res, next) => { if (!req.headers['x-test-auth']) return res.sendStatus(401); req.user = { id: 'fixture-user' }; next(); } } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getAiCredentials: async user => { assert.equal(user, 'fixture-user'); return { source: 'workspace' }; } } };
require.cache[require.resolve('../dist/services/ai.service')] = { exports: { generateAiContent: async input => { calls++; assert.equal(input.images.length, 1); assert.equal(input.context, undefined); return { summary: 'Mock result' }; } } };
const router = require('../dist/routes/ai.routes').default;
before(async () => { const app = express(); app.use(router); app.use((error, req, res, next) => res.status(error.statusCode || 400).json({ error: 'invalid request' })); server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); }); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(resolve => server.close(resolve)); });
const form = (consent = 'true', bytes = Buffer.from('89504e470d0a1a0a', 'hex')) => { const body = new FormData(); body.append('images', new Blob([bytes], { type: 'image/png' }), 'fixture.png'); body.append('platform', 'Instagram'); body.append('consent', consent); return body; };
test('image endpoint requires authentication before provider use', async () => {
  const previous = calls; const response = await fetch(`${base}/analyze-images`, { method: 'POST', body: form() });
  assert.equal(response.status, 401); assert.equal(calls, previous);
});
test('consent and actual file signatures are checked before provider use', async () => {
  const previous = calls;
  for (const body of [form('false'), form('true', Buffer.from('not an image'))]) {
    const response = await fetch(`${base}/analyze-images`, { method: 'POST', headers: { 'x-test-auth': 'yes' }, body });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, previous);
});
test('authenticated multipart request uses workspace credentials and returns analysis', async () => {
  const response = await fetch(`${base}/analyze-images`, { method: 'POST', headers: { 'x-test-auth': 'yes' }, body: form() });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { result: { summary: 'Mock result' } });
});
