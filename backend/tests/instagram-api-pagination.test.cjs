const { test, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { graphGetAllWithStatus } = require('../dist/utils/instagram-api');
const originalFetch = global.fetch;
global.fetch = async input => {
  const url = new URL(String(input));
  if (!url.searchParams.has('after')) {
    return {
      ok: true,
      json: async () => ({
        data: [{ id: 'first-page' }],
        paging: { next: 'https://graph.facebook.com/v25.0/ig-user/media?after=cursor&access_token=must-not-leak' },
      }),
    };
  }
  return { ok: true, json: async () => ({ data: [{ id: 'second-page' }] }) };
};
after(() => { global.fetch = originalFetch; });

test('pagination reports capped reads as incomplete and exhausts all pages when allowed', async () => {
  const capped = await graphGetAllWithStatus('/ig-user/media', 'test-token', { limit: 1 }, 1);
  assert.equal(capped.complete, false);
  assert.equal(capped.pagesFetched, 1);
  assert.deepEqual(capped.items, [{ id: 'first-page' }]);

  const complete = await graphGetAllWithStatus('/ig-user/media', 'test-token', { limit: 1 }, 2);
  assert.equal(complete.complete, true);
  assert.equal(complete.pagesFetched, 2);
  assert.deepEqual(complete.items, [{ id: 'first-page' }, { id: 'second-page' }]);
});
