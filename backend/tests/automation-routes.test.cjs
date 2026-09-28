const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

let server, base, agentWrites, ruleWrites, conversationWrites;
require.cache[require.resolve('../dist/services/threads-automation.service')] = { exports: { syncThreadsAutomation: async () => ({ processed: 0 }) } };
require.cache[require.resolve('../dist/middleware/auth')] = { exports: {
  authenticate: (req, res, next) => {
    if (!req.headers['x-test-auth']) return res.sendStatus(401);
    req.user = { id: 'fixture-owner' };
    next();
  },
} };
require.cache[require.resolve('../dist/services/automation.service')] = { exports: {
  setConversationState: async (...args) => { conversationWrites.push(args); return { state: args[3] }; },
  saveAgentSettings: async (userId, data) => {
    agentWrites.push({ userId, data });
    return { id: 'fixture-agent', ...data };
  },
  updateAutomation: async (userId, id, data) => {
    ruleWrites.push({ userId, id, data });
    return { id, ...data };
  },
} };

const accountId = '11111111-1111-4111-8111-111111111111';
const agent = {
  accountId, enabled: true, autoSend: false, tone: 'Claro e acolhedor',
  instructions: 'Use somente as informações fornecidas.',
  knowledgeBase: 'Informações fictícias para teste.', fallback: 'Vou encaminhar para uma pessoa.',
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/automations', require('../dist/routes/automations.routes').default);
  app.use((error, req, res, next) => res.status(error.statusCode || 400).json({ error: 'invalid request' }));
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}/automations`;
});
beforeEach(() => { agentWrites = []; ruleWrites = []; conversationWrites = []; });
after(async () => { await new Promise(resolve => server.close(resolve)); });

const put = (path, body, authenticated = true) => fetch(`${base}${path}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'x-test-auth': 'yes' } : {}) },
  body: JSON.stringify(body),
});

test('saving the AI agent reaches the agent handler, never the dynamic rule handler', async () => {
  const response = await put('/agent', agent);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'fixture-agent', ...agent });
  assert.deepEqual(agentWrites, [{ userId: 'fixture-owner', data: agent }]);
  assert.equal(ruleWrites.length, 0);
});

test('AI agent settings still require authentication and validation', async () => {
  assert.equal((await put('/agent', agent, false)).status, 401);
  assert.equal((await put('/agent', { ...agent, tone: '' })).status, 400);
  assert.equal(agentWrites.length, 0);
  assert.equal(ruleWrites.length, 0);
});

test('both ready-made and AI rules retain the regular update route', async () => {
  for (const replyMode of ['TEMPLATE', 'AI']) {
    const rule = {
      accountId, name: 'Regra de teste', trigger: 'MESSAGE_KEYWORD', keywords: ['teste'],
      replyMode, directMessageReply: 'Resposta pronta de teste', enabled: false,
    };
    const response = await put('/22222222-2222-4222-8222-222222222222', rule);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).replyMode, replyMode);
    assert.equal(ruleWrites.at(-1).userId, 'fixture-owner');
    assert.equal(ruleWrites.at(-1).id, '22222222-2222-4222-8222-222222222222');
    assert.deepEqual(ruleWrites.at(-1).data, rule);
  }
  assert.equal(agentWrites.length, 0);
});

test('conversation routes bind ownership and the selected network, not supplied user IDs', async () => {
  const result = await put('/conversations/conversation-test/state', { accountId, platform: 'FACEBOOK', state: 'HUMAN', userId: 'untrusted-owner' });
  assert.equal(result.status, 200);
  assert.deepEqual(conversationWrites[0], ['fixture-owner', accountId, 'conversation-test', 'HUMAN', 'FACEBOOK', false]);
  assert.equal((await put('/conversations/conversation-test/state', { accountId, state: 'BOT' }, false)).status, 401);
});

test('unknown networks and excessive memory/rate settings are rejected at the route', async () => {
  for (const values of [{ platform: 'UNKNOWN' }, { memoryDays: 31 }, { memoryDays: -1 }, { maxRepliesPerHour: 0 }, { maxRepliesPerHour: 31 }]) {
    assert.equal((await put('/agent', { ...agent, ...values })).status, 400);
  }
  assert.equal(agentWrites.length, 0);
});
