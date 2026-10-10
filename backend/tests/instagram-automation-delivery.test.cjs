const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let account, scopes, linkedIgId, rules, writes, executions, review, claimCount, statusQueries, permissionError;
let agent, aiCalls, aiResult, aiError, conversations;
const { createHash } = require('node:crypto');
require.cache[require.resolve('../dist/services/automation-lock')] = { exports: {
  conversationKey: (...values) => createHash('sha256').update(JSON.stringify(values)).digest('hex'),
  withConversationLock: async (_key, callback) => callback(async () => {}),
} };
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {
  WEBHOOK_VERIFY_TOKEN: 'test-verification', FB_APP_SECRET: 'test-secret', BACKEND_URL: 'https://api.example.test',
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = {
    findFirst: async ({ where }) => account && (where.pageId === account.pageId || where.id === account.id && where.userId === account.userId) ? account : null,
    findUnique: async ({ where }) => account && where.igUserId === account.igUserId ? account : null,
  };
  socialAutomation = { findMany: async () => rules, findFirst: async ({ where }) => rules.find(item => item.id === where.id) };
  instagramAgentSettings = { findUnique: async () => agent };
  privateReplyClaim = { create: async () => ({}), update: async () => ({}) };
  automationConversation = {
    upsert: async ({ where, create, update }) => {
      let item = conversations.find(value => value.scopeKey === where.scopeKey);
      if (!item) { item = { id: `conversation-${conversations.length}`, state: 'BOT', continuationRuleId: null, ...create }; conversations.push(item); }
      else Object.assign(item, update);
      return { ...item };
    },
    update: async ({ where, data }) => ({ ...Object.assign(conversations.find(item => item.id === where.id), data) }),
    updateMany: async ({ where, data }) => {
      const found = conversations.filter(item => item.id === where.id && (!where.state || item.state === where.state));
      found.forEach(item => Object.assign(item, data)); return { count: found.length };
    },
    findUniqueOrThrow: async ({ where }) => conversations.find(item => item.id === where.id),
  };
  automationExecution = {
    findUnique: async ({ where }) => executions.find(item => item.eventKey === where.eventKey),
    count: async ({ where }) => executions.filter(item => item.conversationId === where.conversationId && (item.publicReplySent || item.privateReplySent)).length,
    findMany: async ({ where }) => executions.filter(item => item.conversationId === where.conversationId && item.id !== where.id.not && item.eventAt >= where.eventAt.gte && item.eventAt <= where.eventAt.lte && (!where.publicReplySent || item.publicReplySent)),
    create: async ({ data }) => {
      if (executions.some(item => item.eventKey === data.eventKey)) throw { code: 'P2002' };
      const item = { id: `exec-${executions.length}`, createdAt: new Date(), ...data };
      executions.push(item);
      return item;
    },
    update: async ({ where, data }) => Object.assign(executions.find(item => item.id === where.id) || review, data, { updatedAt: new Date() }),
    updateMany: async () => ({ count: claimCount }),
    findFirst: async ({ where, select }) => {
      if (!select) return review && where.accountId === account.id ? review : null;
      statusQueries.push(where);
      return executions.filter(item => item.accountId === where.accountId && (!where.OR || item.publicReplySent || item.privateReplySent)).at(-1) || null;
    },
  };
} } };
require.cache[require.resolve('../dist/services/ai.service')] = { exports: {
  generateAiContent: async (input, credentials) => {
    aiCalls.push({ input, credentials });
    if (aiError) throw aiError;
    return aiResult;
  },
} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedToken: async () => 'test-page-token',
  getInstagramGrantedPermissions: async () => { if (permissionError) throw permissionError; return scopes; },
  getAiCredentials: async userId => { assert.equal(userId, 'owner'); return { apiKey: 'fixture-ai-key', model: 'fixture-model', source: 'workspace' }; },
} };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async path => ({ id: path.slice(1), instagram_business_account: { id: linkedIgId } }),
  graphPost: async (path, token, params) => { writes.push({ path, token, params }); return { message_id: 'accepted' }; },
} };
const { processInstagramAutomationEvent, sendReviewedAutomationReply, getAutomationStatus } = require('../dist/services/automation.service');
const dm = () => ({ accountIgId: 'ig-456', eventKey: 'dm-1', type: 'MESSAGE_ANY', senderId: 'scoped-sender', text: 'Olá', timestamp: Date.now() });

beforeEach(() => {
  account = { id: 'account', userId: 'owner', pageId: 'page-123', igUserId: 'ig-456', isActive: true };
  scopes = ['instagram_manage_comments', 'instagram_manage_messages'];
  linkedIgId = 'ig-456';
  rules = [{ id: 'rule', trigger: 'MESSAGE_ANY', keywords: [], replyMode: 'TEMPLATE', directMessageReply: 'Resposta de teste' }];
  writes = []; executions = []; conversations = []; review = null; claimCount = 1; statusQueries = []; permissionError = null;
  agent = null; aiCalls = []; aiError = null;
  aiResult = { response: 'Resposta fictícia gerada pela IA.', shouldEscalate: false, reason: '' };
});

