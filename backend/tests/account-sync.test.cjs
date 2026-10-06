const { test } = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
let release;
require.cache[require.resolve('../dist/services/instagram/insights.service')] = { exports: {
  saveProfileSnapshot: (id) => {
    calls.push(id);
    if (id === 'broken') return Promise.reject(new Error('Meta unavailable'));
    return new Promise((resolve) => { release = () => resolve({ importedMedia: 1, account: id }); });
  },
} };
const { syncAccountOnce, syncAccountsInBackground, isAccountSyncRunning } = require('../dist/services/account-sync.service');
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('the automatic sync after connecting and a manual click share one run', async () => {
  calls.length = 0;
  const first = syncAccountOnce('acc1');
  const second = syncAccountOnce('acc1');
  assert.equal(first, second);
  assert.equal(isAccountSyncRunning('acc1'), true);
  release();
  assert.deepEqual(await first, { importedMedia: 1, account: 'acc1' });
  assert.equal(isAccountSyncRunning('acc1'), false);
  assert.deepEqual(calls, ['acc1']);
});

test('background sync runs each connected account once, in order, and survives failures', async () => {
  calls.length = 0;
  const originalError = console.error;
  console.error = () => {};
  try {
    syncAccountsInBackground(['broken', 'acc2', 'acc2']);
    await tick(); await tick();
    assert.deepEqual(calls, ['broken', 'acc2']);
    assert.equal(isAccountSyncRunning('acc2'), true);
    release();
    await tick();
    assert.equal(isAccountSyncRunning('acc2'), false);
  } finally {
    console.error = originalError;
  }
});
