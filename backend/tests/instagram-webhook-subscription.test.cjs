const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let account, scopes, linkedIgId, writes;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {
  WEBHOOK_VERIFY_TOKEN: 'test-verification', FB_APP_SECRET: 'test-secret', BACKEND_URL: 'https://api.example.test',
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async ({ where }) => account && account.userId === where.userId ? account : null };
} } };
require.cache[require.resolve('../dist/services/ai.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedToken: async () => 'test-page-token',
  getInstagramGrantedPermissions: async () => scopes,
} };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path) => ({ id: path.slice(1), instagram_business_account: { id: linkedIgId } }),
  graphPost: async (path, token, params) => { writes.push({ path, token, params }); return { success: true }; },
} };
const { subscribeInstagramAccountToWebhooks } = require('../dist/services/automation.service');
beforeEach(() => {
  account = { id: 'account', userId: 'owner', pageId: 'page-123', igUserId: 'ig-456' };
  scopes = ['instagram_basic', 'instagram_manage_comments', 'instagram_manage_messages', 'pages_manage_metadata'];
  linkedIgId = 'ig-456';
  writes = [];
});
test('Facebook Login subscribes the verified Page, never the Instagram ID', async () => {
  assert.deepEqual(await subscribeInstagramAccountToWebhooks('owner', 'account'), { success: true });
  assert.deepEqual(writes, [{ path: '/page-123/subscribed_apps', token: 'test-page-token', params: { subscribed_fields: 'comments,messages' } }]);
});
test('subscription includes only fields granted for this account', async () => {
  scopes = ['instagram_manage_comments', 'pages_manage_metadata'];
  await subscribeInstagramAccountToWebhooks('owner', 'account');
  assert.equal(writes[0].params.subscribed_fields, 'comments');
});
test('missing webhook permission stops before subscription', async () => {
  scopes = ['instagram_manage_messages'];
  await assert.rejects(subscribeInstagramAccountToWebhooks('owner', 'account'), /Reconecte/);
  assert.equal(writes.length, 0);
});
test('missing or mismatched Page never falls back to the Instagram ID', async () => {
  account.pageId = '';
  await assert.rejects(subscribeInstagramAccountToWebhooks('owner', 'account'), /Página/);
  account.pageId = 'page-123';
  linkedIgId = 'another-instagram';
  await assert.rejects(subscribeInstagramAccountToWebhooks('owner', 'account'), /não está vinculada/);
  assert.equal(writes.length, 0);
});
test('another user cannot subscribe this account', async () => {
  await assert.rejects(subscribeInstagramAccountToWebhooks('another-owner', 'account'), /não encontrada/);
  assert.equal(writes.length, 0);
});