test('automatic DMs use the verified Facebook Page and Instagram-scoped recipient', async () => {
  await processInstagramAutomationEvent(dm());
  assert.deepEqual(writes, [{ path: '/page-123/messages', token: 'test-page-token', params: {
    recipient: { id: 'scoped-sender' }, message: { text: 'Resposta de teste' }, messaging_type: 'RESPONSE',
  } }]);
  assert.equal(executions[0].status, 'SENT');
  assert.equal(executions[0].privateReplySent, true);
  assert.equal(aiCalls.length, 0);
});

const enableAi = (autoSend = true) => {
  rules = [{ id: 'ai-rule', trigger: 'MESSAGE_ANY', keywords: [], replyMode: 'AI' }];
  agent = {
    enabled: true, autoSend, tone: 'Claro', instructions: 'Responda usando a base.',
    knowledgeBase: 'Conteúdo fictício de teste.', fallback: 'Uma pessoa vai revisar sua solicitação.',
  };
};

test('AI replies use the configured agent and owner credentials before sending', async () => {
  enableAi();
  await processInstagramAutomationEvent(dm());
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].input.mode, 'automation-reply');
  assert.equal(aiCalls[0].input.context.knowledgeBase, agent.knowledgeBase);
  assert.equal(aiCalls[0].credentials.source, 'workspace');
  assert.equal(writes[0].params.message.text, aiResult.response);
  assert.equal(writes[0].path, '/page-123/messages');
  assert.equal(executions[0].status, 'SENT');
});

test('a ready-made keyword rule takes priority over a catch-all AI rule without calling AI', async () => {
  enableAi();
  rules.push({ id: 'fixed-rule', trigger: 'MESSAGE_KEYWORD', keywords: ['horário'], replyMode: 'TEMPLATE', directMessageReply: 'Texto de horário previamente configurado.' });
  await processInstagramAutomationEvent({ ...dm(), text: 'Qual o horário?' });
  assert.equal(executions[0].automationId, 'fixed-rule');
  assert.equal(writes[0].params.message.text, 'Texto de horário previamente configurado.');
  assert.equal(aiCalls.length, 0);
});

test('AI suggestions await review when automatic sending is off', async () => {
  enableAi(false);
  await processInstagramAutomationEvent(dm());
  assert.equal(executions[0].status, 'NEEDS_REVIEW');
  assert.equal(executions[0].responseText, aiResult.response);
  assert.equal(writes.length, 0);
});

test('AI escalations and provider failures never automatically send a generated answer', async () => {
  enableAi();
  aiResult = { response: 'Não envie automaticamente.', shouldEscalate: true, reason: 'Precisa de avaliação humana.' };
  await processInstagramAutomationEvent(dm());
  aiError = new Error('Fixture provider unavailable');
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-2', senderId: 'second-person' });
  assert.ok(executions.every(item => item.status === 'NEEDS_REVIEW' && item.responseText === agent.fallback));
  assert.equal(writes.length, 0);

  rules = [{ id: 'fixed-rule', trigger: 'MESSAGE_ANY', keywords: [], replyMode: 'TEMPLATE', directMessageReply: 'Resposta pronta continua funcionando.' }];
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-3', senderId: 'third-person' });
  assert.equal(executions[2].status, 'SENT');
  assert.equal(writes[0].params.message.text, 'Resposta pronta continua funcionando.');
  assert.equal(aiCalls.length, 2);
});

test('disabled agents and expired message windows block AI calls and sends', async () => {
  enableAi();
  agent.enabled = false;
  await processInstagramAutomationEvent(dm());
  agent.enabled = true;
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-2', timestamp: Date.now() - 25 * 3600_000 });
  assert.ok(executions.every(item => item.status === 'BLOCKED'));
  assert.equal(aiCalls.length, 0);
  assert.equal(writes.length, 0);
});

test('reviewed DMs use the same verified Page endpoint', async () => {
  review = { id: 'review', status: 'NEEDS_REVIEW', eventType: 'MESSAGE_ANY', eventAt: new Date(), senderId: 'scoped-sender', account };
  assert.deepEqual(await sendReviewedAutomationReply('owner', 'account', 'review', ' Revisada '), { sent: true });
  assert.equal(writes[0].path, '/page-123/messages');
  assert.equal(writes[0].params.message.text, 'Revisada');
  assert.equal(review.status, 'SENT');
});

