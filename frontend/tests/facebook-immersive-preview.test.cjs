const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/app/composer/page.tsx'), 'utf8');

test('Facebook Reels and Stories use separate immersive preview frames and platform icons', () => {
  assert.match(source, /data-preview="facebook-reel"/);
  assert.match(source, /data-preview="facebook-reel"[^\n]*aspect-\[9\/20\]/);
  assert.match(source, /aria-label="Prévia de Facebook Reels"/);
  assert.match(source, /aria-label="Navegação do Facebook Reels"/);
  assert.match(source, /aria-label="Ações do Facebook Reel"/);
  assert.match(source, /RiThumbUpLine/);
  assert.match(source, /RiBookmarkLine/);
  assert.match(source, /RiMusic2Line/);
  assert.match(source, /data-preview="facebook-story"/);
  assert.match(source, /data-preview="facebook-story"[^\n]*aspect-\[9\/20\]/);
  assert.match(source, /aria-label="Prévia visual de Facebook Stories"/);
  assert.match(source, /Enviar mensagem\.\.\./);
  assert.match(source, /Reagir com coração/);
  assert.match(source, /Reagir com curtir/);
});

test('Facebook Stories can be previewed but remain unavailable as a publishing destination', () => {
  assert.match(source, /STORY: \["INSTAGRAM"\]/);
  assert.match(source, /Facebook \(prévia visual\)/);
  assert.match(source, /Apenas prévia visual\. Facebook Stories não está habilitado para publicação neste compositor\./);
});
