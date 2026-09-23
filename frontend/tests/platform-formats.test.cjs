const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');

test('composer defines platform-specific formats and makes Stories Instagram-only', () => {
  assert.match(source, /FEED: \["INSTAGRAM", "FACEBOOK", "THREADS"\]/);
  assert.match(source, /CAROUSEL: \["INSTAGRAM", "FACEBOOK", "THREADS"\]/);
  assert.match(source, /STORY: \["INSTAGRAM"\]/);
  assert.match(source, /TEXT: \["THREADS"\]/);
  assert.match(source, /Formato e dimensões por plataforma/);
  assert.match(source, /1080 × 1920 px recomendado/);
  assert.match(source, /1080 × 1350 px recomendado/);
});

test('format options are restricted to the intersection of selected destination capabilities', () => {
  assert.match(source, /platforms\.every\(\(platform\) => formatPlatforms\[format\]\.includes\(platform\)\)/);
  assert.match(source, /compatíveis com todos os destinos selecionados/);
  assert.match(source, /postType === "TEXT" \? "500" : "2\.200"/);
});
