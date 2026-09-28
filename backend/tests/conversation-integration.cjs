// Real PostgreSQL + Redis, fake social/AI transports. NEVER point this at production.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.AUTOMATION_INTEGRATION_TEST !== '1' || !process.env.DATABASE_URL?.includes('@test-db:5432/instacommand_test')) throw new Error('Dedicated isolated test database required.');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ids = { owner: '11111111-1111-4111-8111-111111111111', stranger: '22222222-2222-4222-8222-222222222222', account: '33333333-3333-4333-8333-333333333333', threads: '44444444-4444-4444-8444-444444444444' };
let sent, prompts, scopes, aiResult, pausedDuringGeneration, duringGeneration;
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedToken: async () => 'fixture-page-token', getDecryptedThreadsToken: async () => 'fixture-threads-token',
  getThreadsCredentials: async () => ({ appId: 'fixture-app', appSecret: 'fixture-app-secret' }),
  getInstagramGrantedPermissions: async () => scopes,
  getAiCredentials: async userId => { assert.equal(userId, ids.owner); return { apiKey: 'fixture-key', model: 'fixture-model' }; },
} };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async path => ({ id: path.slice(1), instagram_business_account: { id: 'ig-test' } }),
  graphPost: async (path, token, body) => { sent.push({ path, body }); return { message_id: `accepted-${sent.length}` }; },
} };
require.cache[require.resolve('../dist/services/ai.service')] = { exports: {
  generateAiContent: async input => { prompts.push(input); if (pausedDuringGeneration) await prisma.instagramAgentSettings.updateMany({ data: { enabled: false } }); if (duringGeneration) await duringGeneration(); return aiResult; },
} };
const service = require('../dist/services/automation.service');
const { automationDb } = require('../dist/services/automation-platform');
const { withConversationLock } = require('../dist/services/automation-lock');
const { redisConnection } = require('../dist/config/redis');
const message = (key, text = 'iniciar') => ({ accountIgId: 'ig-test', eventKey: key, type: 'MESSAGE_ANY', senderId: 'contact-test', text, timestamp: Date.now() });
async function aiRule(platform = 'INSTAGRAM', accountId = ids.account) {
  await service.saveAgentSettings(ids.owner, { accountId, platform, enabled: true, autoSend: true, tone: 'Cordial', instructions: '', knowledgeBase: 'Empresa Fictícia abre às 9h.', fallback: 'Encaminhando para revisão.', memoryDays: 7, maxRepliesPerHour: 10 });
  const payload = { accountId, platform, name: 'Regra de teste', trigger: platform === 'THREADS' ? 'COMMENT_KEYWORD' : 'MESSAGE_KEYWORD', keywords: ['iniciar'], replyMode: 'AI', continueConversation: platform !== 'THREADS', enabled: true };
  const rule = await service.createAutomation(ids.owner, payload);
  assert.equal(rule.enabled, false);
  return service.updateAutomation(ids.owner, rule.id, payload);
}
before(async () => {
  await prisma.user.createMany({ skipDuplicates: true, data: [{ id: ids.owner, email: 'owner@fixture.invalid', name: 'Fixture' }, { id: ids.stranger, email: 'other@fixture.invalid', name: 'Other fixture' }] });
  await prisma.instagramAccount.upsert({ where: { id: ids.account }, update: {}, create: { id: ids.account, userId: ids.owner, igUserId: 'ig-test', igUsername: 'fixture', pageId: 'page-test', pageAccessToken: 'not-a-real-token' } });
  await prisma.threadsAccount.upsert({ where: { id: ids.threads }, update: {}, create: { id: ids.threads, userId: ids.owner, threadsUserId: 'threads-test', username: 'fixture', accessToken: 'not-a-real-token' } });
});
beforeEach(async () => {
  await prisma.automationExecution.deleteMany(); await prisma.automationConversation.deleteMany();
  await prisma.socialAutomation.deleteMany(); await prisma.instagramAgentSettings.deleteMany();
  sent = []; prompts = []; pausedDuringGeneration = false; duringGeneration = null;
  scopes = ['instagram_manage_comments', 'instagram_manage_messages', 'pages_messaging', 'pages_manage_metadata'];
  aiResult = { response: 'A empresa abre às 9h.', shouldEscalate: false, reason: '' };
  global.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    return { ok: true, status: 200, json: async () => path === '/oauth/access_token' ? { access_token: 'fixture-app-token' } : path === '/debug_token' ? { data: { is_valid: true, scopes: ['threads_read_replies', 'threads_manage_replies', 'threads_content_publish'] } } : path.endsWith('/threads_publish') ? { id: 'published-fixture' } : path === '/container-fixture' ? { status: 'FINISHED' } : { id: 'container-fixture' } };
  };
});
after(async () => { await prisma.$disconnect(); await automationDb.$disconnect(); await redisConnection.quit(); });

