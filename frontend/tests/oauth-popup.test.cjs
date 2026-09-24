const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const accountsPage = fs.readFileSync(path.join(__dirname, '../src/app/accounts/page.tsx'), 'utf8');
const providers = fs.readFileSync(path.join(__dirname, '../src/app/providers.tsx'), 'utf8');

test('social authorization opens separately and refreshes connected account state across tabs', () => {
  assert.match(accountsPage, /window\.open\("about:blank", "_blank"\)/);
  assert.match(accountsPage, /authWindow\.location\.replace\(result\.url\)/);
  assert.match(accountsPage, /channel\.postMessage\(\{ type: "accounts-connected" \}\)/);
  assert.match(accountsPage, /refreshAccounts\(\)/);
  assert.match(providers, /new BroadcastChannel\('instacommand-oauth'\)/);
  assert.match(providers, /invalidateQueries\(\{ queryKey: \['accounts'\] \}\)/);
  assert.match(providers, /invalidateQueries\(\{ queryKey: \['threads-accounts'\] \}\)/);
});
