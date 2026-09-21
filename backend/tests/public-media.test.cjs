const { test } = require('node:test');
const assert = require('node:assert/strict');
const env = { MEDIA_PUBLIC_URL: 'http://media.example.test/uploads', FRONTEND_URL: 'https://app.example.test' };
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
const { publicMediaBase, normalizeMediaUrl, publicMediaHeaders } = require('../dist/utils/public-media');
test('HTTPS frontend receives HTTPS upload URLs and legacy own URLs are repaired', () => {
  assert.equal(publicMediaBase(), 'https://media.example.test/uploads');
  assert.equal(normalizeMediaUrl('http://media.example.test/uploads/test.jpg'), 'https://media.example.test/uploads/test.jpg');
  assert.equal(normalizeMediaUrl('https://other.test/test.jpg'), 'https://other.test/test.jpg');
  assert.equal(normalizeMediaUrl('http://media.example.test/uploads-attacker/test.jpg'), 'http://media.example.test/uploads-attacker/test.jpg');
});
test('cross-origin embedding is explicitly scoped to public file responses', () => {
  const headers = {}; publicMediaHeaders({ setHeader: (key, value) => headers[key] = value });
  assert.deepEqual(headers, { 'Cross-Origin-Resource-Policy': 'cross-origin' });
});
