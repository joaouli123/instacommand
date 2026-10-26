const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const express = require('express');
let server, url;
let reads = 0, mutations = 0;
const secret = 'isolated-callback-test-secret-not-a-real-key';
const mock = (name, exports) => { require.cache[require.resolve(name)] = { exports }; };
before(async () => {
  mock('../dist/config/env', { env: { THREADS_APP_SECRET: secret, FRONTEND_URL: 'https://example.test' } });
  mock('../dist/lib/prisma', { getPrisma: () => ({
    threadsAccount: { findMany: async ({ where }) => { reads++; assert.equal(where.threadsUserId, '1784001234567'); return [{ id: 'isolated-account' }]; }, deleteMany: () => { mutations++; return {}; } },
    scheduledPost: { updateMany: () => { mutations++; return {}; } },
    $transaction: async () => {},
  }) });
  mock('../dist/services/instagram/auth.service', {});
  mock('../dist/services/account-sync.service', {});
  mock('../dist/services/x.service', {});
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../dist/routes/auth.routes').default);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${server.address().port}/auth`;
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
const send = (path, body) => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('public uninstall/deletion cannot remove connections using an unsigned user_id', async () => {
  for (const path of ['/threads/uninstall?user_id=1784001234567', '/threads/delete?user_id=1784001234567']) {
    assert.equal((await send(path, { user_id: '1784001234567' })).status, 401);
    assert.equal((await send(path, { signed_request: 'forged.payload' })).status, 401);
  }
  assert.equal(reads, 0); assert.equal(mutations, 0);
});
test('signed recent provider deletion is scoped to its verified identity', async () => {
  const payload = Buffer.from(JSON.stringify({ user_id: '1784001234567', algorithm: 'HMAC-SHA256', issued_at: Math.floor(Date.now() / 1000) })).toString('base64url');
  const signed_request = `${createHmac('sha256', secret).update(payload).digest('base64url')}.${payload}`;
  const res = await send('/threads/delete', { signed_request, user_id: 'untrusted-extra-identity' });
  assert.equal(res.status, 200);
  assert.equal(reads, 1); assert.equal(mutations, 2);
  assert.ok((await res.json()).confirmation_code);
});
