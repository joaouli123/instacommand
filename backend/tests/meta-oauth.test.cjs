const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

// Exercise the compiled callback without network, real credentials or database writes.
const originalFetch = global.fetch;
const originalInfo = console.info;
let pages, owners, writes, graphError;
const replaceModule = (name, exports) => {
  require.cache[require.resolve(name)] = { exports };
};
replaceModule('../dist/config/env', { env: {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters',
  FB_APP_ID: 'test-app', FB_APP_SECRET: 'test-secret',
  FB_REDIRECT_URI: 'https://example.test/callback', META_GRAPH_API_VERSION: 'v25.0',
} });
replaceModule('@prisma/client', { PrismaClient: class {
  user = { findUnique: async () => null };
  instagramAccount = {
    findUnique: async ({ where }) => owners[where.igUserId] || null,
    upsert: async (args) => {
      writes.push(args);
      return { id: `row-${args.where.igUserId}`, ...args.create,
        ...(owners[args.where.igUserId] ? args.update : {}) };
    },
  };
} });
replaceModule('../dist/utils/instagram-api', {
  graphGetAll: async (path) => path === '/me/accounts' ? pages : [],
  graphGet: async (path) => {
    if (graphError) throw graphError;
    if (path === '/debug_token') return { data: { granular_scopes: [] } };
    const page = pages.find(p => `/${p.id}` === path);
    if (page) return page.ig ? { instagram_business_account: { id: page.ig } } : {};
    return { id: path.slice(1), username: `profile_${path.slice(1)}` };
  },
});
const { handleOAuthCallback } = require('../dist/services/instagram/auth.service');

beforeEach(() => {
  pages = [{ id: 'page1', name: 'Page One', ig: 'ig1', access_token: 'test-page-token' }];
  owners = {}; writes = []; graphError = null;
  global.fetch = async () => ({ ok: true, json: async () => ({ access_token: 'test-user-token' }) });
  console.info = () => {};
});
after(() => { global.fetch = originalFetch; console.info = originalInfo; });

test('new professional profile becomes pending in the authorizing workspace', async () => {
  const accounts = await handleOAuthCallback('test-code', 'current');
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].userId, 'current');
  assert.equal(accounts[0].selectionPending, true);
  assert.equal(accounts[0].isActive, false);
  assert.notEqual(accounts[0].pageAccessToken, 'test-page-token');
});
test('reconnection keeps an active account active and uses upsert', async () => {
  owners.ig1 = { userId: 'current', isActive: true, selectionPending: false };
  const accounts = await handleOAuthCallback('test-code', 'current');
  assert.equal(writes.length, 1);
  assert.equal(accounts[0].isActive, true);
  assert.equal(accounts[0].selectionPending, false);
});
test('another workspace produces a conflict, never a false missing-profile result', async () => {
  owners.ig1 = { userId: 'other', isActive: true, selectionPending: false };
  await assert.rejects(handleOAuthCallback('test-code', 'current'), /META_ACCOUNT_WORKSPACE_CONFLICT/);
  assert.equal(writes.length, 0);
});
test('a conflicting account does not block a new account in the same authorization', async () => {
  owners.ig1 = { userId: 'other', isActive: true, selectionPending: false };
  pages.push({ id: 'page2', name: 'Page Two', ig: 'ig2' });
  const accounts = await handleOAuthCallback('test-code', 'current');
  assert.deepEqual(accounts.map(a => a.igUserId), ['ig2']);
  assert.equal(writes.length, 1);
});
test('a Page with no linked Instagram does not create a fictitious account', async () => {
  delete pages[0].ig;
  assert.deepEqual(await handleOAuthCallback('test-code', 'current'), []);
  assert.equal(writes.length, 0);
});
test('Graph failures are not returned as an empty successful discovery', async () => {
  graphError = new Error('Graph permission failure');
  await assert.rejects(handleOAuthCallback('test-code', 'current'), /Graph permission failure/);
  assert.equal(writes.length, 0);
});
