const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
let requests, responses;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedThreadsToken: async () => 'fixture-threads-token', getDecryptedToken: async () => 'fixture-page-token',
  getThreadsCredentials: async () => ({ appId: 'fixture-app', appSecret: 'fixture-secret' }),
  getInstagramGrantedPermissions: async () => ['instagram_manage_messages'],
} };
const { sendAutomationResponse, automationPermissions, permissionCapabilities, accountScope, threadsAutomationRequest } = require('../dist/services/automation-platform');
const { parseFacebookWebhookEvents, parseInstagramWebhookEvents } = require('../dist/services/instagram-webhook-parser');
const { buildConversationHistory, validMessageWindow, conversationIntent } = require('../dist/services/automation-logic');
beforeEach(() => {
  mock.method(require('node:timers/promises'), 'setTimeout', async () => {});
  requests = []; responses = [];
  global.fetch = async (url, init) => { requests.push({ url: new URL(url), init }); const item = responses.shift() || { id: 'published' }; return { ok: !item.error, status: item.error ? 403 : 200, json: async () => item }; };
});
afterEach(() => mock.restoreAll());

test('Threads creates then publishes the reply and reports only the published identifier', async () => {
  responses = [{ id: 'container' }, { status: 'FINISHED' }, { id: 'published-reply' }];
  const id = await sendAutomationResponse({ id: 'account', platform: 'THREADS', externalId: '123' }, { commentId: '456' }, 'Resposta pública');
  assert.equal(id, 'published-reply');
  assert.equal(requests[0].url.pathname, '/123/threads');
  assert.deepEqual(Object.fromEntries(requests[0].init.body), { media_type: 'TEXT', text: 'Resposta pública', reply_to_id: '456' });
  assert.equal(requests[1].url.pathname, '/container');
  assert.equal(requests[1].url.searchParams.get('fields'), 'id,status');
  assert.equal(requests[2].url.pathname, '/123/threads_publish');
  assert.equal(requests[2].init.body.get('creation_id'), 'container');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer fixture-threads-token');
  assert.ok(requests.every(item => !item.url.toString().includes('fixture-threads-token')));
});
test('Threads never treats a container or rejected publish as an accepted reply', async () => {
  responses = [{ id: 'container' }, { status: 'FINISHED' }, { error: { code: 10, message: 'fixture-secret must not leak' } }];
  await assert.rejects(sendAutomationResponse({ id: 'account', platform: 'THREADS', externalId: '123' }, { commentId: '456' }, 'Resposta'), error => !error.message.includes('fixture-secret'));
  assert.equal(requests.length, 3);
});

test('Threads polls only status while processing and publishes exactly once', async () => {
  responses = [{ id: 'container' }, { status: 'IN_PROGRESS' }, { status: 'FINISHED' }, { id: 'published' }];
  await sendAutomationResponse({ id: 'account', platform: 'THREADS', externalId: '123' }, { commentId: '456' }, 'Resposta');
  assert.deepEqual(requests.map(item => item.init.method), ['POST', 'GET', 'GET', 'POST']);
});

test('Threads never publishes a failed, expired, unknown or already-published container', async () => {
  for (const status of ['ERROR', 'EXPIRED', 'PUBLISHED', 'unknown', undefined]) {
    requests = []; responses = [{ id: 'container' }, { status }];
    await assert.rejects(sendAutomationResponse({ id: 'account', platform: 'THREADS', externalId: '123' }, { commentId: '456' }, 'Resposta'), /pronta/);
    assert.equal(requests.length, 2);
  }
});

test('Threads preparation timeout never recreates or publishes the reply', async () => {
  responses = [{ id: 'container' }, ...Array.from({ length: 12 }, () => ({ status: 'IN_PROGRESS' }))];
  await assert.rejects(sendAutomationResponse({ id: 'account', platform: 'THREADS', externalId: '123' }, { commentId: '456' }, 'Resposta'), /preparando/);
  assert.equal(requests.filter(item => item.init.method === 'POST').length, 1);
  assert.equal(requests.length, 13);
});

test('pause or lost lease after preparation prevents the final publish', async () => {
  responses = [{ id: 'container' }, { status: 'FINISHED' }];
  let checks = 0;
  await assert.rejects(sendAutomationResponse({ id: 'account', platform: 'THREADS', externalId: '123' }, { commentId: '456' }, 'Resposta', async () => {
    if (++checks === 3) throw new Error('paused');
  }), /paused/);
  assert.equal(requests.length, 2);
});

test('empty HTTP 500 and malformed success are safe failures without retry', async () => {
  for (const status of [500, 200]) {
    let calls = 0;
    global.fetch = async () => { calls++; return { status, ok: status === 200, json: async () => { throw new SyntaxError('fixture-secret'); } }; };
    await assert.rejects(threadsAutomationRequest('/123/threads', 'fixture-token', {}, 'POST'), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.match(error.message, /vazia ou inválida/);
      return !error.message.includes('fixture-secret') && !error.message.includes('fixture-token');
    });
    assert.equal(calls, 1);
  }
});

