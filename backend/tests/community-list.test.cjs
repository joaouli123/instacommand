const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let media, comments, reads;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async ({ where }) => {
    assert.deepEqual(where, { id: 'account', userId: 'user', isActive: true });
    return { id: 'account', igUserId: '789' };
  } };
} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = {
  exports: { getDecryptedToken: async () => 'fixture' },
};
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path, token, params) => {
    reads.push({ path, params });
    return path === '/789/media' ? { data: media } : { data: comments };
  },
} };

const { listRecentComments } = require('../dist/services/instagram/community.service');

beforeEach(() => {
  media = [{ id: '123', caption: 'Post real', permalink: 'https://instagram.com/p/abc' }];
  comments = [
    { id: '1', text: 'Sem contador' },
    { id: '2', text: 'Curtida zero verificada', like_count: 0 },
    { id: '3', text: 'Tem curtidas', like_count: 4 },
  ];
  reads = [];
});

test('missing comment likes stay unavailable while a returned zero stays a real zero', async () => {
  const result = await listRecentComments('account', 'user');
  assert.equal(result.available, true);
  assert.deepEqual(result.comments.map(comment => comment.like_count), [null, 0, 4]);
  assert.equal(result.comments[0].mediaCaption, 'Post real');
  assert.deepEqual(reads.map(item => item.path), ['/789/media', '/123/comments']);
});
