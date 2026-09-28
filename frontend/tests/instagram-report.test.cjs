const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/instagram-report.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} }; vm.runInNewContext(compiled, context);
const { instagramProfileWindow, instagramFollowerCards } = context.exports;
const plain = value => JSON.parse(JSON.stringify(value));
test('long publication periods cannot be labeled as matching profile totals', () => {
  const result = instagramProfileWindow({ period: { days: 30 } }, 90);
  assert.equal(result.label, 'Últimos 30 dias');
  assert.match(result.notice, /últimos 90 dias/);
  assert.match(result.notice, /alcance não é somado/);
  assert.match(instagramProfileWindow(null, 730).notice, /últimos 30 dias/);
});
test('short profile totals follow the selected period', () => {
  assert.equal(instagramProfileWindow({ period: { days: 7 } }, 7).label, 'Últimos 7 dias');
  assert.doesNotMatch(instagramProfileWindow(null, 7).notice, /30 dias/);
});
test('follow cards retain genuine zero and negative net while missing remains missing', () => {
  assert.deepEqual(plain(instagramFollowerCards({ followers: { gained: 0, lost: 6, net: -6 } })).map(card => card.value), [0, 6, -6]);
  assert.deepEqual(plain(instagramFollowerCards(null)).map(card => card.value), [null, null, null]);
});
test('profile report participates in account/period cancellation and is cleared before the next fetch', () => {
  const component = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/InstagramAnalytics.tsx'), 'utf8');
  assert.match(component, /setProfileReport\(null\)/);
  assert.match(component, /get\(`profile-report\?days=\$\{days\}`\)/);
  assert.ok(component.indexOf('if (requestId !== latestRequest.current) return') < component.indexOf('setProfileReport(nextProfileReport'));
});
