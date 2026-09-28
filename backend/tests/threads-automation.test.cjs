const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let rules, scopes, calls, events, updates, pages;
require.cache[require.resolve('../dist/services/automation-lock')] = { exports: { withConversationLock: async (_, fn) => fn(async () => {}) } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: { getDecryptedThreadsToken: async () => 'fixture-token' } };
require.cache[require.resolve('../dist/services/automation.service')] = { exports: { processInstagramAutomationEvent: async event => events.push(event) } };
require.cache[require.resolve('../dist/services/automation-platform')] = { exports: {
  automationDb: { socialAutomation: { findMany: async () => rules }, threadsAccount: { update: async ({ data }) => updates.push(data) } },
  accountScope: (id, platform) => ({ threadsAccountId: id, platform }),
  ownedAutomationAccount: async () => ({ id: 'fixture', externalId: 'threads-user', username: 'OurAccount' }),
  automationPermissions: async () => scopes,
  permissionCapabilities: (_, granted) => ({ canAutomateComments: ['threads_read_replies', 'threads_content_publish'].every(scope => granted.includes(scope)) }),
  threadsAutomationRequest: async (path, token, params) => { calls.push({ path, params }); return pages.shift(); },
} };
const { syncThreadsAutomation, threadsReplyEvents } = require('../dist/services/threads-automation.service');
const reply = (id, time = Date.now() - 1000) => ({ id, text: 'teste', username: 'AnotherPerson', is_reply: true, is_reply_owned_by_me: false, root_post: { id: 'root' }, timestamp: new Date(time).toISOString() });
beforeEach(() => {
  rules = [{ enabledAt: new Date(Date.now() - 60000) }]; scopes = ['threads_read_replies', 'threads_content_publish'];
  calls = []; events = []; updates = []; pages = [];
});
test('only verified replies to the owned root after activation become events', () => {
  const items = [reply('valid'), { ...reply('own'), is_reply_owned_by_me: true }, { ...reply('other-root'), root_post: { id: 'elsewhere' } }, { ...reply('missing-owner'), is_reply_owned_by_me: undefined },
    { ...reply('echo'), username: 'OURACCOUNT' }, reply('old', Date.now() - 120000), reply('future', Date.now() + 120000), { ...reply('bad-time'), timestamp: 'invalid' }, { ...reply('not-reply'), is_reply: false }];
  const result = threadsReplyEvents(items, 'threads-user', 'OurAccount', 'root', Date.now() - 60000);
  assert.deepEqual(result.map(item => item.commentId), ['valid']);
  assert.equal(result[0].platform, 'THREADS'); assert.equal(result[0].senderId, 'anotherperson');
});
test('no active rules means no provider calls or historical replies', async () => {
  rules = []; const result = await syncThreadsAutomation('owner', 'fixture');
  assert.equal(result.processed, 0); assert.equal(calls.length, 0); assert.equal(events.length, 0);
});
test('missing reading permission stops collection before any post lookup', async () => {
  scopes = ['threads_content_publish'];
  await assert.rejects(syncThreadsAutomation('owner', 'fixture'), /Reconecte/);
  assert.equal(calls.length, 0); assert.equal(events.length, 0); assert.ok(updates[0].automationSyncError);
});
test('pagination uses trusted paths and cursor values, deduplicates and orders replies', async () => {
  pages = [{ data: [{ id: 'root', username: 'OurAccount', has_replies: true }] },
    { data: [reply('newer')], paging: { next: 'https://attacker.invalid/never-follow', cursors: { after: 'safe-cursor' } } },
    { data: [reply('older', Date.now() - 10000), reply('newer')] }];
  const result = await syncThreadsAutomation('owner', 'fixture');
  assert.equal(result.processed, 2);
  assert.deepEqual(events.map(item => item.commentId), ['older', 'newer']);
  assert.equal(calls[2].path, '/root/conversation'); assert.equal(calls[2].params.after, 'safe-cursor');
  assert.equal(updates[0].automationSyncError, null);
});
test('cursor loops produce an honest partial-result warning', async () => {
  pages = [{ data: [{ id: 'root', username: 'OurAccount' }] },
    ...Array.from({ length: 2 }, () => ({ data: [reply('same')], paging: { next: 'present', cursors: { after: 'loop' } } }))];
  const result = await syncThreadsAutomation('owner', 'fixture');
  assert.equal(result.partial, true); assert.equal(events.length, 1); assert.match(updates[0].automationSyncError, /parcial/);
});
test('invalid provider payload is not presented as a successful empty sync', async () => {
  pages = [{ bad: 'payload' }];
  await assert.rejects(syncThreadsAutomation('owner', 'fixture'), /lista de publicações/);
  assert.equal(events.length, 0); assert.ok(updates[0].automationSyncError);
});
