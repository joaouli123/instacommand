const { test } = require('node:test');
const assert = require('node:assert/strict');

const env = { ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!', FRONTEND_URL: 'https://app.example.test', BACKEND_URL: 'https://api.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads' };
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {} } };
const community = require('../dist/services/meta-community.service');

test('a Facebook comment is answered only when the Page itself replied', () => {
  const post = { id: 'p1', message: 'Lançamento', full_picture: 'https://x/img.jpg', permalink_url: 'https://fb/p1', comments: { summary: { total_count: 2 } }, reactions: { summary: { total_count: 7 } } };
  const fan = community.facebookComment({ id: 'c1', message: 'Quanto custa?', from: { id: 'u1', name: 'Ana' }, comments: { data: [{ from: { id: 'u2' } }] } }, post, 'PAGE');
  assert.equal(fan.answered, false);
  assert.equal(fan.intent, 'question');
  assert.equal(fan.mediaLikeCount, 7);
  const answered = community.facebookComment({ id: 'c2', message: 'oi', is_hidden: true, comments: { data: [{ from: { id: 'PAGE' }, created_time: '2026-10-20T12:00:00+0000' }] } }, post, 'PAGE');
  assert.equal(answered.answered, true);
  assert.equal(answered.hidden, true);
  assert.equal(answered.username, 'usuário');
});

test('Threads lists only direct replies of other people, answered when the profile replied', () => {
  const post = { id: 'root', text: 'Post', permalink: 'https://threads/root' };
  const conversation = [
    { id: 'r1', text: 'Amei!', username: 'ana', replied_to: { id: 'root' }, timestamp: '2026-10-20T10:00:00Z' },
    { id: 'r2', text: 'resposta', username: 'ux.move', is_reply_owned_by_me: true, replied_to: { id: 'r1' }, timestamp: '2026-10-20T11:00:00Z' },
    { id: 'r3', text: 'Tem frete?', username: 'bia', replied_to: { id: 'root' }, hide_status: 'HIDDEN' },
    { id: 'r4', text: 'nested', username: 'caio', replied_to: { id: 'r3' } },
  ];
  const list = community.threadsComments(conversation, post, 'ux.move');
  assert.deepEqual(list.map((item) => item.id), ['r1', 'r3']);
  assert.equal(list[0].answered, true);
  assert.equal(list[0].firstReplyAt, '2026-10-20T11:00:00Z');
  assert.equal(list[1].answered, false);
  assert.equal(list[1].hidden, true);
  assert.equal(list[1].replyCount, 1);
});