test('missing or mismatched linked Page never sends a DM', async () => {
  account.pageId = '';
  await processInstagramAutomationEvent(dm());
  assert.equal(executions[0].status, 'FAILED');
  account.pageId = 'page-123'; linkedIgId = 'another-account';
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-2', senderId: 'second-person' });
  assert.equal(executions[1].status, 'FAILED');
  assert.equal(writes.length, 0);
});

test('private replies to comments retain the distinct Instagram-user endpoint', async () => {
  rules = [{ id: 'rule', trigger: 'COMMENT_ANY', keywords: [], replyMode: 'TEMPLATE', privateCommentReply: 'Resposta privada' }];
  await processInstagramAutomationEvent({ ...dm(), type: 'COMMENT_ANY', commentId: 'comment-789' });
  assert.equal(writes[0].path, '/ig-456/messages');
  assert.deepEqual(writes[0].params.recipient, { comment_id: 'comment-789' });
  assert.equal(writes[0].params.messaging_type, undefined);
});

test('duplicate events and already-claimed reviews cannot send twice', async () => {
  await processInstagramAutomationEvent(dm());
  await processInstagramAutomationEvent(dm());
  assert.equal(writes.length, 1);
  review = { id: 'review', status: 'NEEDS_REVIEW', eventType: 'MESSAGE_ANY', eventAt: new Date(), senderId: 'scoped-sender', account };
  claimCount = 0;
  await assert.rejects(sendReviewedAutomationReply('owner', 'account', 'review', 'Resposta'), /já foi iniciada/);
  assert.equal(writes.length, 1);
});

test('expired reply window and missing or invalid permission block all sends', async () => {
  await processInstagramAutomationEvent({ ...dm(), timestamp: Date.now() - 25 * 3600_000 });
  scopes = [];
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-2' });
  permissionError = new Error('Invalid authorization');
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-3' });
  assert.ok(executions.every(item => item.status === 'BLOCKED'));
  assert.equal(writes.length, 0);
});

test('status reports permissions separately from account-scoped processing and send evidence', async () => {
  let status = await getAutomationStatus('owner', 'account', true);
  assert.equal(status.canAutomateMessages, true);
  assert.deepEqual(status.activity, { lastEventProcessedAt: null, lastReplyAcceptedAt: null });
  await processInstagramAutomationEvent(dm());
  status = await getAutomationStatus('owner', 'account', true);
  assert.equal(status.activity.lastEventProcessedAt, executions[0].createdAt);
  assert.equal(status.activity.lastReplyAcceptedAt, executions[0].updatedAt);
  assert.ok(statusQueries.every(where => where.accountId === 'account'));
  permissionError = new Error('Invalid authorization');
  status = await getAutomationStatus('owner', 'account', true);
  assert.equal(status.canAutomateMessages, false);
  assert.match(status.permissionCheckError, /Confira a conexão/);
});

test('other workspaces cannot inspect activity or send reviewed replies', async () => {
  review = { id: 'review', status: 'NEEDS_REVIEW', account };
  await assert.rejects(getAutomationStatus('other', 'account', true), /não encontrada/);
  await assert.rejects(sendReviewedAutomationReply('other', 'account', 'review', 'Resposta'), /não encontrad/);
  assert.equal(statusQueries.length, 0);
  assert.equal(writes.length, 0);
});

test('multi-turn AI receives only this contact history and actually sent replies', async () => {
  enableAi();
  await processInstagramAutomationEvent({ ...dm(), text: 'Quero o plano básico' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'other-1', senderId: 'another-person', text: 'Mensagem de outra pessoa' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-2', text: 'E quanto custa ele?' });
  assert.deepEqual(aiCalls[2].input.context.history, [
    { role: 'user', text: 'Quero o plano básico' },
    { role: 'assistant', text: aiResult.response },
  ]);
  assert.equal(aiCalls[1].input.context.history.length, 0);
  assert.equal(conversations.length, 2);
});

test('keyword conversation continues only with opt-in and ready-made rules still take priority', async () => {
  enableAi(); rules[0].trigger = 'MESSAGE_KEYWORD'; rules[0].keywords = ['começar']; rules[0].continueConversation = true;
  await processInstagramAutomationEvent({ ...dm(), text: 'Começar atendimento' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'next', text: 'E o nome da empresa?' });
  assert.equal(aiCalls.length, 2);
  assert.equal(executions[1].status, 'SENT');
  rules.push({ id: 'hours', trigger: 'MESSAGE_KEYWORD', keywords: ['horário'], replyMode: 'TEMPLATE', directMessageReply: '9h às 18h' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'hours', text: 'Qual horário?' });
  assert.equal(aiCalls.length, 2);
  assert.equal(writes.at(-1).params.message.text, '9h às 18h');
});

test('existing keyword rules do not silently become catch-all conversations', async () => {
  enableAi(); rules[0].trigger = 'MESSAGE_KEYWORD'; rules[0].keywords = ['teste ia'];
  await processInstagramAutomationEvent({ ...dm(), text: 'teste ia' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'next', text: 'Tudo bem?' });
  assert.equal(aiCalls.length, 1);
  // Unanswered by any rule: it waits for a manual reply instead of being answered automatically.
  assert.equal(executions[1].status, 'NEEDS_REVIEW');
});

test('stop and human requests pause future sends, even ready-made replies', async () => {
  enableAi();
  await processInstagramAutomationEvent({ ...dm(), text: 'Quero falar com uma pessoa' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'next', text: 'Olá' });
  assert.equal(conversations[0].state, 'HUMAN');
  assert.equal(executions[1].status, 'NEEDS_REVIEW');
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'stop', text: 'Pare de responder!' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'after-stop', text: 'Olá' });
  assert.equal(conversations[0].state, 'STOPPED');
  assert.equal(executions[3].status, 'SKIPPED');
  assert.equal(aiCalls.length, 0);
  assert.equal(writes.length, 0);
});

