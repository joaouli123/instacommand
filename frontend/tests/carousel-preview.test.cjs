const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');
const previewStart = source.indexOf('{/* Each social destination and post format gets its own native-style preview. */}');
const previewEnd = source.indexOf('</aside>', previewStart);
const preview = source.slice(previewStart, previewEnd);

test('compact Instagram carousel preview shows the selected media and dot navigation', () => {
  assert.notEqual(previewStart, -1);
  assert.notEqual(previewEnd, -1);
  assert.match(source, /src=\{media\.src\}/);
  assert.match(source, /aspect-\[4\/5\]/);
  assert.doesNotMatch(preview, /rounded-\[2\.7rem\]|border-\[7px\]/);
  assert.match(source, /aria-label="Itens do carrossel"/);
  assert.match(source, /aria-label=\{`Pré-visualizar item \$\{index \+ 1\} de \$\{mediaItems\.length\}`\}/);
  assert.match(source, /aria-pressed=\{index === activeMediaIndex\}/);
  assert.match(source, /onClick=\{\(\) => onSelectMedia\(index\)\}/);
});
