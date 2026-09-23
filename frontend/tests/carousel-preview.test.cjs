const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');
const mediaStart = source.indexOf('{/* Media Container */}');
const mediaEnd = source.indexOf('{/* Action Buttons */}', mediaStart);
const preview = source.slice(mediaStart, mediaEnd);
const imageEnd = preview.indexOf('\n          </div>');
const mediaFrame = preview.slice(0, imageEnd);

test('carousel navigation stays outside the artwork and remains accessible', () => {
  assert.notEqual(mediaStart, -1);
  assert.notEqual(mediaEnd, -1);
  assert.match(mediaFrame, /<img src=\{activeMedia\.src\}/);
  assert.doesNotMatch(mediaFrame, /Ver mídia anterior|Ver próxima mídia|absolute left-3|absolute right-3/);
  assert.match(preview, /aria-label="Navegação da prévia do carrossel"/);
  assert.match(preview, /aria-label="Ver mídia anterior"/);
  assert.match(preview, /aria-label="Ver próxima mídia"/);
  assert.match(preview, /aria-pressed=\{index === activeMediaIndex\}/);
  assert.match(preview, /\$\{activeMediaIndex \+ 1\}\/\$\{mediaItems\.length\}/);
});
