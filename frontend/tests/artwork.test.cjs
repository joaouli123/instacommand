const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/artwork.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} }; vm.runInNewContext(code, context);
const { wrapArtText, validateArtSlides, renderArt } = context.exports;
test('line wrapping keeps all words, paragraph boundaries and long tokens', () => {
  assert.equal(Array.from(wrapArtText('one two three', 7, text => text.length)).join('|'), 'one two|three');
  assert.equal(Array.from(wrapArtText('a\n\nb', 7, text => text.length)).join('|'), 'a||b');
  assert.equal(Array.from(wrapArtText('abcdefghij', 4, text => text.length)).join('|'), 'abcd|efgh|ij');
});
test('validates slide counts and required title without silently truncating body', () => {
  assert.throws(() => validateArtSlides([]));
  assert.throws(() => validateArtSlides(Array(11).fill({ title: 'A', body: '' })));
  assert.throws(() => validateArtSlides([{ title: ' ', body: '' }]));
  assert.throws(() => validateArtSlides([{ title: 'A', body: 'x'.repeat(701) }]));
  validateArtSlides(Array(10).fill({ title: 'A', body: 'B' }));
});
function canvas() {
  const text = [];
  const ctx = { font: '', fillRect() {}, fillText(value, x, y) { text.push({ value, x, y }); }, measureText(value) { return { width: value.length * Number(this.font.match(/(\d+)px/)[1]) * 0.5 }; } };
  return { width: 0, height: 0, getContext: () => ctx, text };
}
test('renders a 4:5 canvas with ordered page numbers and footer', () => {
  const c = canvas(); renderArt(c, { title: 'Título', body: 'Texto' }, 'blue', '@exemplo', 1, 3);
  assert.equal(c.width, 1080); assert.equal(c.height, 1350);
  assert.equal(c.text.some(item => item.value === '2 / 3'), true);
  assert.equal(c.text.some(item => item.value === '@exemplo'), true);
  assert.equal(c.text.every(item => item.y < 1350), true);
});
test('unfittable paragraphs fail instead of clipping content or producing a misleading preview', () => {
  assert.throws(() => renderArt(canvas(), { title: 'A', body: '\n'.repeat(100) }, 'violet', '', 0, 1), /não cabe/);
});
