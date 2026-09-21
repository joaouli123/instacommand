const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertPostReady } = require('../dist/services/post-readiness');
test('draft without media cannot be published or scheduled on Instagram/Facebook', () => {
  for (const platform of ['INSTAGRAM', 'FACEBOOK']) assert.throws(() => assertPostReady({ mediaType: 'IMAGE', mediaUrls: [], platforms: [platform], caption: 'Draft' }), /rascunho/);
});
test('Threads-only text is allowed but empty text is rejected', () => {
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'IMAGE', mediaUrls: [], platforms: ['THREADS'], caption: 'Text' }));
  assert.throws(() => assertPostReady({ mediaType: 'IMAGE', mediaUrls: [], platforms: ['THREADS'], caption: ' ' }));
});
test('carousel and single-media cardinality are enforced', () => {
  assert.throws(() => assertPostReady({ mediaType: 'CAROUSEL', mediaUrls: ['a'] }));
  assert.throws(() => assertPostReady({ mediaType: 'IMAGE', mediaUrls: ['a', 'b'] }));
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'CAROUSEL', mediaUrls: ['a', 'b'] }));
});
test('unsupported destinations and Facebook Stories are rejected', () => {
  assert.throws(() => assertPostReady({ mediaType: 'STORY', mediaUrls: ['a'], platforms: ['FACEBOOK'] }));
  assert.throws(() => assertPostReady({ mediaType: 'IMAGE', mediaUrls: ['a'], platforms: ['FAKE'] }));
});
