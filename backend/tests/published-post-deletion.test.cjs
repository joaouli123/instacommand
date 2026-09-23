const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

let graphDeletes;
const originalFetch = global.fetch;
const originalThreadsId = process.env.THREADS_APP_ID;
const originalThreadsSecret = process.env.THREADS_APP_SECRET;

require.cache[require.resolve('../dist/config/env')] = { exports: { env: {
  META_GRAPH_API_VERSION: 'v25.0', ENCRYPTION_KEY: 'test-only-key',
  MEDIA_UPLOAD_DIR: 'uploads', MEDIA_PUBLIC_URL: 'https://media.example.test/uploads',
  FRONTEND_URL: 'https://app.example.test',
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphPost: async () => ({}), graphGet: async () => ({}),
  graphDelete: async (path, token) => { graphDeletes.push({ path, token }); return { success: true }; },
} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedToken: async id => `page-token:${id}`,
  getDecryptedThreadsToken: async id => `threads-token:${id}`,
} };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: { notifyPublishFailure: async () => {} } };

const { deleteFacebookPost, deleteThreadsPost } = require('../dist/services/instagram/publish.service');

beforeEach(() => { graphDeletes = []; });
after(() => {
  global.fetch = originalFetch;
  if (originalThreadsId === undefined) delete process.env.THREADS_APP_ID;
  else process.env.THREADS_APP_ID = originalThreadsId;
  if (originalThreadsSecret === undefined) delete process.env.THREADS_APP_SECRET;
  else process.env.THREADS_APP_SECRET = originalThreadsSecret;
});

test('Facebook deletion uses the stored Page token and exact post ID', async () => {
  assert.deepEqual(await deleteFacebookPost('page_post_123', 'account-1'), { success: true });
  assert.deepEqual(graphDeletes, [{ path: '/page_post_123', token: 'page-token:account-1' }]);
});

test('Threads deletion uses DELETE with the connected account token', async () => {
  let requested;
  global.fetch = async (url, options) => {
    requested = { url: new URL(url), options };
    return { ok: true, json: async () => ({ success: true, deleted_id: 'thread-456' }) };
  };
  assert.deepEqual(await deleteThreadsPost('thread-456', 'threads-1'), { success: true, deleted_id: 'thread-456' });
  assert.equal(requested.url.origin, 'https://graph.threads.net');
  assert.equal(requested.url.pathname, '/thread-456');
  assert.equal(requested.url.searchParams.get('access_token'), 'threads-token:threads-1');
  assert.equal(requested.options.method, 'DELETE');
});

test('Threads deletion surfaces API refusal instead of reporting success', async () => {
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Permission denied' } }) });
  await assert.rejects(deleteThreadsPost('thread-456', 'threads-1'), /Permission denied/);
});
