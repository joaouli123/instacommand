const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let account, scopes, linkedIgId, rules, writes, executions, review, claimCount, statusQueries, permissionError;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {
  WEBHOOK_VERIFY_TOKEN: 'test-verification', FB_APP_SECRET: 'test-secret', BACKEND_URL: 'https://api.example.test',
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  instagramAccount = {
    findFirst: async ({ where }) => account && where.id === account.id && where.userId === account.userId ? account : null,
    findUnique: async ({ where }) => account && where.igUserId === account.igUserId ? account : null,
  };
  socialAutomation = { findMany: async () => rules };
  instagramAgentSettings = { findUnique: async () => null };
  privateReplyClaim = { create: async () => ({}), update: async () => ({}) };
  automationExecution = {
    create: async ({ data }) => {
      if (executions.some(item => item.eventKey === data.eventKey)) throw { code: 'P2002' };
      const item = { id: `exec-${executions.length}`, createdAt: new Date(), ...data };
      executions.push(item);
      return item;
    },
    update: async ({ where, data }) => Object.assign(executions.find(item => item.id === where.id) || review, data, { updatedAt: new Date() }),
    updateMany: async () => ({ count: claimCount }),
    findFirst: async ({ where, select }) => {
      if (!select) return review && where.account.userId === account.userId ? review : null;
      statusQueries.push(where);
      return executions.filter(item => item.accountId === where.accountId && (!where.OR || item.publicReplySent || item.privateReplySent)).at(-1) || null;
    },
  };
} } };
require.cache[require.resolve('../dist/services/ai.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {
  getDecryptedToken: async () => 'test-page-token',
  getInstagramGrantedPermissions: async () => { if (permissionError) throw permissionError; return scopes; },
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
  writes = []; executions = []; review = null; claimCount = 1; statusQueries = []; permissionError = null;
});

test('automatic DMs use the verified Facebook Page and Instagram-scoped recipient', async () => {
  await processInstagramAutomationEvent(dm());
  assert.deepEqual(writes, [{ path: '/page-123/messages', token: 'test-page-token', params: {
    recipient: { id: 'scoped-sender' }, message: { text: 'Resposta de teste' }, messaging_type: 'RESPONSE',
  } }]);
  assert.equal(executions[0].status, 'SENT');
  assert.equal(executions[0].privateReplySent, true);
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
  await processInstagramAutomationEvent({ ...dm(), eventKey: 'dm-2' });
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
  assert.equal(status.permissionCheckError, 'Invalid authorization');
});

test('other workspaces cannot inspect activity or send reviewed replies', async () => {
  review = { id: 'review', status: 'NEEDS_REVIEW', account };
  await assert.rejects(getAutomationStatus('other', 'account', true), /não encontrada/);
  await assert.rejects(sendReviewedAutomationReply('other', 'account', 'review', 'Resposta'), /não encontrado/);
  assert.equal(statusQueries.length, 0);
  assert.equal(writes.length, 0);
});
