const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(read('lib/caption.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded, loaded.exports);
const { captionAsPublished } = loaded.exports;

test('the calendar shows the caption exactly as it will be published', () => {
  assert.equal(captionAsPublished('Você dirige em Sinop? 🚗', ['motorista', '#Sinop']), 'Você dirige em Sinop? 🚗\n\n#motorista #Sinop');
  // A scheduled caption already carries its hashtags; they are not repeated.
  assert.equal(captionAsPublished('Texto\n\n#motorista #Sinop', ['motorista', 'sinop']), 'Texto\n\n#motorista #Sinop');
  assert.equal(captionAsPublished('', []), '');
});

test('composer and calendar render the same shared preview', () => {
  const composer = read('app/composer/page.tsx');
  const calendar = read('app/calendar/page.tsx');
  const panel = read('components/calendar/PostPreviewPanel.tsx');
  assert.match(composer, /SocialPostPreview as ComposerSocialPreview/);
  assert.match(panel, /<SocialPostPreview/);
  assert.match(panel, /captionAsPublished\(post\.caption, post\.hashtags\)/);
  assert.match(calendar, /<PostPreviewPanel/);
  assert.match(calendar, /Legenda que será publicada/);
});
