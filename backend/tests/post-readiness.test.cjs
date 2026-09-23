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
test('explicit Threads text format is exclusive to Threads, has no media, and is limited to 500 characters', () => {
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], platforms: ['THREADS'], caption: 'Text' }));
  assert.throws(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], platforms: ['INSTAGRAM', 'THREADS'], caption: 'Text' }), /está disponível no Threads/);
  assert.throws(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: ['https://media.example/image.jpg'], platforms: ['THREADS'], caption: 'Text' }), /não pode conter arquivos/);
  assert.throws(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], platforms: ['THREADS'], caption: 'x'.repeat(501) }), /500 caracteres/);
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
