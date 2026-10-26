const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { consumeOAuthNonce } = require('../dist/utils/oauth-nonce');
test('verified OAuth states and handoffs are consumed once, including concurrent callbacks', async () => {
  const used = new Set(), keys = [];
  const store = { set: async (key, value, expiry, ttl, condition) => {
    keys.push(key); assert.equal(expiry, 'EX'); assert.equal(condition, 'NX'); assert.ok(ttl > 0 && ttl <= 720);
    if (used.has(key)) return null; used.add(key); return 'OK';
  } };
  const claims = { nonce: randomUUID(), exp: Math.floor(Date.now() / 1000) + 120 };
  const results = await Promise.all(Array.from({ length: 12 }, () => consumeOAuthNonce(claims, 'meta', store)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.ok(keys.every(key => !key.includes(claims.nonce)));
});
test('missing/expired nonces and failed stores cannot authorize an OAuth replay', async () => {
  let calls = 0;
  const store = { set: async () => { calls++; throw new Error('unavailable'); } };
  for (const claims of [{}, { nonce: randomUUID(), exp: 1 }, { nonce: 'untrusted', exp: Math.floor(Date.now() / 1000) + 60 }]) assert.equal(await consumeOAuthNonce(claims, 'meta', store), false);
  assert.equal(calls, 0);
  assert.equal(await consumeOAuthNonce({ nonce: randomUUID(), exp: Math.floor(Date.now() / 1000) + 60 }, 'oauth_session', store), false);
});
