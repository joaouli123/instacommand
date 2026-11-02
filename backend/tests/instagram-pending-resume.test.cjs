const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let row, graphGets, graphPosts, queued, published, containerStatus;
const updatedAt = new Date('2026-11-02T12:00:00Z');
require.cache[require.resolve('../dist/config/env')] = { exports: { env: { MEDIA_PUBLIC_URL: 'https://media.example.test/uploads' } } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path) => { graphGets.push(path); return path === '/container-9' ? containerStatus : { permalink: 'https://instagram.com/p/x' }; },
  graphPost: async (path, token, params) => { graphPosts.push({ path, params }); return { id: 'ig-media-1' }; },
  graphDelete: async () => ({}),
} };
const matches = (where) => where.id === row.id && (!where.status || where.status === row.status) && (!where.updatedAt || where.updatedAt === row.updatedAt);
require.cache[require.resolve('@prisma/client')] = { exports: { Prisma: { DbNull: null }, PrismaClient: class {
  scheduledPost = {
    findUnique: async () => row,
    updateMany: async ({ where, data }) => { if (!matches(where)) return { count: 0 }; Object.assign(row, data, { updatedAt: new Date() }); return { count: 1 }; },
    update: async ({ data }) => { Object.assign(row, data); return row; },
  };
  instagramAccount = { findUnique: async () => ({ isActive: true, userId: 'u1' }) };
  publishedPost = { create: async ({ data }) => { published.push(data); return { id: 'pub-1', ...data }; } };
} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getDecryptedToken: async () => 'token' } };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: { notifyPublishFailure: async () => {} } };
require.cache[require.resolve('../dist/services/scheduler.service')] = { exports: { publishQueue: { add: async (name, data, opts) => { queued.push({ name, data, opts }); } } } };
require.cache[require.resolve('../dist/services/instagram/facebook-link.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/post-readiness')] = { exports: { assertPostReady: () => {} } };
require.cache[require.resolve('../dist/utils/public-media')] = { exports: { normalizeMediaUrl: value => value } };
const { resumeInstagramPublish, INSTAGRAM_CHECK_DELAYS } = require('../dist/services/instagram/publish.service');

beforeEach(() => {
  graphGets = []; graphPosts = []; queued = []; published = [];
  row = { id: 'post-1', userId: 'u1', accountId: 'acc', mediaType: 'REEL', mediaUrls: ['https://x/v.mp4'], caption: 'c', advancedSettings: null, status: 'PROCESSING', updatedAt,
    account: { igUserId: 'ig-1' }, instagramPending: { containerId: 'container-9', attempt: 1, results: { FACEBOOK: { id: 'fb-1' } }, errors: [] } };
});

test('FINISHED publishes the same container once and keeps the Facebook result', async () => {
  containerStatus = { status_code: 'FINISHED' };
  await resumeInstagramPublish('post-1', 1);
  assert.deepEqual(graphPosts.map((call) => call.path), ['/ig-1/media_publish']);
  assert.equal(graphPosts[0].params.creation_id, 'container-9');
  assert.equal(published.length, 1);
  assert.equal(published[0].facebookPostId, 'fb-1');
  assert.equal(published[0].igMediaId, 'ig-media-1');
  assert.equal(row.status, 'PUBLISHED');
  assert.equal(row.instagramPending, null);
  // The same check delivered again does nothing.
  await resumeInstagramPublish('post-1', 1);
  assert.equal(graphPosts.length, 1);
});

test('IN_PROGRESS makes one Graph call and queues the next, longer check', async () => {
  containerStatus = { status_code: 'IN_PROGRESS' };
  await resumeInstagramPublish('post-1', 1);
  assert.deepEqual(graphGets, ['/container-9']);
  assert.equal(graphPosts.length, 0);
  assert.equal(row.instagramPending.attempt, 2);
  assert.deepEqual(queued.map((job) => [job.name, job.opts.jobId]), [['instagram-check', 'post-1-ig-2']]);
  // The base delay plus a few seconds of spread, so posts due together do not check together.
  assert.ok(queued[0].opts.delay >= INSTAGRAM_CHECK_DELAYS[2] && queued[0].opts.delay < INSTAGRAM_CHECK_DELAYS[2] + 5000);
  assert.ok(row.nextCheckAt instanceof Date);
});

test('ERROR keeps the post published on the other network and shows Instagram\'s reason', async () => {
  containerStatus = { status_code: 'ERROR', status: 'Error: 2207026' };
  await resumeInstagramPublish('post-1', 1);
  assert.equal(graphPosts.length, 0);
  assert.equal(row.status, 'PUBLISHED');
  assert.match(row.errorMessage, /Instagram: O Instagram recusou a mídia: Error: 2207026/);
});

test('a stale or unknown check is ignored without calling the Graph API', async () => {
  containerStatus = { status_code: 'FINISHED' };
  await resumeInstagramPublish('post-1', 0);
  assert.equal(graphGets.length, 0);
});

test('the first stored shape (Instagram only) is still understood', () => {
  const { readPending } = require('../dist/services/instagram/publish.service');
  const pending = readPending({ containerId: 'c-1', attempt: 3, results: { FACEBOOK: { id: 'fb' } }, errors: [] });
  assert.deepEqual(pending.networks, { INSTAGRAM: { id: 'c-1' } });
  assert.equal(pending.attempt, 3);
  assert.equal(readPending(null), null);
});
