const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(read('lib/media.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(loaded, loaded.exports);
const { isVideoUrl } = loaded.exports;

test('Meta CDN video links are recognized, images are not', () => {
  assert.equal(isVideoUrl('https://scontent.cdninstagram.com/o1/v/t16/f2/m86/AQabc.mp4?efg=x&oe=66AA'), true);
  assert.equal(isVideoUrl('https://api.example.test/uploads/123-abc.mov'), true);
  assert.equal(isVideoUrl('https://scontent.cdninstagram.com/v/t51.2885-15/123_n.jpg?stp=dst-jpg&oe=66AA'), false);
});

test('every Instagram media preview uses MediaPreview instead of a raw <img>', () => {
  const component = read('components/dashboard/MediaPreview.tsx');
  assert.match(component, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(component, /<video /);
  for (const file of ['app/page.tsx', 'components/dashboard/InstagramAnalytics.tsx', 'app/trends/page.tsx']) {
    const source = read(file);
    assert.match(source, /<MediaPreview /, file);
    assert.doesNotMatch(source, /<img src=\{post\.igMediaUrl\}|<img src=\{item\.media_url/, file);
  }
});
