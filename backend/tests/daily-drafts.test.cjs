const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let owned, stored, transactions;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async ({ where }) => owned && where.userId === 'user1' ? { id: where.id } : null };
  scheduledPost = { upsert: args => args };
  $transaction = async operations => { transactions++; return operations.map(op => { if (!stored.has(op.where.id)) stored.set(op.where.id, op.create); return stored.get(op.where.id); }); };
} } };
const { saveDailyDrafts } = require('../dist/services/daily-drafts.service');
const input = () => ({ requestId: '11111111-1111-4111-8111-111111111111', accountId: '22222222-2222-4222-8222-222222222222', date: '2026-09-22', plan: {
  summary: 'Plano', timingNote: 'Sugestão editorial', posts: Array.from({ length: 3 }, (_, i) => ({ topic: `Tema ${i}`, format: 'IMAGE', caption: 'Legenda', cta: 'Comente', hashtags: ['#teste'], suggestedTime: '09:30', creativeBrief: 'Foto', storyIdea: 'Enquete', reason: 'Contexto' }))
} });
beforeEach(() => { owned = true; stored = new Map(); transactions = 0; });
test('creates exactly three draft-only records with media absent and preserved brief', async () => {
  const posts = await saveDailyDrafts('user1', input());
  assert.equal(posts.length, 3); assert.equal(transactions, 1);
  for (const post of posts) {
    assert.equal(post.status, 'DRAFT'); assert.deepEqual(post.mediaUrls, []);
    assert.equal(post.editorialBrief.storyIdea, 'Enquete'); assert.equal(post.scheduledFor.toISOString(), '2026-09-22T12:30:00.000Z');
  }
});
test('retry does not duplicate or overwrite previously saved drafts', async () => {
  const first = await saveDailyDrafts('user1', input());
  const changed = input(); changed.plan.posts[0].caption = 'New caption';
  const second = await saveDailyDrafts('user1', changed);
  assert.equal(stored.size, 3); assert.deepEqual(first.map(p => p.id), second.map(p => p.id));
  assert.equal(second[0].caption, 'Legenda');
});
test('different explicit plan request creates another set', async () => {
  await saveDailyDrafts('user1', input());
  const next = input(); next.requestId = '33333333-3333-4333-8333-333333333333';
  await saveDailyDrafts('user1', next); assert.equal(stored.size, 6);
});
test('other workspace cannot create drafts for the selected account', async () => {
  await assert.rejects(saveDailyDrafts('other', input()), /Conta não encontrada/);
  assert.equal(stored.size, 0); assert.equal(transactions, 0);
});
test('impossible date or malformed plan is rejected before writing', async () => {
  const bad = input(); bad.date = '2026-02-31';
  await assert.rejects(saveDailyDrafts('user1', bad));
  bad.date = '2026-09-22'; bad.plan.posts = [];
  await assert.rejects(saveDailyDrafts('user1', bad)); assert.equal(stored.size, 0);
});
