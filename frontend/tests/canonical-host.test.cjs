const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/canonical-host.ts'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports, require);
const { canonicalRedirect } = mod.exports;

test('legacy panel addresses move to the canonical domain keeping path and query', () => {
  const canonical = 'https://uxgram.com.br';
  assert.equal(canonicalRedirect('https://instagram.uxcode.com.br/calendar?view=list', 'instagram.uxcode.com.br', canonical), 'https://uxgram.com.br/calendar?view=list');
  assert.equal(canonicalRedirect('https://instacommand.179.198.98.63.sslip.io/', 'instacommand.179.198.98.63.sslip.io', canonical), 'https://uxgram.com.br/');
  assert.equal(canonicalRedirect('https://www.uxgram.com.br/login', 'www.uxgram.com.br', canonical), 'https://uxgram.com.br/login');
});

test('the canonical host, unknown hosts and a missing FRONTEND_URL are served as is', () => {
  assert.equal(canonicalRedirect('https://uxgram.com.br/', 'uxgram.com.br', 'https://uxgram.com.br'), null);
  assert.equal(canonicalRedirect('http://localhost:3000/', 'localhost:3000', 'https://uxgram.com.br'), null);
  assert.equal(canonicalRedirect('https://instagram.uxcode.com.br/', 'instagram.uxcode.com.br', undefined), null);
  // Before the switch, the current canonical address keeps working.
  assert.equal(canonicalRedirect('https://instagram.uxcode.com.br/', 'instagram.uxcode.com.br', 'https://instagram.uxcode.com.br'), null);
});
