const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

require.cache[require.resolve('../dist/config/env')] = { exports: { env: { FRONTEND_URL: 'https://app.example.test/' } } };

const now = Date.now();
let links, posts, comments, created;
const fake = {
  clientShareLink: {
    findUnique: async ({ where }) => links.find((link) => link.tokenHash === where.tokenHash) || null,
    update: async ({ where, data }) => Object.assign(links.find((link) => link.id === where.id), data),
    create: async ({ data }) => { const link = { id: 'link-new', createdAt: new Date(), revokedAt: null, ...data }; links.push(link); return link; },
  },
  scheduledPost: {
    findMany: async ({ where }) => posts.filter((post) => post.userId === where.userId && where.status.in.includes(post.status)),
    findFirst: async ({ where }) => posts.find((post) => post.id === where.id && post.userId === where.userId && where.status.in.includes(post.status)) || null,
  },
  postClientComment: {
    findMany: async () => comments,
    findFirst: async () => null,
    create: async ({ data }) => { created.push(data); return { id: 'c-new', createdAt: new Date(), resolvedAt: null, parentId: null, fromOwner: false, ...data }; },
  },
  instagramAccount: { count: async () => 0 },
};
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class { constructor() { return fake; } } } };
const share = require('../dist/services/client-share.service');

const token = share.generateShareToken();
beforeEach(() => {
  created = [];
  comments = [];
  links = [{ id: 'link-1', userId: 'owner', tokenHash: share.hashShareToken(token), tokenPrefix: share.tokenPrefixOf(token), name: 'Cliente', accountIds: [], platforms: [], includeDrafts: false, expiresAt: null, revokedAt: null, createdAt: new Date() }];
  posts = [
    { id: 'p1', userId: 'owner', accountId: 'acc-1', status: 'SCHEDULED', mediaType: 'IMAGE', mediaUrls: ['https://cdn.test/a.jpg', 'javascript:alert(1)'], caption: 'Oi', hashtags: [], platforms: ['INSTAGRAM'], scheduledFor: new Date(now + 86_400_000), errorMessage: 'secret failure', editorialBrief: { internal: true }, advancedSettings: { x: 1 },
      account: { igUsername: 'marca', igName: 'Marca', pageName: 'Pagina', igProfilePicUrl: 'https://cdn.test/p.jpg', pageAccessToken: 'TOKEN-SECRET' }, threadsAccount: null, xAccount: null, publishedPost: null },
    { id: 'p2', userId: 'owner', accountId: 'acc-1', status: 'DRAFT', mediaType: 'IMAGE', mediaUrls: [], caption: 'draft', hashtags: [], platforms: ['INSTAGRAM'], scheduledFor: new Date(now), account: null },
  ];
});

test('tokens are url-safe 32-byte secrets stored only as sha256', () => {
  assert.match(token, /^shr_[A-Za-z0-9_-]{43}$/);
  assert.equal(share.isShareTokenFormat(token), true);
  assert.equal(share.hashShareToken(token).length, 64);
  assert.notEqual(share.hashShareToken(token), token);
  assert.equal(share.tokenMatchesHash(token, share.hashShareToken(token)), true);
  assert.equal(share.tokenMatchesHash(share.generateShareToken(), share.hashShareToken(token)), false);
  assert.equal(token.startsWith(share.tokenPrefixOf(token)), true);
  assert.ok(share.tokenPrefixOf(token).length < 12);
});

test('created link returns url once and never exposes the hash', async () => {
  const result = await share.createShareLink('owner', { name: 'Loja', includeDrafts: true, expiresInDays: 7 });
  assert.match(result.url, /^https:\/\/app\.example\.test\/share\/shr_/);
  const stored = links.at(-1);
  assert.equal(stored.tokenHash, share.hashShareToken(result.url.split('/share/')[1]));
  assert.equal(JSON.stringify(result).includes(stored.tokenHash), false);
  assert.equal(JSON.stringify(share.toOwnerLink(stored)).includes('share/'), false);
  assert.ok(stored.expiresAt > new Date());
  await assert.rejects(share.createShareLink('owner', { name: '' }), /nome/);
});

