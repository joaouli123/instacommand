const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const cookies = require('cookie-parser');
const bcrypt = require('bcryptjs');
const secret = 'isolated-session-boundary-fixture-not-production';
const mock = (name, exports) => { require.cache[require.resolve(name)] = { exports }; };
const used = new Set();
let url, server, reads = 0, writes = 0;
const sessions = {
  a: jwt.sign({ id: 'a', email: 'a@example.test', jti: 'browser-one' }, secret, { expiresIn: '1h' }),
  anotherBrowser: jwt.sign({ id: 'a', email: 'a@example.test', jti: 'browser-two' }, secret, { expiresIn: '1h' }),
  b: jwt.sign({ id: 'b', email: 'b@example.test' }, secret, { expiresIn: '1h' }),
};
const handoff = () => jwt.sign({ sub: 'a', purpose: 'oauth_session', binding: createHash('sha256').update(sessions.a).digest('hex'), nonce: randomUUID() }, secret, { expiresIn: '2m' });
before(async () => {
  mock('../dist/config/env', { env: { JWT_SECRET: secret, FRONTEND_URL: 'https://app.example.test', NODE_ENV: 'test' } });
  const user = { id: 'a', email: 'a@example.test', name: 'Fixture User', avatarUrl: null, password: await bcrypt.hash('fixture-password', 4) };
  mock('../dist/lib/prisma', { getPrisma: () => ({ user: {
    findUnique: async ({ where }) => { reads++; if (where.email && where.email !== user.email) return null; return { ...user, ...(where.id ? { id: where.id } : {}) }; },
    create: async () => { writes++; return user; },
  } }) });
  mock('../dist/utils/oauth-nonce', { consumeOAuthNonce: async ({ nonce }) => { if (used.has(nonce)) return false; used.add(nonce); return true; } });
  mock('../dist/services/instagram/auth.service', { getOAuthUrl: async (_id, state) => `https://provider.example.test/?state=${state}` });
  mock('../dist/services/account-sync.service', {});
  mock('../dist/services/x.service', {});
  const app = express(); app.use(express.json(), cookies());
  app.use('/api/auth', require('../dist/routes/auth.routes').default);
  app.use(require('../dist/middleware/errorHandler').errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  url = `http://127.0.0.1:${server.address().port}/api/auth`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const exchange = (token, session) => fetch(`${url}/oauth-session`, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { cookie: `instacommand_token=${session}` } : {}) }, body: JSON.stringify({ token }) });

test('a handoff cannot log in an anonymous visitor, switch workspaces or move to another browser session', async () => {
  for (const session of [undefined, sessions.b, sessions.anotherBrowser]) {
    const res = await exchange(handoff(), session);
    assert.equal(res.status, 401); assert.equal(res.headers.has('set-cookie'), false);
  }
});
test('matching handoff renews only its bound session and rejects replay', async () => {
  const token = handoff();
  const accepted = await exchange(token, sessions.a);
  assert.equal(accepted.status, 200); assert.equal((await accepted.json()).user.id, 'a');
  assert.match(accepted.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await exchange(token, sessions.a)).status, 401);
});
test('OAuth state is signed and bound to the initiating session without exposing the bearer', async () => {
  const res = await fetch(`${url}/facebook/url`, { headers: { cookie: `instacommand_token=${sessions.a}` } });
  assert.equal(res.status, 200);
  const state = new URL((await res.json()).url).searchParams.get('state');
  const payload = jwt.verify(state, secret);
  assert.equal(payload.sub, 'a'); assert.equal(payload.purpose, 'meta');
  assert.equal(payload.binding, createHash('sha256').update(sessions.a).digest('hex'));
  assert.ok(!state.includes(sessions.a));
});
test('login rejects structured SQL/NoSQL operators before database access', async () => {
  const initial = reads;
  for (const body of [{ email: { $ne: null }, password: 'fixture' }, { email: ['a@example.test'], password: 'fixture' }, { email: "' OR 1=1--", password: 'fixture' }, { email: 'a@example.test', password: { $regex: '.*' } }]) {
    const res = await fetch(`${url}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(res.status, 400);
  }
  assert.equal(reads, initial); assert.equal(writes, 0);
});
test('browser login never includes the token in JSON and logout invalidates its old cookie', async () => {
  const login = await fetch(`${url}/LOGIN/`, { method: 'POST', headers: { origin: 'https://app.example.test', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.test', password: 'fixture-password' }) });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).token, undefined);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${url}/me`, { headers: { cookie } })).status, 200);
  const logout = await fetch(`${url}/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${url}/me`, { headers: { cookie } })).status, 401);
});