test('database stores multi-turn history, sent IDs and independent Messenger settings', async () => {
  await aiRule(); await aiRule('FACEBOOK');
  await service.processInstagramAutomationEvent(message('first'));
  await service.processInstagramAutomationEvent(message('second', 'E o horário?'));
  assert.equal(sent.length, 2);
  assert.deepEqual(prompts[1].context.history, [{ role: 'user', text: 'iniciar' }, { role: 'assistant', text: 'A empresa abre às 9h.' }]);
  await service.processInstagramAutomationEvent({ ...message('fb-first'), platform: 'FACEBOOK', accountIgId: 'page-test' });
  assert.deepEqual(prompts[2].context.history, []);
  const ig = await service.getAutomationWorkspace(ids.owner, ids.account);
  const fb = await service.getAutomationWorkspace(ids.owner, ids.account, 'FACEBOOK');
  assert.equal(ig.executions.length, 2); assert.equal(fb.executions.length, 1);
  assert.notEqual(ig.agent.id, fb.agent.id);
  assert.ok(ig.executions.every(item => item.status === 'SENT' && item.providerMessageId));
});
test('real database uniqueness prevents duplicate sends', async () => {
  await aiRule();
  await service.processInstagramAutomationEvent(message('same'));
  await service.processInstagramAutomationEvent(message('same'));
  assert.equal(sent.length, 1); assert.equal(await prisma.automationExecution.count(), 1);
});

test('retry of an interrupted processing attempt is flagged, never automatically resent', async () => {
  await aiRule(); await service.processInstagramAutomationEvent(message('interrupted'));
  await prisma.automationExecution.update({ where: { eventKey: 'interrupted' }, data: { status: 'PROCESSING' } });
  await service.processInstagramAutomationEvent(message('interrupted'));
  assert.equal(sent.length, 1);
  assert.equal((await prisma.automationExecution.findUnique({ where: { eventKey: 'interrupted' } })).status, 'FAILED');
  assert.equal((await prisma.automationConversation.findFirst()).state, 'HUMAN');
});

test('disabling the agent during generation blocks the prepared automatic send', async () => {
  await aiRule(); pausedDuringGeneration = true;
  await service.processInstagramAutomationEvent(message('agent-paused'));
  assert.equal(sent.length, 0);
  assert.equal((await prisma.automationExecution.findFirst()).status, 'NEEDS_REVIEW');
});

test('a human can pause a conversation while the model is running', async () => {
  await aiRule();
  duringGeneration = async () => {
    const conversation = await prisma.automationConversation.findFirst();
    await service.setConversationState(ids.owner, ids.account, conversation.id, 'HUMAN');
  };
  await service.processInstagramAutomationEvent(message('paused-in-flight'));
  assert.equal(sent.length, 0);
  assert.equal((await prisma.automationConversation.findFirst()).state, 'HUMAN');
  assert.equal((await prisma.automationExecution.findFirst()).status, 'NEEDS_REVIEW');
});

