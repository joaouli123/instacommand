const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let account, local, comment, media, failure, reads, writes, tokens;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async ({ where }) => { assert.deepEqual(where, { id: 'account', userId: 'user', isActive: true }); return account; } };
  publishedPost = { findFirst: async () => local };
} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getDecryptedToken: async () => { tokens++; return 'fixture'; } } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path, token, params) => { reads.push({ path, params }); if (failure) throw failure; return path === '/123' ? media : comment; },
  graphPost: async (path, token, body) => { writes.push({ path, body }); return { id: 'reply' }; },
  graphDelete: async path => { writes.push({ path }); return { success: true }; },
} };
const { replyToComment, deleteComment } = require('../dist/services/instagram/community.service');
const reply = () => replyToComment('account', 'user', '123', '456', ' Obrigado ');
const remove = () => deleteComment('account', 'user', '123', '456');
beforeEach(() => { account = { id: 'account', igUserId: '789' }; local = { id: 'local' }; comment = { id: '456', media: { id: '123' } }; media = { id: '123', owner: { id: '789' } }; failure = null; reads = []; writes = []; tokens = 0; });
test('reply and delete require a confirmed comment/media relationship', async () => {
  await reply(); await remove();
  assert.deepEqual(reads, Array(2).fill({ path: '/456', params: { fields: 'id,media' } }));
  assert.deepEqual(writes, [{ path: '/456/replies', body: { message: 'Obrigado' } }, { path: '/456' }]);
});
test('unrelated, missing or mismatched comment data never makes a remote mutation', async () => {
  for (const value of [{ id: '456', media: { id: '999' } }, { id: '456' }, { id: '999', media: { id: '123' } }]) {
    comment = value;
    await assert.rejects(reply(), error => error.statusCode === 403);
    await assert.rejects(remove(), error => error.statusCode === 403);
  }
  assert.deepEqual(writes, []);
});
test('ownership failure stops before decrypting a token or reading Meta', async () => {
  account = null;
  await assert.rejects(reply(), error => error.statusCode === 404);
  assert.equal(tokens, 0); assert.deepEqual(reads, []); assert.deepEqual(writes, []);
});
test('uncached media is verified against the selected Instagram owner', async () => {
  local = null; media.owner.id = '999';
  await assert.rejects(reply(), error => error.statusCode === 403);
  assert.deepEqual(writes, []);
  media.owner.id = '789'; comment.media = '123';
  await reply(); assert.equal(writes.length, 1);
});
test('API errors and malformed path identifiers fail closed without mutations', async () => {
  failure = new Error('Provider unavailable');
  await assert.rejects(reply(), /Provider unavailable/);
  await assert.rejects(remove(), /Provider unavailable/);
  reads = [];
  await assert.rejects(replyToComment('account', 'user', '123', '456?fields=token', 'Test'), error => error.statusCode === 400);
  await assert.rejects(deleteComment('account', 'user', '../123', '456'), error => error.statusCode === 400);
  assert.deepEqual(reads, []); assert.deepEqual(writes, []);
});
