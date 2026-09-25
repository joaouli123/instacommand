const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAiOutput } = require('../dist/services/ai-output');
const { parseInstagramWebhookEvents } = require('../dist/services/instagram-webhook-parser');
const { hasKeywordMatch, matchesEvent } = require('../dist/services/automation-logic');

test('automation matching is case-insensitive, keyword bounded by substring, and network-specific', () => {
  assert.equal(hasKeywordMatch({ trigger: 'COMMENT_ANY', keywords: [] }, ''), true);
  assert.equal(hasKeywordMatch({ trigger: 'MESSAGE_KEYWORD', keywords: ['preço', 'agenda'] }, 'Qual o PREÇO?'), true);
  assert.equal(hasKeywordMatch({ trigger: 'COMMENT_KEYWORD', keywords: ['orçamento'] }, 'Oi, tudo bem?'), false);
  assert.equal(matchesEvent('COMMENT_KEYWORD', 'COMMENT_ANY'), true);
  assert.equal(matchesEvent('MESSAGE_ANY', 'COMMENT_ANY'), false);
});

test('Instagram webhook parser maps only inbound comment and text-message events', () => {
  const events = parseInstagramWebhookEvents({ entry: [{
    id: 'ig-account-1',
    changes: [
      { field: 'comments', value: { id: 'comment-1', text: 'Oi', from: { id: 'person-1', username: 'ana' }, media: { id: 'media-1' }, timestamp: 1_790_000_000_000 } },
      { field: 'comments', value: { id: 'own-comment', text: 'Minha resposta', from: { id: 'ig-account-1' }, media: { id: 'media-1' } } },
      { field: 'mentions', value: { id: 'ignored' } },
      { field: 'comments', value: { id: 'no-text' } },
    ],
    messaging: [
      { sender: { id: 'person-2' }, timestamp: 1_790_000_000_100, message: { mid: 'message-1', text: 'Olá' } },
      { sender: { id: 'business' }, message: { mid: 'echo-1', text: 'echo', is_echo: true } },
      { sender: { id: 'person-3' }, timestamp: 1_790_000_001, message: { mid: 'attachment-1', attachments: [{ type: 'image' }] } },
    ],
  }] });

  assert.equal(events.length, 3);
  assert.deepEqual(events[0], {
    accountIgId: 'ig-account-1', eventKey: 'ig-account-1:comment:comment-1', type: 'COMMENT_ANY',
    senderId: 'person-1', senderUsername: 'ana', text: 'Oi', mediaId: 'media-1', commentId: 'comment-1', timestamp: 1_790_000_000_000,
  });
  assert.equal(events[1].eventKey, 'ig-account-1:message:message-1');
  assert.equal(events[1].type, 'MESSAGE_ANY');
  assert.equal(events[1].senderId, 'person-2');
  assert.equal(events[2].text, '[Mensagem com mídia]');
  assert.equal(events[2].timestamp, 1_790_000_001_000);
});

test('AI automation reply output requires an escalation decision and reason', () => {
  const safe = { response: 'Oi! Posso ajudar.', shouldEscalate: false, reason: '' };
  assert.deepEqual(validateAiOutput('automation-reply', safe), safe);
  assert.throws(() => validateAiOutput('automation-reply', { response: 'Oi', shouldEscalate: 'no', reason: '' }));
  assert.throws(() => validateAiOutput('automation-reply', { response: '', shouldEscalate: false, reason: '' }));
});