test('transport errors never expose URLs or credentials and are not retried', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('https://example.test/?access_token=fixture-secret'); };
  await assert.rejects(threadsAutomationRequest('/123/threads', 'fixture-token', {}, 'POST'), error => !error.message.includes('fixture-secret') && /conexão/.test(error.message));
  assert.equal(calls, 1);
});
test('Threads disallows DMs, oversized replies and arbitrary request paths before any network call', async () => {
  const account = { id: 'account', platform: 'THREADS', externalId: '123' };
  await assert.rejects(sendAutomationResponse(account, { senderId: 'person' }, 'Mensagem'), /públicas/);
  await assert.rejects(sendAutomationResponse(account, { commentId: '456' }, 'x'.repeat(501)), /500/);
  await assert.rejects(threadsAutomationRequest('https://evil.example/steal', 'fixture-token'), /inválido/);
  assert.equal(requests.length, 0);
});
test('Threads permission checks use its app token and fail closed for expired authorization', async () => {
  responses = [{ access_token: 'fixture-app-token' }, { data: { is_valid: true, scopes: ['threads_read_replies', 'threads_content_publish'] } }];
  assert.deepEqual(await automationPermissions({ id: 'account', userId: 'owner', platform: 'THREADS' }), ['threads_read_replies', 'threads_content_publish']);
  assert.equal(requests[1].init.headers.Authorization, 'Bearer fixture-app-token');
  responses = [{ access_token: 'fixture-app-token' }, { data: { is_valid: false, scopes: ['threads_content_publish'] } }];
  await assert.rejects(automationPermissions({ id: 'account', userId: 'owner', platform: 'THREADS' }), /expirou/);
});
test('capabilities and database scopes cannot bleed between the three channels', () => {
  assert.equal(permissionCapabilities('FACEBOOK', ['instagram_manage_messages']).canAutomateMessages, false);
  assert.equal(permissionCapabilities('INSTAGRAM', ['pages_messaging']).canAutomateMessages, false);
  assert.equal(permissionCapabilities('THREADS', ['threads_content_publish']).canAutomateComments, false);
  assert.equal(permissionCapabilities('THREADS', ['threads_read_replies', 'threads_content_publish']).canAutomateComments, false);
  assert.equal(permissionCapabilities('THREADS', ['threads_read_replies', 'threads_manage_replies', 'threads_content_publish']).canAutomateComments, true);
  assert.equal(permissionCapabilities('THREADS', ['pages_messaging']).canAutomateMessages, false);
  assert.deepEqual(accountScope('id', 'THREADS'), { accountId: null, threadsAccountId: 'id', platform: 'THREADS' });
});
test('Page webhook accepts only inbound Messenger messages for the exact Page', () => {
  const payload = { object: 'page', entry: [{ id: 'page', messaging: [
    { sender: { id: 'person' }, recipient: { id: 'page' }, timestamp: Date.now(), message: { mid: 'one', text: 'Oi' } },
    { sender: { id: 'person' }, recipient: { id: 'other-page' }, message: { mid: 'wrong', text: 'Oi' } },
    { sender: { id: 'page' }, recipient: { id: 'person' }, message: { mid: 'echo', is_echo: true, text: 'Resposta' } },
    { sender: { id: 'person' }, recipient: { id: 'page' }, read: { watermark: 123 } },
  ] }] };
  const events = parseFacebookWebhookEvents(payload);
  assert.equal(events.length, 1); assert.equal(events[0].platform, 'FACEBOOK');
  assert.equal(events[0].eventKey, 'facebook:page:message:one');
  assert.deepEqual(parseInstagramWebhookEvents(payload), []);
  assert.deepEqual(parseFacebookWebhookEvents({ ...payload, object: 'instagram' }), []);
});
test('history is bounded, chronological and excludes unsent suggestions', () => {
  const events = [
    { eventText: 'primeira', responseText: 'enviada', privateReplySent: true, eventAt: new Date(1) },
    { eventText: 'segunda', responseText: 'sugestão não enviada', privateReplySent: false, eventAt: new Date(2) },
  ];
  assert.deepEqual(buildConversationHistory(events), [{ role: 'user', text: 'primeira' }, { role: 'assistant', text: 'enviada' }, { role: 'user', text: 'segunda' }]);
  assert.deepEqual(buildConversationHistory(events, 7), [{ role: 'user', text: 'segunda' }]);
});
test('window and explicit consent controls fail closed', () => {
  assert.equal(validMessageWindow(undefined), false);
  assert.equal(validMessageWindow(Date.now() - 24 * 3600_000), false);
  assert.equal(validMessageWindow(Date.now()), true);
  assert.equal(conversationIntent('Não me envie mais mensagens!'), 'STOPPED');
  assert.equal(conversationIntent('quero falar com um humano'), 'HUMAN');
});
