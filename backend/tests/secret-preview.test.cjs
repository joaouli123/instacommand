const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const ENCRYPTION_KEY = 'test-only-encryption-key-32-characters';
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(ENCRYPTION_KEY).digest(), iv);
  return `${iv.toString('hex')}:${cipher.update(text, 'utf8', 'hex')}${cipher.final('hex')}`;
};
let user = {};
require.cache[require.resolve('../dist/config/env')] = { exports: { env: { ENCRYPTION_KEY, GEMINI_MODEL: 'gemini-2.5-flash', GEMINI_API_KEY: '' } } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class { user = { findUnique: async () => user }; } } };
const { maskSecret, getAiCredentialStatus, getMetaCredentialStatus } = require('../dist/services/instagram/auth.service');

test('saved secrets show only their first characters followed by asterisks', () => {
  assert.equal(maskSecret('AIzaSyD-1234567890abcdefghijklmnop'), 'AIza************');
  assert.equal(maskSecret('short-key12'), 'sh************');
  assert.equal(maskSecret('abc'), '************');
  assert.equal(maskSecret(''), null);
  assert.equal(maskSecret(null), null);
});

test('settings status reveals a masked preview of the user own keys, never the full value', async () => {
  const geminiKey = 'AIzaSyD-very-secret-key-000000000000';
  user = { geminiApiKey: encrypt(geminiKey), geminiModel: null, metaAppId: '123', metaAppSecret: encrypt('0123456789abcdef0123456789abcdef'), metaClientToken: null };
  const ai = await getAiCredentialStatus('u1');
  assert.equal(ai.apiKeyPreview, 'AIza************');
  assert.equal(JSON.stringify(ai).includes(geminiKey), false);
  const meta = await getMetaCredentialStatus('u1');
  assert.equal(meta.appSecretPreview, '0123************');
  assert.equal(meta.clientTokenPreview, null);
});

test('platform-owned keys are never previewed to workspaces', async () => {
  const { env } = require('../dist/config/env');
  env.GEMINI_API_KEY = 'AIzaSyPLATFORM-key-0000000000000000';
  env.FB_APP_ID = 'platform-app';
  env.FB_APP_SECRET = 'platform-secret-0000000000';
  user = { geminiApiKey: null, geminiModel: null };
  const ai = await getAiCredentialStatus('u1');
  assert.equal(ai.apiKeyConfigured, true);
  assert.equal(ai.source, 'server');
  assert.equal(ai.apiKeyPreview, null);
  assert.equal((await getMetaCredentialStatus('u1')).appSecretPreview, null);
});
