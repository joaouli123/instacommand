const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const originalThreadsId = process.env.THREADS_APP_ID;
const originalThreadsSecret = process.env.THREADS_APP_SECRET;
delete process.env.THREADS_APP_ID;
delete process.env.THREADS_APP_SECRET;

require.cache[require.resolve('../dist/config/env')] = { exports: { env: {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters',
  FB_APP_ID: 'facebook-app-id',
  FB_APP_SECRET: 'facebook-app-secret',
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  user = { findUnique: async () => ({ metaAppId: null, metaAppSecret: null, metaClientToken: null, threadsAppId: null, threadsAppSecret: null }) };
} } };

const { getThreadsCredentialStatus, getThreadsOAuthUrl } = require('../dist/services/instagram/auth.service');

after(() => {
  if (originalThreadsId === undefined) delete process.env.THREADS_APP_ID;
  else process.env.THREADS_APP_ID = originalThreadsId;
  if (originalThreadsSecret === undefined) delete process.env.THREADS_APP_SECRET;
  else process.env.THREADS_APP_SECRET = originalThreadsSecret;
});

test('missing Threads app config never falls back to the Facebook app', async () => {
  const status = await getThreadsCredentialStatus('user');
  assert.equal(status.appId, '');
  assert.equal(status.appIdConfigured, false);
  assert.equal(status.appSecretConfigured, false);
  assert.equal(status.credentialSource, 'missing');
  await assert.rejects(getThreadsOAuthUrl('user'), error => error.statusCode === 503 && error.message === 'THREADS_OAUTH_NOT_CONFIGURED');
});

test('platform Threads credentials are used as a matching pair', async () => {
  process.env.THREADS_APP_ID = 'threads-app-id';
  process.env.THREADS_APP_SECRET = 'threads-app-secret';
  const status = await getThreadsCredentialStatus('user');
  assert.equal(status.appId, 'threads-app-id');
  assert.equal(status.appIdConfigured, true);
  assert.equal(status.appSecretConfigured, true);
  assert.equal(status.platformConfigured, true);
  assert.equal(status.credentialSource, 'platform');
  const url = new URL(await getThreadsOAuthUrl('user'));
  assert.equal(url.searchParams.get('client_id'), 'threads-app-id');
  assert.notEqual(url.searchParams.get('client_id'), 'facebook-app-id');
});

test('a partial server configuration is reported and never mixed with workspace credentials', async () => {
  process.env.THREADS_APP_ID = 'threads-app-id';
  delete process.env.THREADS_APP_SECRET;
  const status = await getThreadsCredentialStatus('user');
  assert.equal(status.platformConfigured, false);
  assert.equal(status.platformPartiallyConfigured, true);
  assert.equal(status.credentialSource, 'missing');
  assert.equal(status.appIdConfigured, false);
});