test('a model escalation cannot undo an opt-out that happened during generation', async () => {
  await aiRule(); aiResult.shouldEscalate = true;
  duringGeneration = async () => {
    const conversation = await prisma.automationConversation.findFirst();
    await service.setConversationState(ids.owner, ids.account, conversation.id, 'STOPPED');
  };
  await service.processInstagramAutomationEvent(message('stopped-in-flight'));
  assert.equal(sent.length, 0);
  assert.equal((await prisma.automationConversation.findFirst()).state, 'STOPPED');
  assert.equal((await prisma.automationExecution.findFirst()).status, 'SKIPPED');
});
test('Redis lease serializes conflicting updates and is released on failure', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  let acquired; const ready = new Promise(resolve => { acquired = resolve; });
  const first = withConversationLock('fixture-contention', async check => { await check(); acquired(); await gate; });
  await ready;
  await assert.rejects(withConversationLock('fixture-contention', async () => {}), /atualizada/);
  release(); await first;
  await assert.rejects(withConversationLock('fixture-contention', async () => { throw new Error('fixture'); }), /fixture/);
  await withConversationLock('fixture-contention', async check => check());
});
test('human escalation, reviewed send and opt-out are enforced in storage', async () => {
  await aiRule(); aiResult.shouldEscalate = true; aiResult.reason = 'Fora da base';
  await service.processInstagramAutomationEvent(message('review'));
  let execution = await prisma.automationExecution.findUnique({ where: { eventKey: 'review' } });
  assert.equal(execution.status, 'NEEDS_REVIEW'); assert.equal(sent.length, 0);
  await service.sendReviewedAutomationReply(ids.owner, ids.account, execution.id, 'Resposta humana aprovada.');
  assert.equal(sent.length, 1);
  const conversation = await prisma.automationConversation.findFirst();
  assert.equal(conversation.state, 'HUMAN');
  await service.setConversationState(ids.owner, ids.account, conversation.id, 'BOT');
  await service.processInstagramAutomationEvent(message('stop', 'parar'));
  await assert.rejects(service.setConversationState(ids.owner, ids.account, conversation.id, 'BOT'), /autorização/);
  await assert.rejects(service.sendReviewedAutomationReply(ids.owner, ids.account, execution.id, 'Não enviar'), /não receber/);
  assert.equal(sent.length, 1);
});
test('other owners cannot inspect, pause, clear memory or send in the conversation', async () => {
  await aiRule(); await service.processInstagramAutomationEvent(message('owned'));
  const conversation = await prisma.automationConversation.findFirst();
  await assert.rejects(service.getAutomationWorkspace(ids.stranger, ids.account), /não encontrada/);
  await assert.rejects(service.getAutomationConversation(ids.stranger, ids.account, conversation.id), /não encontrada/);
  await assert.rejects(service.setConversationState(ids.stranger, ids.account, conversation.id, 'HUMAN'), /não encontrada/);
  await assert.rejects(service.clearConversationMemory(ids.stranger, ids.account, conversation.id), /não encontrada/);
});
test('Threads-only account can save rules, publish replies and keep them out of Instagram', async () => {
  await aiRule('THREADS', ids.threads);
  await service.processInstagramAutomationEvent({ accountIgId: 'threads-test', platform: 'THREADS', eventKey: 'thread-comment', type: 'COMMENT_ANY', senderId: 'public-person', senderUsername: 'public-person', text: 'iniciar', commentId: 'reply-test', mediaId: 'root-test', timestamp: Date.now() });
  const workspace = await service.getAutomationWorkspace(ids.owner, ids.threads, 'THREADS');
  assert.equal(workspace.executions.length, 1); assert.equal(workspace.executions[0].accountId, null);
  assert.equal(workspace.executions[0].providerMessageId, 'published-fixture');
  assert.equal(workspace.executions[0].publicReplySent, true);
  assert.equal((await service.getAutomationWorkspace(ids.owner, ids.account)).executions.length, 0);
});
