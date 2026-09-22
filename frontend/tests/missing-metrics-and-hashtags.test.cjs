const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8');

test('community comments do not present missing likes as zero', () => {
  const source = read('community/page.tsx');
  assert.match(source, /comment\.like_count === null \|\| comment\.like_count === undefined \? "Curtidas indisponíveis"/);
  assert.doesNotMatch(source, /comment\.like_count \|\| 0/);
});

test('tracked hashtags have a visible accessible remove button, not a right-click gesture', () => {
  const source = read('trends/page.tsx');
  assert.match(source, /aria-label=\{`Parar de monitorar \$\{item\.hashtag\}`\}/);
  assert.doesNotMatch(source, /onContextMenu/);
});

test('hashtag media with missing likes is not rendered as zero likes', () => {
  const source = read('trends/page.tsx');
  assert.match(source, /item\.like_count === null \|\| item\.like_count === undefined \? "Curtidas indisponíveis"/);
  assert.doesNotMatch(source, /item\.like_count \|\| 0/);
});
