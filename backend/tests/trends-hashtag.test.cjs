const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { normalizeHashtag } = require('../dist/services/trends.service');

test('hashtags are normalized and validated', () => {
  assert.equal(normalizeHashtag('#MarketingDigital'), 'marketingdigital');
  assert.equal(normalizeHashtag('  ##café_2026 '), 'café_2026');
  assert.throws(() => normalizeHashtag('#'));
  assert.throws(() => normalizeHashtag('a!b'));
});

const { hashtagSuggestions, hashtagLookupError } = require('../dist/services/trends.service');
const { InstagramApiError } = require('../dist/utils/errors');

test('multi-word queries are joined and split into suggestions', () => {
  assert.equal(normalizeHashtag('app transporte'), 'apptransporte');
  assert.equal(normalizeHashtag('#App Transporte'), 'apptransporte');
  assert.deepEqual(hashtagSuggestions('app transporte'), ['apptransporte', 'app', 'transporte']);
  assert.deepEqual(hashtagSuggestions('marketing'), []);
});

test('hashtag Graph errors map to clear messages and never 401', () => {
  const meta = (c, s, st = 400) => new InstagramApiError('x', st, { metaCode: c, metaSubcode: s });
  const limit = hashtagLookupError(meta(24), 'a');
  assert.equal(limit.statusCode, 429);
  assert.match(limit.message, /30 hashtags/);
  assert.match(hashtagLookupError(meta(100), 'abc').message, /#abc/);
  assert.match(hashtagLookupError(meta(10, undefined, 403), 'a').message, /Public Content Access/);
  assert.notEqual(hashtagLookupError(meta(190, undefined, 401), 'a').statusCode, 401);
});
