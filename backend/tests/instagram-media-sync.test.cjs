const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let snapshot, upserts, reconciliations, storyFailure;
const replaceModule = (name, exports) => {
  require.cache[require.resolve(name)] = { exports };
};

replaceModule('@prisma/client', { MediaType: { REEL: 'REEL', CAROUSEL: 'CAROUSEL', IMAGE: 'IMAGE', STORY: 'STORY' }, PrismaClient: class {
  instagramAccount = { findUnique: async () => ({ id: 'account', igUserId: 'ig-user' }) };
  publishedPost = {
    upsert: async args => { upserts.push(args); return { id: `post-${args.create.igMediaId}` }; },
    updateMany: async args => { reconciliations.push(args); return { count: 2 }; },
    findMany: async () => [],
  };
  postInsight = { create: async () => ({}) };
} });
replaceModule('../dist/utils/instagram-api', {
  graphGet: async () => ({}),
  graphGetAllWithStatus: async path => {
    if (storyFailure && path.endsWith('/stories')) throw new Error('insights permission unavailable');
    return snapshot;
  },
});
replaceModule('../dist/services/instagram/auth.service', { getDecryptedToken: async () => 'test-token' });
replaceModule('../dist/services/notifications.service', { maybeNotifyEngagement: async () => {} });
const { syncAccountMedia } = require('../dist/services/instagram/insights.service');

beforeEach(() => {
  snapshot = { items: [{ id: 'still-here', media_type: 'IMAGE', timestamp: '2026-09-01T12:00:00Z' }], complete: true, pagesFetched: 1 };
  upserts = [];
  reconciliations = [];
  storyFailure = false;
});

test('a complete Meta snapshot soft-hides older media no longer returned', async () => {
  const result = await syncAccountMedia('account', { fetchInsights: false });
  assert.equal(result.snapshotComplete, true);
  assert.equal(result.removedMedia, 2);
  assert.deepEqual(reconciliations[0].where.igMediaId, { not: null, notIn: ['still-here'] });
  assert.deepEqual(reconciliations[0].where.mediaType, { not: 'STORY' });
  assert.equal(reconciliations[0].where.instagramDeletedAt, null);
  assert.ok(reconciliations[0].where.publishedAt.lt instanceof Date);
  assert.deepEqual(reconciliations[0].data.instagramDeletedAt instanceof Date, true);
});

test('an incomplete or capped Meta snapshot never marks absent media deleted', async () => {
  snapshot = { ...snapshot, complete: false, pagesFetched: 20 };
  const result = await syncAccountMedia('account', { fetchInsights: false });
  assert.equal(result.snapshotComplete, false);
  assert.equal(result.removedMedia, 0);
  assert.equal(reconciliations.length, 0);
});

test('media that reappears in a later sync clears its deleted marker', async () => {
  await syncAccountMedia('account', { fetchInsights: false });
  assert.equal(upserts[0].update.instagramDeletedAt, null);
});

test('active stories are saved as story media and are not confused with feed videos', async () => {
  snapshot = { items: [{ id: 'active-story', media_type: 'VIDEO', timestamp: '2026-09-20T12:00:00Z' }], complete: true, pagesFetched: 1 };
  const { syncAccountStories } = require('../dist/services/instagram/insights.service');
  const result = await syncAccountStories('account', { fetchInsights: false });
  assert.equal(result.available, true);
  assert.equal(result.importedStories, 1);
  assert.equal(upserts[0].create.mediaType, 'STORY');
  assert.equal(upserts[0].create.igMediaId, 'active-story');
});

test('missing Stories access is reported as unavailable without failing account sync', async () => {
  storyFailure = true;
  const { syncAccountStories } = require('../dist/services/instagram/insights.service');
  assert.deepEqual(await syncAccountStories('account', { fetchInsights: false }), { available: false, importedStories: 0 });
  assert.equal(upserts.length, 0);
});
