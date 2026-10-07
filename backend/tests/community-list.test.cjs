const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let media, comments, reads, ownerUsername;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async ({ where }) => {
    assert.deepEqual(where, { id: 'account', userId: 'user', isActive: true });
    return { id: 'account', igUserId: '789', igUsername: ownerUsername };
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
  ownerUsername = null;
});

test('missing comment likes stay unavailable while a returned zero stays a real zero', async () => {
  const result = await listRecentComments('account', 'user');
  assert.equal(result.available, true);
  assert.deepEqual(result.comments.map(comment => comment.like_count), [null, 0, 4]);
  assert.equal(result.comments[0].mediaCaption, 'Post real');
  assert.deepEqual(reads.map(item => item.path), ['/789/media', '/123/comments']);
  assert.equal(result.summary.total, 3);
});

test('owner replies mark comments answered and own comments are left out', async () => {
  ownerUsername = 'loja';
  comments = [
    { id: '1', text: 'Qual o preço?', username: 'ana', timestamp: '2026-01-01T10:00:00Z', replies: { data: [{ id: 'r', username: 'Loja', timestamp: '2026-01-01T10:20:00Z' }] } },
    { id: '2', text: 'Amei', username: 'bia', timestamp: '2026-01-01T11:00:00Z' },
    { id: '3', text: 'Obrigado a todos', username: 'loja', timestamp: '2026-01-01T12:00:00Z' },
  ];
  const result = await listRecentComments('account', 'user');
  assert.deepEqual(result.comments.map(comment => [comment.id, comment.answered, comment.intent]), [['2', false, 'praise'], ['1', true, 'question']]);
  assert.equal(result.summary.responseRate, 50);
  assert.equal(result.summary.avgResponseMinutes, 20);
});
