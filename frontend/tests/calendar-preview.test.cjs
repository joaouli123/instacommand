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

test('published calendar items use their actual publication time and a completed visual state', () => {
  const calendar = read('app/calendar/page.tsx');
  assert.match(calendar, /post\.publishedPost\?\.publishedAt \|\| post\.scheduledFor/);
  assert.match(calendar, /bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/);
  assert.match(calendar, /Publicado em /);
  assert.match(calendar, /event\.status === 'published' && <span>Publicado<\/span>/);
});

test('shared client calendar visibly marks published posts and displays the actual publish date', () => {
  const share = read('components/share/PublicShareView.tsx');
  assert.match(share, /PUBLISHED: \{ label: "Publicado", Icon: CheckCircle2, className: "bg-slate-100 text-slate-600 ring-slate-200" \}/);
  assert.match(share, /Publicado às \$\{timeOf\(post\.scheduledAt\)\}/);
  assert.match(share, /Publicado em /);
  assert.match(share, /post\.status === "PUBLISHED" \? <CheckCircle2/);
  assert.match(share, /const \[showPublished, setShowPublished\] = useState\(false\)/);
  assert.match(share, /const upcomingPosts = posts\.filter\(\(post\) => post\.status !== "PUBLISHED"\)/);
  assert.match(share, /"Ver publicados"/);
  assert.match(share, /showPublished \? <section id="published-archive"/);
  assert.match(share, /showPublished && view === "list" \? "Ver próximos"/);
  assert.match(share, /<h2 id="published-archive-title"[^>]*>Já publicados<\/h2>/);
});
