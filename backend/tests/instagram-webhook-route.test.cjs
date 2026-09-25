const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const express = require('express');
let server, baseUrl, queued, logs;
const originalInfo = console.info;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: { FB_APP_SECRET: 'test-secret', WEBHOOK_VERIFY_TOKEN: 'test-verify' } } };
require.cache[require.resolve('../dist/config/redis')] = { exports: { redisConnection: {} } };
require.cache[require.resolve('bullmq')] = { exports: { Queue: class {
  async add(name, event, options) { queued.push({ name, event, options }); }
} } };
before(async () => {
  const app = express();
  app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = buffer; } }));
  app.use('/webhooks', require('../dist/routes/instagram-webhook.routes').default);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/webhooks/instagram`;
  console.info = (...args) => logs.push(args);
});
beforeEach(() => { queued = []; logs = []; });
after(async () => { console.info = originalInfo; await new Promise(resolve => server.close(resolve)); });
const body = () => JSON.stringify({ object: 'instagram', entry: [{ id: 'private-account', messaging: [{
  sender: { id: 'private-sender' }, recipient: { id: 'private-account' }, timestamp: Date.now(), message: { mid: 'private-id', text: 'private-message' },
}] }] });
const post = (payload, signature) => fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'x-hub-signature-256': signature } : {}) }, body: payload });
const sign = value => `sha256=${createHmac('sha256', 'test-secret').update(value).digest('hex')}`;

test('unsigned and incorrectly signed requests are rejected before queueing or logging', async () => {
  const payload = body();
  assert.equal((await post(payload)).status, 401);
  assert.equal((await post(payload, sign('different-body'))).status, 401);
  assert.equal(queued.length, 0);
  assert.equal(logs.length, 0);
});

test('verified inbound message is queued and operational logs contain counts only', async () => {
  const payload = body();
  assert.equal((await post(payload, sign(payload))).status, 200);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].event.text, 'private-message');
  assert.deepEqual(logs, [['Instagram webhook accepted', { instagramObject: true, entries: 1, queuedEvents: 1 }]]);
  assert.equal(JSON.stringify(logs).includes('private-'), false);
  assert.equal(JSON.stringify(logs).includes('test-secret'), false);
});

test('verified echoes are acknowledged without triggering automatic replies', async () => {
  const payload = JSON.parse(body());
  payload.entry[0].messaging[0].message.is_echo = true;
  const value = JSON.stringify(payload);
  assert.equal((await post(value, sign(value))).status, 200);
  assert.equal(queued.length, 0);
  assert.equal(logs[0][1].queuedEvents, 0);
});
