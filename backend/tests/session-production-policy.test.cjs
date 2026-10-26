const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require.cache[require.resolve('../dist/config/env')] = { exports: { env: { NODE_ENV: 'production' } } };
require.cache[require.resolve('../dist/lib/prisma')] = { exports: { getPrisma: () => ({}) } };
const { asSessionPayload } = require('../dist/middleware/auth');
test('production retires legacy localStorage sessions without confusing API or OAuth tokens', () => {
  const identity = { id: 'fixture', email: 'fixture@example.test' };
  assert.equal(asSessionPayload(identity), null);
  assert.equal(asSessionPayload({ ...identity, jti: 'forged' }), null);
  assert.deepEqual(asSessionPayload({ ...identity, jti: randomUUID() }), identity);
  assert.equal(asSessionPayload({ ...identity, jti: randomUUID(), purpose: 'oauth_session' }), null);
});
