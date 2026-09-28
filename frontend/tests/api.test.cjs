const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/api.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(responses, blockedStorage = false) {
  const requests = [], redirects = [], removed = [];
  const context = { exports: {}, Headers, FormData,
    require: () => ({ BACKEND_ORIGIN: 'https://fixture.test' }),
    localStorage: { getItem() { if (blockedStorage) throw Error('blocked'); return null; }, removeItem(key) { if (blockedStorage) throw Error('blocked'); removed.push(key); } },
    window: { location: { pathname: '/accounts', search: '?test=1', assign: url => redirects.push(url) } },
    fetch: async (url, options) => { requests.push({ url, options }); if (requests.length > responses.length) throw Error('unexpected retry'); const value = responses[requests.length - 1]; if (value instanceof Error) throw value; return value; },
  };
  vm.runInNewContext(code, context);
  return { fetchApi: context.exports.fetchApi, api: context.exports.api, requests, redirects, removed };
}
test('GET retries 304 exactly once, removes validators and retains authentication policy', async () => {
  const s = setup([new Response(null, { status: 304 }), Response.json({ ok: true })]);
  assert.equal((await s.fetchApi('/accounts', { headers: new Headers({ 'If-None-Match': 'old', 'If-Modified-Since': 'old', 'X-Test': 'kept' }) })).ok, true);
  assert.equal(s.requests.length, 2);
  assert.equal(s.requests[1].options.headers.has('If-None-Match'), false);
  assert.equal(s.requests[1].options.headers.has('If-Modified-Since'), false);
  assert.equal(s.requests[1].options.headers.get('X-Test'), 'kept');
  assert.equal(s.requests[1].options.credentials, 'include');
});
test('repeated 304 stops after two reads instead of recursing forever', async () => {
  const s = setup([new Response(null, { status: 304 }), new Response(null, { status: 304 })]);
  await assert.rejects(s.fetchApi('/accounts'), /cache inválida/); assert.equal(s.requests.length, 2);
});
test('writes are never automatically resent on 304, 429, 500 or network failure', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const response of [new Response(null, { status: 304 }), Response.json({ error: 'Limited' }, { status: 429 }), Response.json({}, { status: 500 }), new Error('Network failed')]) {
      const s = setup([response]); await assert.rejects(s.fetchApi('/posts', { method, body: '{}' })); assert.equal(s.requests.length, 1);
    }
  }
});
test('cookie authentication works even if local storage is blocked', async () => {
  const s = setup([Response.json({ ok: true })], true);
  assert.equal((await s.fetchApi('/accounts')).ok, true); assert.equal(s.requests[0].options.credentials, 'include');
});
test('401 redirects with return path even when storage cannot be cleared', async () => {
  const s = setup([Response.json({}, { status: 401 })], true);
  await assert.rejects(s.fetchApi('/accounts')); assert.equal(s.redirects[0], '/login?next=%2Faccounts%3Ftest%3D1');
});
test('multipart request preserves automatic boundary and 204 does not parse empty JSON', async () => {
  const s = setup([new Response(null, { status: 204 })]);
  assert.equal(await s.fetchApi('/ai/analyze-images', { method: 'POST', body: new FormData() }), null);
  assert.equal(s.requests[0].options.headers.has('Content-Type'), false);
});

test('conversation reads retain channel isolation and request cancellation', async () => {
  const s = setup([Response.json({})]); const controller = new AbortController();
  await s.api.getAutomationConversation('account', 'conversation', 'FACEBOOK', controller.signal);
  assert.match(s.requests[0].url, /accountId=account&platform=FACEBOOK$/);
  assert.equal(s.requests[0].options.signal, controller.signal);
});

test('stop/resume and memory reset never drop account or platform scope', async () => {
  const s = setup([Response.json({}), Response.json({})]);
  await s.api.setAutomationConversationState('account', 'conversation', 'INSTAGRAM', 'BOT');
  await s.api.forgetAutomationConversation('account', 'conversation', 'INSTAGRAM');
  assert.deepEqual(JSON.parse(s.requests[0].options.body), { accountId: 'account', platform: 'INSTAGRAM', state: 'BOT', consentConfirmed: false });
  assert.deepEqual(JSON.parse(s.requests[1].options.body), { accountId: 'account', platform: 'INSTAGRAM' });
});

test('reviewed public Threads send and collector explicitly carry the Threads channel', async () => {
  const s = setup([Response.json({}), Response.json({})]);
  await s.api.sendReviewedAutomationReply('thread-account', 'event', 'Texto público revisado', 'THREADS');
  await s.api.syncThreadsAutomation('thread-account');
  assert.deepEqual(JSON.parse(s.requests[0].options.body), { accountId: 'thread-account', message: 'Texto público revisado', platform: 'THREADS' });
  assert.deepEqual(JSON.parse(s.requests[1].options.body), { accountId: 'thread-account', platform: 'THREADS' });
});
