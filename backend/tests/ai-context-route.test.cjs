const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let server, base, query, input, found = true, calls = 0;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = { findFirst: async value => { query = value; return found ? {
    igUsername: 'fixture', igName: null, igBio: null, igFollowersCount: 0,
    igFollowsCount: 0, igMediaCount: 0, lastSyncAt: null, publishedPosts: [], profileInsights: [],
  } : null; } };
} } };
require.cache[require.resolve('../dist/middleware/auth')] = { exports: { authenticate: (req, res, next) => { req.user = { id: 'workspace' }; next(); } } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getAiCredentials: async () => ({ source: 'workspace' }) } };
require.cache[require.resolve('../dist/services/ai.service')] = { exports: { generateAiContent: async value => { input = value; calls++; return { summary: 'Fixture' }; } } };
before(async () => { const app = express(); app.use(express.json()); app.use(require('../dist/routes/ai.routes').default);
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
const request = () => fetch(`${base}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'audit', accountId: '11111111-1111-4111-8111-111111111111' }) });
test('generation uses owner-scoped active account and normalizes context before provider', async () => {
  found = true;
  assert.equal((await request()).status, 200);
  assert.deepEqual(query.where, { id: '11111111-1111-4111-8111-111111111111', userId: 'workspace', isActive: true });
  assert.equal(query.select.publishedPosts.select.insights.select.availableMetrics, true);
  assert.equal(input.context.igFollowersCount, null);
  assert.equal(input.context.sourceNetwork, 'Instagram');
});
test('missing or inaccessible profile does not call AI provider', async () => {
  found = false; const previous = calls;
  assert.equal((await request()).status, 404);
  assert.equal(calls, previous);
});