test('AI escalation remains paused on the next message until human resumes', async () => {
  enableAi(); aiResult.shouldEscalate = true; aiResult.reason = 'Solicitação de reembolso';
  await processInstagramAutomationEvent(dm());
  aiResult.shouldEscalate = false;
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'next', text: 'Agora pode responder' });
  assert.equal(aiCalls.length, 1);
  assert.equal(conversations[0].state, 'HUMAN');
  assert.equal(writes.length, 0);
});

test('memory disabled and memory reset exclude previous content from provider', async () => {
  enableAi(); agent.memoryDays = 0;
  await processInstagramAutomationEvent(dm());
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'next' });
  assert.deepEqual(aiCalls[1].input.context.history, []);
  agent.memoryDays = 7; conversations[0].memoryClearedAt = new Date(Date.now() + 1);
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'reset', timestamp: Date.now() + 2 });
  assert.deepEqual(aiCalls[2].input.context.history, []);
});

test('private and public history for the same person are isolated', async () => {
  enableAi();
  await processInstagramAutomationEvent({ ...dm(), text: 'Informação da conversa privada' });
  rules = [{ id: 'public-ai', trigger: 'COMMENT_ANY', keywords: [], replyMode: 'AI' }];
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'comment', type: 'COMMENT_ANY', mediaId: 'post', commentId: 'comment', text: 'Comentário público' });
  assert.deepEqual(aiCalls[1].input.context.history, []);
  assert.equal(aiCalls[1].input.context.conversationKind, 'PUBLIC');
  assert.equal(conversations.length, 2);
});

test('Messenger and Instagram use separate histories even for the same sender identifier', async () => {
  enableAi(); scopes.push('pages_messaging');
  await processInstagramAutomationEvent(dm());
  await processInstagramAutomationEvent({ ...dm(), platform: 'FACEBOOK', accountIgId: 'page-123', eventKey: 'fb-dm' });
  assert.equal(executions[1].platform, 'FACEBOOK');
  assert.equal(aiCalls[1].input.context.platform, 'FACEBOOK');
  assert.deepEqual(aiCalls[1].input.context.history, []);
  assert.equal(writes[1].path, '/page-123/messages');
});

test('missing Messenger permission cannot be replaced by Instagram scopes', async () => {
  await processInstagramAutomationEvent({ ...dm(), platform: 'FACEBOOK', accountIgId: 'page-123', eventKey: 'fb-dm' });
  assert.equal(executions[0].status, 'BLOCKED');
  assert.equal(writes.length, 0);
});

test('reply limit and media-only messages request a human instead of inventing content', async () => {
  enableAi(); agent.maxRepliesPerHour = 1;
  await processInstagramAutomationEvent(dm());
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'limited' });
  assert.equal(executions[1].status, 'NEEDS_REVIEW');
  assert.equal(conversations[0].state, 'HUMAN');
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'media', senderId: 'another-person', text: '[Mensagem com mídia]' });
  assert.equal(executions[2].status, 'NEEDS_REVIEW');
  assert.equal(aiCalls.length, 1);
  assert.equal(writes.length, 1);
});

test('missing timestamps, future timestamps and delayed older messages fail closed', async () => {
  await processInstagramAutomationEvent({ ...dm(), timestamp: undefined });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'future', timestamp: Date.now() + 3600_000 });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'valid' });
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'old', timestamp: Date.now() - 5000 });
  assert.equal(executions[0].status, 'BLOCKED');
  assert.equal(executions[1].status, 'BLOCKED');
  assert.equal(executions[3].status, 'SKIPPED');
  assert.equal(writes.length, 1);
});
