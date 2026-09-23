const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');
const previewStart = source.indexOf('{/* Compact, feed-faithful social post preview */}');
const previewEnd = source.indexOf('</aside>', previewStart);
const preview = source.slice(previewStart, previewEnd);

test('compact feed preview shows the selected carousel media and accessible controls', () => {
  assert.notEqual(previewStart, -1);
  assert.notEqual(previewEnd, -1);
  assert.match(preview, /src=\{activeMedia\.src\}/);
  assert.match(preview, /aspect-\[4\/5\]/);
  assert.doesNotMatch(preview, /rounded-\[2\.7rem\]|border-\[7px\]/);
  assert.match(preview, /aria-label="Navegação da prévia do carrossel"/);
  assert.match(preview, /aria-label="Ver mídia anterior"/);
  assert.match(preview, /aria-label="Ver próxima mídia"/);
  assert.match(preview, /aria-pressed=\{index === activeMediaIndex\}/);
  assert.match(preview, /\{activeMediaIndex \+ 1\}\/\{mediaItems\.length\}/);
});
