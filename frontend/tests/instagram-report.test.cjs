const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/instagram-report.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} }; vm.runInNewContext(compiled, context);
const { instagramProfileWindow, instagramFollowerCards, instagramCountryLabel } = context.exports;
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
test('demographics uses readable country names and preserves unknown provider labels', () => {
  assert.equal(instagramCountryLabel('BR'), 'Brasil');
  assert.equal(instagramCountryLabel('US'), 'Estados Unidos');
  assert.equal(instagramCountryLabel('Não informado'), 'Não informado');
});

test('cards compare each metric with the previous period of the same length', () => {
  const ts = require('typescript');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/lib/instagram-report.ts'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports);
  const { periodChange } = mod.exports;
  assert.deepEqual(periodChange(1098, 900), { direction: 'up', percent: (1098 - 900) / 900 * 100 });
  assert.equal(periodChange(80, 100).direction, 'down');
  assert.equal(Math.round(periodChange(80, 100).percent), -20);
  assert.deepEqual(periodChange(5, 5), { direction: 'flat', percent: 0 });
  assert.deepEqual(periodChange(3, 0), { direction: 'up', percent: null });
  assert.equal(periodChange(10, null), null);
  assert.equal(periodChange(null, 10), null);
});
