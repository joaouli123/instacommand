const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/dashboard/ProfileAudit.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const context = { exports: {}, require: name => {
  if (name === '@/components/ui/button') return { Button: ({ children, onClick, type }) => React.createElement('button', { onClick, type }, children) };
  if (name === '@/components/ui/card') return { Card: ({ children }) => React.createElement('section', null, children) };
  return require(name);
} };
vm.runInNewContext(code, context);
test('audit renders every recommendation, explicit limitations and editable proposals', () => {
  const audit = { score: 0, summary: 'Dados limitados', strengths: [], opportunities: ['Clareza'],
    actions: Array.from({ length: 8 }, (_, i) => `Ação ${i+1}`),
    bioSuggestion: 'Bio <script>não executar</script>', nameSuggestion: 'Nome proposto', positioning: 'Posicionamento proposto', limitations: ['Amostra de oito publicações'] };
  const html = renderToStaticMarkup(React.createElement(context.exports.ProfileAudit, { audit, username: 'fixture' }));
  assert.match(html, /0\/100/);
  assert.match(html, /não uma nota oficial/);
  assert.match(html, /Ação 8/);
  assert.match(html, /Amostra de oito publicações/);
  assert.match(html, /Nome proposto/);
  assert.match(html, /Copiar análise completa/);
  assert.match(html, /não é salva/);
  assert.equal((html.match(/<textarea/g) || []).length, 3);
  assert.doesNotMatch(html, /<script>/);
});
