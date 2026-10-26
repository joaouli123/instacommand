const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createHmac } = require('node:crypto');
const secret = 'isolated-session-revocation-fixture-not-production';
require.cache[require.resolve('../dist/config/env')] = { exports: { env: { JWT_SECRET: secret, NODE_ENV: 'test' } } };
const { revokeSession, isSessionRevoked, sessionRevocationKey } = require('../dist/utils/session-security');
const { sharedRateBudget } = require('../dist/middleware/rateLimit');
const { verifiedBrowserAddress } = require('../dist/middleware/browser-proxy');

test('logout revokes the exact signed session, stores only its hash and sets bounded expiry', async () => {
  const token = jwt.sign({ id: 'fixture', email: 'fixture@example.test' }, secret, { expiresIn: '1h' });
  const values = new Map();
  const store = {
    get: async key => values.get(key) || null,
    set: async (key, value, mode, ttl) => { assert.equal(mode, 'EX'); assert.ok(ttl > 0 && ttl <= 3600); values.set(key, value); return 'OK'; },
  };
  assert.equal(await isSessionRevoked(token, store), false);
  await revokeSession(token, store);
  assert.equal(await isSessionRevoked(token, store), true);
  assert.equal(await isSessionRevoked('another-fixture-session', store), false);
  assert.ok(!JSON.stringify([...values]).includes(token));
  assert.match(sessionRevocationKey(token), /^session-revoked:[a-f0-9]{64}$/);
});
test('failed revocation/read storage refuses access without silently using a local fallback', async () => {
  const store = { get: async () => { throw Error('fixture-secret'); }, set: async () => { throw Error('fixture-secret'); } };
  const token = jwt.sign({ id: 'fixture' }, secret, { expiresIn: '1h' });
  for (const operation of [() => isSessionRevoked(token, store), () => revokeSession(token, store)]) {
    await assert.rejects(operation, error => error.statusCode === 503 && !error.message.includes('fixture-secret'));
  }
  await assert.rejects(() => revokeSession('forged', store));
});
test('shared rate budget is atomic across instances and never retains a raw address', async () => {
  let count = 0;
  const connection = { eval: async (script, number, key, windowMs) => {
    assert.ok(script.includes("redis.call('INCR'")); assert.ok(script.includes("redis.call('PEXPIRE'"));
    assert.equal(number, 1); assert.equal(windowMs, 900000);
    assert.match(key, /^rate-budget:[a-f0-9]{24}$/); assert.ok(!key.includes('198.51.100.7'));
    return [++count, 899000];
  } };
  const budgets = await Promise.all(Array.from({ length: 30 }, () => sharedRateBudget('login:ip:198.51.100.7', 900000, connection)));
  assert.equal(Math.max(...budgets.map(b => b.count)), 30);
  assert.equal(budgets.filter(b => b.count <= 25).length, 25);
  assert.ok(budgets.every(b => b.retryAfter === 899));
  await assert.rejects(() => sharedRateBudget('fixture', 900000, { eval: async () => [1, -1] }), error => error.statusCode === 503);
});
test('client address hop requires an authentic, recent HMAC for this method and URL', () => {
  const time = String(Math.floor(Date.now() / 1000));
  const headers = { 'x-instacommand-browser-ip': '198.51.100.7', 'x-instacommand-browser-time': time };
  const req = { method: 'POST', originalUrl: '/api/auth/login', get: name => headers[name] };
  headers['x-instacommand-browser-signature'] = createHmac('sha256', secret).update(`POST\n/api/auth/login\n198.51.100.7\n${time}`).digest('hex');
  assert.equal(verifiedBrowserAddress(req, secret), '198.51.100.7');
  assert.equal(verifiedBrowserAddress(req, 'wrong'), null);
  assert.equal(verifiedBrowserAddress({ ...req, originalUrl: '/api/auth/register' }, secret), null);
  assert.equal(verifiedBrowserAddress(req, secret, Date.now() + 31000), null);
  headers['x-instacommand-browser-signature'] = 'forged';
  assert.equal(verifiedBrowserAddress(req, secret), null);
});
