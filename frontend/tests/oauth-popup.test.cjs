const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const accountsPage = fs.readFileSync(path.join(__dirname, '../src/app/accounts/page.tsx'), 'utf8');
const providers = fs.readFileSync(path.join(__dirname, '../src/app/providers.tsx'), 'utf8');
const broadcastSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/oauth-broadcast.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Each call is one browser tab: its own module instance (own tab id) and window.
function openTab() {
  const listeners = {};
  const window = {
    setTimeout, clearTimeout,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((item) => item !== fn); },
    dispatchEvent: (event) => { (listeners[event.type] || []).forEach((fn) => fn(event)); return true; },
  };
  const loaded = { exports: {} };
  new Function('module', 'exports', 'window', 'localStorage', broadcastSource)(loaded, loaded.exports, window, { setItem() {} });
  return { ...loaded.exports, window };
}

test('the connection tab hands off to the original tab, which refreshes once', async () => {
  const original = openTab();
  const popup = openTab();
  let refreshed = 0;
  const stop = original.subscribeAccountsConnected(() => { refreshed += 1; });
  // The popup's own app shell also listens; it must not answer its own tab.
  let popupSelf = 0;
  const stopPopupShell = popup.subscribeAccountsConnected(() => { popupSelf += 1; });
  assert.equal(await popup.announceAccountsConnected(500), true);
  assert.equal(refreshed, 1);
  assert.equal(popupSelf, 0);
  stop(); stopPopupShell();
});

test('a lone tab (same-tab redirect or mobile) is never told to close itself', async () => {
  const only = openTab();
  const stop = only.subscribeAccountsConnected(() => assert.fail('a tab must ignore its own announcement'));
  assert.equal(await only.announceAccountsConnected(200), false);
  stop();
});

test('wiring: popup opens synchronously, connection refreshes every screen and follows the first sync', () => {
  assert.match(accountsPage, /window\.open\("about:blank", "_blank"\)/);
  assert.match(accountsPage, /authWindow\.location\.replace\(result\.url\)/);
  assert.match(accountsPage, /announceAccountsConnected\(\)/);
  assert.match(accountsPage, /notifySameTabAccountsConnected\(\)/);
  assert.match(accountsPage, /window\.close\(\)/);
  assert.match(providers, /subscribeAccountsConnected\(/);
  assert.match(providers, /queryClient\.invalidateQueries\(\)/);
  assert.match(providers, /account\.syncing/);
});
