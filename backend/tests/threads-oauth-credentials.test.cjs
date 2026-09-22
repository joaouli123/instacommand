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
  await assert.rejects(getThreadsOAuthUrl('user'), /Configure as credenciais da Meta antes de conectar o Threads/);
});

test('platform Threads credentials are used as a matching pair', async () => {
  process.env.THREADS_APP_ID = 'threads-app-id';
  process.env.THREADS_APP_SECRET = 'threads-app-secret';
  const status = await getThreadsCredentialStatus('user');
  assert.equal(status.appId, 'threads-app-id');
  assert.equal(status.appIdConfigured, true);
  assert.equal(status.appSecretConfigured, true);
  const url = new URL(await getThreadsOAuthUrl('user'));
  assert.equal(url.searchParams.get('client_id'), 'threads-app-id');
  assert.notEqual(url.searchParams.get('client_id'), 'facebook-app-id');
});
