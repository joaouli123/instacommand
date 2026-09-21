const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let result, failure, calls;
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path, token, params) => {
    calls.push({ path, token, params });
    if (failure) throw failure;
    return result;
  },
} };
const { verifyFacebookPageLink } = require('../dist/services/instagram/facebook-link.service');
beforeEach(() => { calls = []; failure = null; result = { id: 'page1', name: 'Page', instagram_business_account: { id: 'ig1' } }; });
test('allows only the exact Page and Instagram relationship returned by Meta', async () => {
  assert.deepEqual(await verifyFacebookPageLink('page1', 'ig1', 'test-token'), { id: 'page1', name: 'Page' });
  assert.equal(calls[0].params.fields, 'id,name,instagram_business_account');
});
test('missing mapping stops before any network request', async () => {
  await assert.rejects(verifyFacebookPageLink('', 'ig1', 'test-token'), /confirmada/);
  assert.equal(calls.length, 0);
});
test('same Page name cannot override a mismatched Instagram id', async () => {
  result.instagram_business_account.id = 'other';
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'), /não está vinculada/);
});
test('missing edge and wrong Page id are rejected', async () => {
  delete result.instagram_business_account;
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'));
  result = { id: 'other', instagram_business_account: { id: 'ig1' } };
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'));
});
test('permission or network errors fail closed', async () => {
  failure = new Error('Graph permission denied');
  await assert.rejects(verifyFacebookPageLink('page1', 'ig1', 'test-token'), /permission denied/);
});
