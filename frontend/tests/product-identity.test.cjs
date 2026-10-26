const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
function load(file, imports = {}) {
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', output)(mod, mod.exports, name => imports[name] || require(name));
  return mod.exports;
}

test('all product entry points use the own-product mark, not Instagram identity', () => {
  for (const file of ['app/login/page.tsx', 'app/oauth/authorize/page.tsx', 'components/layout/Sidebar.tsx', 'components/legal/LegalDocument.tsx', 'components/brand/ProductOverview.tsx']) {
    assert.match(read(file), /<ProductMark\b/, file);
    assert.doesNotMatch(read(file), /<Instagram\b|from-purple-600 via-pink-500 to-amber-500/, file);
  }
  assert.match(read('components/brand/ProductMark.tsx'), /<Command\b/);
  assert.doesNotMatch(read('components/brand/ProductMark.tsx'), /Instagram|SiInstagram/);
});

test('public product information is bilingual, truthful and has no credential fields or private calls', () => {
  const overview = read('components/brand/ProductOverview.tsx');
  for (const expected of ['lang="pt-BR"', 'lang="en"', 'UX Code Desenvolvimento Web', '66.650.579/0001-46', 'not affiliated', 'Never enter your Instagram', 'https://uxcode.com.br/#contato', '/politica-de-privacidade', '/exclusao-de-dados']) assert.ok(overview.includes(expected), expected);
  assert.doesNotMatch(overview, /use client|useEffect|useQuery|fetch\(|<input\b|<form\b|100%|Brazil-only|Meta partner/i);
  assert.match(read('components/layout/AppShell.tsx'), /"\/sobre"/);
  assert.match(read('app/login/page.tsx'), /href="\/sobre"/);
});

test('anonymous root renders product information, while session hint only selects presentation', async () => {
  assert.match(read('app/page.tsx'), /await hasBrowserSessionHint\(\) \? <DashboardPage \/> : <ProductOverview \/>/);
  assert.match(read('components/layout/AppShell.tsx'), /pathname === "\/" && !hasBrowserSession/);
  assert.match(read('app/layout.tsx'), /hasBrowserSession=\{hasBrowserSession\}/);
  for (const matches of [[], [{value: ''}], [{value:'a'}, {value:'b'}], [{value:'fixture'}]]) {
    let checkedName;
    const { hasBrowserSessionHint } = load('lib/browser-session-hint.ts', { 'next/headers': { cookies: async () => ({ getAll: name => { checkedName = name; return matches; } }) } });
    assert.equal(await hasBrowserSessionHint(), matches.length === 1 && Boolean(matches[0].value));
    assert.equal(checkedName, process.env.NODE_ENV === 'production' ? '__Host-instacommand_session' : 'instacommand_session');
  }
});

test('login redirects remain internal and malformed next values never break successful sign-in', () => {
  const { loginDestination } = load('lib/login-destination.ts');
  for (const next of [null, '', '//evil.test', '/\\evil.test', 'https://evil.test', 'https://[', 'javascript:alert(1)', 'data:text/html,evil', '/login', '/LOGIN/', '/\tevil.test']) assert.equal(loginDestination(next, 'https://app.example.test'), '/', String(next));
  for (const next of ['/', '/analytics?days=7', '/calendar#published', '/oauth/authorize?request=fixture']) assert.equal(loginDestination(next, 'https://app.example.test'), next);
  assert.match(read('app/login/page.tsx'), /window.location.replace\(loginDestination\(/);
});

test('login safety warnings and field labels have English translations', () => {
  const { EN_COMMON } = load('lib/locales/en-common.ts');
  for (const pt of ['Acesse somente com sua conta do InstaCommand. Não use a senha do Instagram, Facebook ou Threads.', 'E-mail da sua conta InstaCommand', 'Senha do InstaCommand', 'Senha da sua conta InstaCommand', 'Pelo menos 10 caracteres', 'Depois de entrar, acesse', 'para conectar suas redes. A autorização acontece nas páginas oficiais de cada plataforma; não pedimos suas senhas de redes sociais aqui.', 'Ferramenta independente da UX Code. Não é o Instagram nem um produto da Meta. Cada cliente administra somente as próprias contas.']) {
    assert.equal(typeof EN_COMMON[pt], 'string', pt);
    assert.notEqual(EN_COMMON[pt], pt);
  }
  const title = read('app/layout.tsx').match(/title: '([^']+)'/)[1];
  assert.ok(read('lib/i18n.tsx').includes(`const PT_TITLE = "${title}"`));
});
