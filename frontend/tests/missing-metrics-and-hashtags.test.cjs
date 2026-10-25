const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = file => fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8');

test('community comments do not present missing likes as zero', () => {
  const source = read('community/page.tsx');
  assert.match(source, /typeof comment\.like_count === "number" &&/);
  assert.doesNotMatch(source, /comment\.like_count \|\| 0/);
});

test('tracked hashtags have a visible accessible remove button, not a right-click gesture', () => {
  const source = read('trends/page.tsx');
  assert.match(source, /aria-label=\{`Remover #\$\{item\.hashtag\}`\}/);
  assert.match(source, /onClick=\{\(\) => void untrack\(item\)\}/);
  assert.doesNotMatch(source, /onContextMenu/);
});

test('hashtag media with missing likes is not rendered as zero likes', () => {
  const source = read('trends/page.tsx');
  const card = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/ReferencePostCard.tsx'), 'utf8');
  assert.match(source, /<ReferencePostCard /);
  assert.match(card, /compact\(post\.likes\)/);
  const loaded = { exports: {} };
  const code = ts.transpileModule(card, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(() => ({}), loaded, loaded.exports);
  assert.equal(loaded.exports.compact(null), '—');
  assert.equal(loaded.exports.compact(undefined), '—');
  assert.equal(loaded.exports.compact(0), '0');
  assert.doesNotMatch(card, /post\.likes \|\| 0/);
});

test('composer keeps manual hashtag addition and removes Instagram suggestions', () => {
  const source = read('composer/page.tsx');
  assert.match(source, /onClick=\{addHashtag\}[^>]*>Adicionar<\/Button>/);
  assert.match(source, /Digite uma hashtag e clique em Adicionar ou pressione Enter\./);
  assert.doesNotMatch(source, /Sugestões do Instagram|lookupHashtag|relatedHashtagSuggestions|api\.searchHashtag/);
});

test('ranked reference cards and filters retain explicit missing values and read errors', () => {
  const source = read('trends/page.tsx');
  const card = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/ReferencePostCard.tsx'), 'utf8');
  assert.match(source, /Segmented label="Formato"/);
  assert.match(source, /feedQuery\.isError/);
  assert.match(card, /compact\(post\.likes\)/);
  assert.match(card, /compact\(post\.comments\)/);
  assert.match(card, /post\.engagementRate !== null &&/);
});

test('dashboard follower growth requires both history and an available value', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/StatsCards.tsx'), 'utf8');
  assert.match(source, /stats\?\.hasFollowerHistory && stats\.followerGrowth != null/);
  assert.doesNotMatch(source, /followerGrowth!/);
});
