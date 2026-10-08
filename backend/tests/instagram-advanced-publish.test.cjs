const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const graphWrites = [];
let grantedPermissions = ['instagram_manage_comments'];
let permissionLookupFails = false;
let postStatus = 'DRAFT';
const post = {
  id: 'scheduled-1',
  userId: 'user-1',
  accountId: 'account-1',
  mediaType: 'IMAGE',
  mediaUrls: ['https://media.example.test/image.jpg'],
  caption: 'Legenda',
  platforms: ['INSTAGRAM'],
  status: 'DRAFT',
  updatedAt: new Date('2026-09-24T12:00:00.000Z'),
  scheduledFor: new Date('2026-09-24T12:00:00.000Z'),
  advancedSettings: {
    altTexts: ['Uma foto de teste'],
    collaborators: [],
    firstComment: 'Comentário de teste',
    disableComments: true,
    userTags: [],
  },
  account: { igUserId: 'ig-user-1', pageId: null },
  threadsAccount: null,
};

const prisma = {
  scheduledPost: {
    findUnique: async () => ({ ...post, mediaUrls: [...post.mediaUrls] }),
    updateMany: async () => ({ count: 1 }),
    update: async ({ data }) => { postStatus = data.status; return { ...post, status: data.status }; },
  },
  publishedPost: {
    create: async ({ data }) => ({ id: 'published-1', ...data }),
    findUnique: async () => null,
  },
};

require.cache[require.resolve('../dist/config/env')] = { exports: { env: {} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphPost: async (path, token, params) => {
    graphWrites.push({ path, token, params });
    if (path.endsWith('/media_publish')) return { id: 'media-1' };
    if (path === '/media-1/comments') return { id: 'comment-1' };
    if (path === '/media-1') return { success: true };
    return { id: 'container-1' };
  },
  graphGet: async (path) => path === '/container-1' ? { status_code: 'FINISHED' } : { permalink: 'https://instagram.example.test/p/1', media_url: 'https://media.example.test/image.jpg' },
  graphDelete: async () => ({}),
} };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class { constructor() { return prisma; } } } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedToken: async () => 'fixture-page-token',
  getDecryptedThreadsToken: async () => 'fixture-threads-token',
  getInstagramGrantedPermissions: async () => {
    if (permissionLookupFails) throw new Error('Meta token inspection failed');
    return grantedPermissions;
  },
} };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: { notifyPublishFailure: async () => {} } };
require.cache[require.resolve('../dist/utils/errors')] = { exports: { ConflictError: class ConflictError extends Error {}, ValidationError: class ValidationError extends Error {} } };
require.cache[require.resolve('../dist/services/instagram/facebook-link.service')] = { exports: { verifyFacebookPageLink: async () => {} } };
require.cache[require.resolve('../dist/services/post-readiness')] = { exports: { assertPostReady: () => {} } };
require.cache[require.resolve('../dist/utils/public-media')] = { exports: { normalizeMediaUrl: value => value } };

const { publishPost } = require('../dist/services/instagram/publish.service');

const baseSettings = { ...post.advancedSettings };
beforeEach(() => {
  post.mediaType = 'IMAGE';
  post.mediaUrls = ['https://media.example.test/image.jpg'];
  post.advancedSettings = { ...baseSettings };
  graphWrites.length = 0;
  grantedPermissions = ['instagram_manage_comments'];
  permissionLookupFails = false;
  postStatus = 'DRAFT';
});

