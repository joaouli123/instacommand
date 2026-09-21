const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let row, claims, writes, updates, publishedRows, failEnrichment;
const clone = value => structuredClone(value);
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  scheduledPost = {
    findUnique: async () => clone(row),
    updateMany: async ({ where, data }) => {
      claims++;
      if (row.status !== where.status || +row.updatedAt !== +where.updatedAt) return { count: 0 };
      Object.assign(row, data, { updatedAt: new Date(+row.updatedAt + 1) });
      return { count: 1 };
    },
    update: async ({ data }) => { updates.push(data); Object.assign(row, data); return clone(row); },
  };
  publishedPost = {
    create: async ({ data }) => { publishedRows.push(data); return { id: 'published', ...data }; },
    findUnique: async () => ({ id: 'published' }),
  };
} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphPost: async (path) => { writes.push(path); return { id: path.endsWith('/media_publish') ? 'remote-post' : 'container' }; },
  graphGet: async (path) => {
    if (path === '/remote-post' && failEnrichment) throw new Error('enrichment unavailable');
    return { status_code: 'FINISHED', permalink: 'https://example.test/post' };
  },
} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getDecryptedToken: async () => 'fixture' } };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: { notifyPublishFailure: async () => {} } };
const { publishPost } = require('../dist/services/instagram/publish.service');
beforeEach(() => {
  claims = 0; writes = []; updates = []; publishedRows = []; failEnrichment = false;
  row = { id: 'post', status: 'SCHEDULED', updatedAt: new Date('2026-01-01'), scheduledFor: new Date('2026-01-01'),
    accountId: 'account', userId: 'user', account: { igUserId: 'ig' }, mediaType: 'IMAGE',
    mediaUrls: ['https://example.test/image.jpg'], caption: 'Fixture', platforms: ['INSTAGRAM'] };
});
test('queued drafts, failed, processing and published items never make remote writes', async () => {
  for (const status of ['DRAFT', 'FAILED', 'PROCESSING', 'PUBLISHED']) {
    row.status = status;
    assert.equal(await publishPost('post', {}), null);
  }
  assert.equal(claims, 0); assert.deepEqual(writes, []);
});
test('future schedules and stale scheduled dates are skipped', async () => {
  row.scheduledFor = new Date(Date.now() + 60000);
  assert.equal(await publishPost('post', {}), null);
  row.scheduledFor = new Date('2026-01-01');
  assert.equal(await publishPost('post', { scheduledFor: '2025-01-01T00:00:00.000Z' }), null);
  assert.equal(claims, 0); assert.deepEqual(writes, []);
});
test('two simultaneous manual sends have only one owner and one remote publish', async () => {
  row.status = 'DRAFT';
  const results = await Promise.allSettled([publishPost('post'), publishPost('post')]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
  assert.equal(writes.filter(x => x.endsWith('/media_publish')).length, 1);
  assert.equal(publishedRows.length, 1);
  assert.equal(updates.some(x => x.status === 'FAILED'), false);
});
test('duplicate queue deliveries skip the losing claim without resetting winner', async () => {
  const results = await Promise.all([publishPost('post', {}), publishPost('post', {})]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(writes.filter(x => x.endsWith('/media_publish')).length, 1);
  assert.equal(row.status, 'PUBLISHED');
});
test('manual publish can send a future scheduled post immediately', async () => {
  row.scheduledFor = new Date(Date.now() + 60000);
  assert.equal((await publishPost('post')).igMediaId, 'remote-post');
});
test('failure fetching permalink does not lose a successful Instagram publication', async () => {
  failEnrichment = true;
  const result = await publishPost('post', { scheduledFor: row.scheduledFor.toISOString() });
  assert.equal(result.igMediaId, 'remote-post');
  assert.equal(row.status, 'PUBLISHED');
  assert.equal(row.errorMessage, null);
  await publishPost('post');
  assert.equal(writes.filter(x => x.endsWith('/media_publish')).length, 1);
});
