const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const hook = read('hooks/useCompanyProfiles.ts');
const mod = { exports: {} };
const stub = (name) => (name === 'react' ? { useMemo: (fn) => fn() } : {});
new Function('module', 'exports', 'require', ts.transpileModule(hook, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports, stub);
const { ofCompany } = mod.exports;

test('only profiles linked to the selected company are offered; unlinked or other companies never are', () => {
  const profiles = [
    { id: 'a', workspaceAccountId: 'uxmove' },
    { id: 'b', workspaceAccountId: 'rota' },
    { id: 'c', workspaceAccountId: null },
    { id: 'd' },
  ];
  assert.deepEqual(ofCompany(profiles, 'uxmove').map((p) => p.id), ['a']);
  assert.deepEqual(ofCompany(profiles, 'nobody'), []);
  assert.deepEqual(ofCompany(profiles, ''), []);
  assert.deepEqual(ofCompany(undefined, 'uxmove'), []);
});

test('reports follow the company chosen at the top and never fall back to the first account of the list', () => {
  const facebook = read('components/dashboard/FacebookReport.tsx');
  assert.match(facebook, /const accountId = company\?\.pageId \? company\.id : ''/);
  assert.doesNotMatch(facebook, /accounts\[0\]/);
  for (const file of ['components/dashboard/ThreadsReport.tsx', 'components/dashboard/XReport.tsx']) {
    const source = read(file);
    assert.match(source, /useCompanyProfiles\(\)/, file);
    assert.match(source, /workspace=\$\{encodeURIComponent\(companyId\)\}/, file);
  }
  const report = read('app/report/page.tsx');
  assert.match(report, /const account = activeAccount/);
  assert.match(report, /const threadsId = companyThreads\[0\]\?\.id/);
  assert.doesNotMatch(report, /threadsQuery\.data \|\| \[\]\) as Array<\{ id: string \}>\)\[0\]/);
});

test('the composer and calendar only use the company profiles, with no first-of-list fallback', () => {
  const composer = read('app/composer/page.tsx');
  assert.match(composer, /const threadsAccounts = ofCompany\(allThreadsAccounts, accountId\)/);
  assert.match(composer, /const xAccounts = ofCompany\(allXAccounts, accountId\)/);
  assert.match(composer, /const youtubeAccounts = ofCompany\(allYouTubeAccounts, accountId\)/);
  assert.match(composer, /const selectedXAccount = xAccounts\.find\(\(account\) => account\.id === xAccountId\)\n/);
  const calendar = read('app/calendar/page.tsx');
  assert.doesNotMatch(calendar, /\|\| xAccounts\[0\]|\|\| youtubeAccounts\[0\]/);
  const automations = read('app/automations/page.tsx');
  assert.match(automations, /ofCompany\(threadsQuery\.data, activeAccount\?\.id \|\| ""\)/);
});

test('connecting Threads, X or YouTube from Accounts links the profile to the selected company', () => {
  const accounts = read('app/accounts/page.tsx');
  for (const network of ['threads', 'x', 'youtube']) assert.match(accounts, new RegExp(`/auth/${network}/url\\?workspace=\\$\\{encodeURIComponent\\(getSelectedAccountId\\(\\)\\)\\}`));
  assert.match(accounts, /<CompanyLinkSelect network="threads"/);
});
