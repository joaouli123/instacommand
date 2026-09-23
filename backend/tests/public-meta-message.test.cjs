const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicMetaMessage } = require('../dist/utils/public-meta-message');

test('hashtag access warning explains that manual tags and publishing remain available', () => {
  const message = publicMetaMessage('Instagram Public Content Access is required');
  assert.match(message, /busca pública de hashtags/i);
  assert.match(message, /não bloqueia a publicação/i);
  assert.match(message, /manualmente/i);
});

test('Facebook Page publishing permission error names the required permission and recovery', () => {
  const message = publicMetaMessage('(#200) Requires pages_manage_posts permission');
  assert.match(message, /pages_manage_posts/);
  assert.match(message, /reconecte a conta/i);
  assert.match(message, /outras redes/i);
});

test('unrecognized Meta failures remain unchanged', () => {
  assert.equal(publicMetaMessage('Something else failed'), 'Something else failed');
});
