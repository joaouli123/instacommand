const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {
  MEDIA_PUBLIC_URL: 'https://media.example.test/uploads', FRONTEND_URL: 'https://app.example.test',
} } };
let result, failure, calls, writes;
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path, token, params) => {
    calls.push({ path, token, params });
    if (failure) throw failure;
    return result;
  },
  graphPost: async (path, token, params) => {
    writes.push({ path, params });
    return path.endsWith('/photos') ? { id: `photo-${writes.length}` } : { id: 'posted' };
  },
} };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: {} };
const { verifyFacebookPageLink } = require('../dist/services/instagram/facebook-link.service');
const { publishFacebookPost } = require('../dist/services/instagram/publish.service');
beforeEach(() => { calls = []; writes = []; failure = null; result = { id: 'page1', name: 'Page', instagram_business_account: { id: 'ig1' } }; });
test('allows only the exact Page and Instagram relationship returned by Meta', async () => {
  assert.deepEqual(await verifyFacebookPageLink('page1', 'ig1', 'test-token'), { id: 'page1', name: 'Page' });
  assert.equal(calls[0].params.fields, 'id,name,instagram_business_account');
});
test('missing mapping stops before any network request', async () => {
  await assert.rejects(verifyFacebookPageLink('', 'ig1', 'test-token'), /confirmada/);
  assert.equal(calls.length, 0);
});
test('same Page name cannot override a mismatched Instagram id', async () => {
  result.instagram_business_account.id = 'other';
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'), /não está vinculada/);
});
test('missing edge and wrong Page id are rejected', async () => {
  delete result.instagram_business_account;
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'));
  result = { id: 'other', instagram_business_account: { id: 'ig1' } };
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'));
});
test('permission or network errors fail closed', async () => {
  failure = new Error('Graph permission denied');
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'), /permission denied/);
});
test('publishing never uploads any media when the stored Page is unrelated', async () => {
  result.instagram_business_account.id = 'other';
  for (const mediaType of ['IMAGE', 'CAROUSEL', 'REEL']) {
    await assert.rejects(publishFacebookPost({ account: { pageId: 'page1', igUserId: 'ig1' }, mediaType, mediaUrls: ['https://example.test/image.jpg'] }, 'test-token'));
  }
  assert.equal(writes.length, 0);
});
test('publishing uses the verified Page destination', async () => {
  const id = await publishFacebookPost({ account: { pageId: 'page1', igUserId: 'ig1' }, mediaType: 'IMAGE', mediaUrls: ['https://example.test/image.jpg'] }, 'test-token');
  assert.equal(id, 'photo-1');
  assert.deepEqual(writes.map((write) => write.path), ['/page1/photos']);
});
test('Facebook carousel uploads every photo privately and publishes one album post', async () => {
  const id = await publishFacebookPost({
    account: { pageId: 'page1', igUserId: 'ig1' },
    mediaType: 'CAROUSEL',
    mediaUrls: ['https://example.test/one.jpg', 'https://example.test/two.jpg', 'https://example.test/three.jpg'],
    caption: 'Um álbum só',
  }, 'test-token');

  assert.equal(id, 'posted');
  assert.deepEqual(writes.map((write) => write.path), [
    '/page1/photos', '/page1/photos', '/page1/photos', '/page1/feed',
  ]);
  assert.deepEqual(writes.slice(0, 3).map((write) => write.params), [
    { url: 'https://example.test/one.jpg', published: false },
    { url: 'https://example.test/two.jpg', published: false },
    { url: 'https://example.test/three.jpg', published: false },
  ]);
  assert.equal(writes[3].params.message, 'Um álbum só');
  assert.deepEqual(
    [0, 1, 2].map((index) => JSON.parse(writes[3].params[`attached_media[${index}]`])),
    [{ media_fbid: 'photo-1' }, { media_fbid: 'photo-2' }, { media_fbid: 'photo-3' }],
  );
});
test('Facebook photo albums reject videos before uploading any media', async () => {
  await assert.rejects(publishFacebookPost({
    account: { pageId: 'page1', igUserId: 'ig1' },
    mediaType: 'CAROUSEL',
    mediaUrls: ['https://example.test/photo.jpg', 'https://example.test/clip.mp4'],
  }, 'test-token'), /aceita apenas fotos/);
  assert.equal(writes.length, 0);
});