test('publishes the first comment, then disables comments after Instagram confirms the post', async () => {
  const result = await publishPost('scheduled-1');

  const paths = graphWrites.map(write => write.path);
  const publishIndex = paths.indexOf('/ig-user-1/media_publish');
  const commentIndex = paths.indexOf('/media-1/comments');
  const disableIndex = paths.indexOf('/media-1');
  assert.ok(publishIndex >= 0);
  assert.ok(commentIndex > publishIndex);
  assert.ok(disableIndex > commentIndex);
  assert.equal(graphWrites[commentIndex].params.message, 'Comentário de teste');
  assert.equal(graphWrites[disableIndex].params.comment_enabled, false);
  assert.equal(result.publishResults.INSTAGRAM.id, 'media-1');
  assert.deepEqual(result.publishResults.INSTAGRAM.advancedWarnings, []);
  assert.equal(postStatus, 'PUBLISHED');
});

test('does not create or publish a post when Meta has not granted comment controls', async () => {
  grantedPermissions = [];

  await assert.rejects(() => publishPost('scheduled-1'), /Nenhum post foi enviado ao Instagram/);

  assert.equal(graphWrites.some(write => write.path === '/ig-user-1/media'), false);
  assert.equal(graphWrites.some(write => write.path === '/ig-user-1/media_publish'), false);
  assert.equal(postStatus, 'FAILED');
});

test('fails closed without uploading when Meta permission status cannot be checked', async () => {
  permissionLookupFails = true;

  await assert.rejects(() => publishPost('scheduled-1'), /nenhum post foi enviado ao Instagram/i);

  assert.equal(graphWrites.length, 0);
  assert.equal(postStatus, 'FAILED');
});

const containerWrites = () => graphWrites.filter(write => write.path === '/ig-user-1/media');

test('sends location_id on a single image container', async () => {
  post.advancedSettings = { locationId: '110970792260960', locationName: 'Parque Ibirapuera' };
  await publishPost('scheduled-1');
  assert.equal(containerWrites()[0].params.location_id, '110970792260960');
});

test('sends location only on the carousel parent container', async () => {
  post.mediaType = 'CAROUSEL';
  post.mediaUrls = ['https://media.example.test/a.jpg', 'https://media.example.test/b.jpg'];
  post.advancedSettings = { locationId: '110970792260960' };
  await publishPost('scheduled-1');
  const writes = containerWrites();
  assert.equal(writes.length, 3);
  assert.equal(writes[0].params.location_id, undefined);
  assert.equal(writes[1].params.location_id, undefined);
  assert.equal(writes[2].params.media_type, 'CAROUSEL');
  assert.equal(writes[2].params.location_id, '110970792260960');
});

test('sends Reel options: share_to_feed, cover_url, trial_params and location', async () => {
  post.mediaType = 'REEL';
  post.mediaUrls = ['https://media.example.test/video.mp4'];
  post.advancedSettings = { locationId: '110970792260960', shareToFeed: false, coverUrl: 'https://media.example.test/cover.jpg', trialGraduation: 'MANUAL' };
  await publishPost('scheduled-1');
  const params = containerWrites()[0].params;
  assert.equal(params.media_type, 'REELS');
  assert.equal(params.share_to_feed, false);
  assert.equal(params.cover_url, 'https://media.example.test/cover.jpg');
  assert.equal(params.thumb_offset, undefined);
  assert.deepEqual(params.trial_params, { graduation_strategy: 'MANUAL' });
  assert.equal(params.location_id, '110970792260960');
});

test('sends thumb_offset when the Reel cover is a video frame and omits share_to_feed by default', async () => {
  post.mediaType = 'REEL';
  post.mediaUrls = ['https://media.example.test/video.mp4'];
  post.advancedSettings = { thumbOffset: 2500 };
  await publishPost('scheduled-1');
  const params = containerWrites()[0].params;
  assert.equal(params.thumb_offset, 2500);
  assert.equal('share_to_feed' in params, false);
  assert.equal('trial_params' in params, false);
});

test('refuses stored Reel options on a Story before contacting Instagram', async () => {
  post.mediaType = 'STORY';
  post.advancedSettings = { shareToFeed: false };
  await assert.rejects(() => publishPost('scheduled-1'), /só valem para Reels/);
  assert.equal(containerWrites().length, 0);
});
