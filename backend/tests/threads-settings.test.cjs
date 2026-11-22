const { test } = require('node:test');
const assert = require('node:assert/strict');

const env = { ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!', FRONTEND_URL: 'https://app.example.test', BACKEND_URL: 'https://api.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads' };
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
const { validateThreadsSettings, threadsReplyControlParam } = require('../dist/services/threads-settings');

test('who can reply on Threads accepts only the values Threads knows', () => {
  assert.equal(validateThreadsSettings(undefined), null);
  assert.equal(validateThreadsSettings({ replyControl: '' }), null);
  assert.deepEqual(validateThreadsSettings({ replyControl: 'followers_only' }), { replyControl: 'followers_only' });
  assert.throws(() => validateThreadsSettings({ replyControl: 'nobody' }));
  assert.throws(() => validateThreadsSettings('everyone'));
});

test('reply_control is sent only when the post does not keep the default', () => {
  assert.deepEqual(threadsReplyControlParam(null), {});
  assert.deepEqual(threadsReplyControlParam({ replyControl: 'everyone' }), {});
  assert.deepEqual(threadsReplyControlParam({ replyControl: 'mentioned_only' }), { reply_control: 'mentioned_only' });
  assert.deepEqual(threadsReplyControlParam({ replyControl: 'bogus' }), {});
});
