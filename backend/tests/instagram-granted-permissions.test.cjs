const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
let debug;
const key = crypto.createHash('sha256').update('test-only-key').digest();
const iv = Buffer.alloc(16, 1);
const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
const encrypted = `${iv.toString('hex')}:${cipher.update('test-page-token', 'utf8', 'hex') + cipher.final('hex')}`;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {
  ENCRYPTION_KEY: 'test-only-key', FB_APP_ID: 'test-app', FB_APP_SECRET: 'test-secret',
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findUnique: async () => ({ userId: 'owner', pageAccessToken: encrypted }) };
  user = { findUnique: async () => ({}) };
} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async () => debug,
} };
const { getInstagramGrantedPermissions } = require('../dist/services/instagram/auth.service');
beforeEach(() => { debug = { data: { is_valid: true, scopes: ['instagram_manage_messages'] } }; });

test('only reports scopes for an authorization Meta confirms is valid', async () => {
  assert.deepEqual(await getInstagramGrantedPermissions('account'), ['instagram_manage_messages']);
  debug.data.is_valid = false;
  await assert.rejects(getInstagramGrantedPermissions('account'), /Reconecte/);
});

test('missing validity or malformed debugger data fails closed', async () => {
  for (const response of [{}, { data: { scopes: ['instagram_manage_messages'] } }]) {
    debug = response;
    await assert.rejects(getInstagramGrantedPermissions('account'), /Reconecte/);
  }
});

test('invalid scope types are never returned as permissions', async () => {
  debug.data.scopes.push(null, 12);
  assert.deepEqual(await getInstagramGrantedPermissions('account'), ['instagram_manage_messages']);
  debug.data.scopes = null;
  assert.deepEqual(await getInstagramGrantedPermissions('account'), []);
});
