const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyIntent, findOwnerReply, summarizeComments } = require('../dist/utils/community-insights');

test('intent heuristic marks complaints, questions and praise', () => {
  assert.equal(classifyIntent('Meu pedido não chegou ainda'), 'complaint');
  assert.equal(classifyIntent('Qual o preço?'), 'question');
  assert.equal(classifyIntent('quanto custa'), 'question');
  assert.equal(classifyIntent('Amei demais!!'), 'praise');
  assert.equal(classifyIntent('\u{1F60D}\u{1F60D}'), 'praise');
  assert.equal(classifyIntent('ok'), 'other');
  assert.equal(classifyIntent(''), 'other');
});

test('owner reply is matched case-insensitively and the earliest one wins', () => {
  const replies = [
    { username: 'fan', timestamp: '2026-01-01T10:00:00Z' },
    { username: 'Loja', timestamp: '2026-01-01T12:00:00Z' },
    { username: 'loja', timestamp: '2026-01-01T11:00:00Z' },
  ];
  assert.equal(findOwnerReply(replies, '@loja').timestamp, '2026-01-01T11:00:00Z');
  assert.equal(findOwnerReply(replies, 'outra'), null);
  assert.equal(findOwnerReply(undefined, 'loja'), null);
});

test('summary computes response rate, average delay, intents and top commenters', () => {
  const summary = summarizeComments([
    { id: '1', text: '', username: 'ana', timestamp: '2026-01-01T10:00:00Z', answered: true, firstReplyAt: '2026-01-01T10:30:00Z', intent: 'question' },
    { id: '2', text: '', username: 'ana', timestamp: '2026-01-02T10:00:00Z', answered: true, firstReplyAt: '2026-01-02T11:30:00Z', intent: 'praise' },
    { id: '3', text: '', username: 'bia', timestamp: '2026-01-03T10:00:00Z', answered: false, firstReplyAt: null, intent: 'complaint' },
    { id: '4', text: '', username: 'caio', timestamp: '2026-01-04T10:00:00Z', answered: false, firstReplyAt: null, intent: 'other' },
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.answered, 2);
  assert.equal(summary.unanswered, 2);
  assert.equal(summary.responseRate, 50);
  assert.equal(summary.avgResponseMinutes, 60);
  assert.deepEqual(summary.intents, { question: 1, complaint: 1, praise: 1, other: 1 });
  assert.equal(summary.topCommenters[0].username, 'ana');
  assert.equal(summary.topCommenters[0].comments, 2);
  assert.equal(summary.topCommenters[1].username, 'caio');
});

test('empty summary keeps derived metrics unavailable instead of zero', () => {
  const summary = summarizeComments([]);
  assert.equal(summary.responseRate, null);
  assert.equal(summary.avgResponseMinutes, null);
  assert.deepEqual(summary.topCommenters, []);
});
