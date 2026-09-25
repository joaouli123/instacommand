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
  FB_REDIRECT_URI: 'https://example.test/facebook/callback',
  FB_LOGIN_CONFIG_ID: '2156831831569762',
  FB_OAUTH_HOST: 'www.facebook.com',
  META_GRAPH_API_VERSION: 'v25.0',
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  user = { findUnique: async () => ({ metaAppId: null, metaAppSecret: null, metaClientToken: null, threadsAppId: null, threadsAppSecret: null }) };
} } };

const { getOAuthUrl, getThreadsCredentialStatus, getThreadsOAuthUrl } = require('../dist/services/instagram/auth.service');

after(() => {
  if (originalThreadsId === undefined) delete process.env.THREADS_APP_ID;
  else process.env.THREADS_APP_ID = originalThreadsId;
  if (originalThreadsSecret === undefined) delete process.env.THREADS_APP_SECRET;
  else process.env.THREADS_APP_SECRET = originalThreadsSecret;
});

test('Instagram OAuth uses the dedicated business login configuration without duplicate scopes', async () => {
  const url = new URL(await getOAuthUrl('user', 'safe-state'));
  assert.equal(url.origin, 'https://www.facebook.com');
  assert.equal(url.pathname, '/v25.0/dialog/oauth');
  assert.equal(url.searchParams.get('client_id'), 'facebook-app-id');
  assert.equal(url.searchParams.get('config_id'), '2156831831569762');
  assert.equal(url.searchParams.get('scope'), null);
  assert.equal(url.searchParams.get('state'), 'safe-state');
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
  assert.deepEqual(new Set(url.searchParams.get('scope').split(',')), new Set([
    'threads_basic', 'threads_content_publish', 'threads_delete', 'threads_manage_insights',
  ]));
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