test('expired or revoked links are refused', async () => {
  assert.equal(share.isLinkActive({ revokedAt: null, expiresAt: null }), true);
  assert.equal(share.isLinkActive({ revokedAt: null, expiresAt: new Date(now - 1000) }), false);
  assert.equal(share.isLinkActive({ revokedAt: new Date(), expiresAt: null }), false);
  links[0].expiresAt = new Date(now - 1000);
  await assert.rejects(share.getPublicSchedule(token), /inválido ou expirado/);
  links[0].expiresAt = null; links[0].revokedAt = new Date();
  await assert.rejects(share.getPublicSchedule(token), /inválido ou expirado/);
  await assert.rejects(share.getPublicSchedule('shr_bad'), /inválido ou expirado/);
  await assert.rejects(share.createPublicComment(token, 'p1', { authorName: 'Ana', body: 'oi' }), /inválido ou expirado/);
});

test('public payload whitelists fields and hides drafts unless allowed', async () => {
  const payload = await share.getPublicSchedule(token);
  const text = JSON.stringify(payload);
  for (const secret of ['TOKEN-SECRET', 'secret failure', 'internal', 'owner', 'tokenHash', 'link-1', 'acc-1', 'javascript:', share.hashShareToken(token), token]) {
    assert.equal(text.includes(secret), false, `leaked ${secret}`);
  }
  assert.deepEqual(payload.posts.map((post) => post.id), ['p1']);
  assert.deepEqual(Object.keys(payload.posts[0]).sort(), ['accountKey', 'caption', 'hashtags', 'id', 'mediaType', 'mediaUrls', 'platforms', 'scheduledAt', 'status', 'thumbnailUrl', 'threadsAccount', 'xAccount'].sort());
  assert.equal(payload.accounts[0].igUsername, 'marca');
  assert.equal(payload.posts[0].accountKey, payload.accounts[0].key);
  links[0].includeDrafts = true;
  assert.deepEqual((await share.getPublicSchedule(token)).posts.map((post) => post.id), ['p1', 'p2']);
});

test('comment validation limits length, name and pin coordinates', async () => {
  assert.throws(() => share.validateCommentInput({ authorName: 'A', body: 'ok' }), /nome/);
  assert.throws(() => share.validateCommentInput({ authorName: 'Ana', body: '   ' }), /observação/);
  assert.throws(() => share.validateCommentInput({ authorName: 'Ana', body: 'x'.repeat(1001) }), /1000/);
  assert.throws(() => share.validateCommentInput({ authorName: 'Ana', body: 'ok', x: 120, y: 10 }), /marcador/);
  assert.throws(() => share.validateCommentInput({ authorName: 'Ana', body: 'ok', x: 10 }), /incompleta/);
  assert.throws(() => share.validateCommentInput({ authorName: 'Ana', body: 'http://a http://b http://c http://d' }), /links/);
  assert.deepEqual(share.validateCommentInput({ authorName: '  Ana  Souza ', body: ' Trocar a cor ', x: 12.345, y: 50, mediaIndex: 1 }), { authorName: 'Ana Souza', body: 'Trocar a cor', mediaIndex: 1, x: 12.35, y: 50 });

  const comment = await share.createPublicComment(token, 'p1', { authorName: 'Ana', body: 'Ajustar', x: 10, y: 20 });
  assert.equal(created[0].linkId, 'link-1');
  assert.equal(comment.x, 10);
  assert.equal('linkId' in comment, false);
  await assert.rejects(share.createPublicComment(token, 'p2', { authorName: 'Ana', body: 'draft' }), /não encontrada/);
});

test('spam brake caps comments per minute', () => {
  for (let i = 0; i < 6; i++) assert.equal(share.checkCommentBudget('k', now), true);
  assert.equal(share.checkCommentBudget('k', now), false);
  assert.equal(share.checkCommentBudget('k', now + 61_000), true);
});

test('share link scopes: creation needs publish, management write', () => {
  const { requiredScopeFor } = require('../dist/services/api-scopes');
  assert.deepEqual(requiredScopeFor('POST', '/api/share-links', {}), { scope: 'publish' });
  assert.deepEqual(requiredScopeFor('DELETE', '/api/share-links/abc', {}), { scope: 'write' });
  assert.deepEqual(requiredScopeFor('POST', '/api/share-links/comments/abc/resolve', {}), { scope: 'write' });
  assert.deepEqual(requiredScopeFor('GET', '/api/share-links', {}), { scope: 'read' });
});
