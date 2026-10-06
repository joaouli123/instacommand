const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/mcp-setup.ts'), 'utf8');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded, loaded.exports);
const { buildClientGuides, cliInstallSteps, TOKEN_PLACEHOLDER } = loaded.exports;

const urls = { mcpUrl: 'https://api.example.test/mcp', cliUrl: 'https://api.example.test/downloads/instacommand.cjs', apiOrigin: 'https://api.example.test' };

test('every client guide is complete and every JSON snippet is valid', () => {
  const guides = buildClientGuides(urls);
  assert.deepEqual(guides.map((guide) => guide.id), ['chatgpt', 'claude', 'claude-code', 'claude-desktop-local', 'cursor', 'vscode', 'codex', 'gemini', 'other']);
  for (const guide of guides) {
    assert.ok(guide.steps.length >= 1, guide.id);
    for (const step of guide.steps) if (step.language === 'json') JSON.parse(step.code);
  }
  assert.ok(guides.find((guide) => guide.id === 'chatgpt').steps.some((step) => step.code === urls.mcpUrl));
  assert.equal(guides.find((guide) => guide.id === 'chatgpt').auth, 'OAuth');
});

test('a fresh token replaces the placeholder in token-based snippets only', () => {
  const token = `ic_pat_${'a'.repeat(43)}`;
  const guides = buildClientGuides(urls, token);
  const all = JSON.stringify(guides);
  assert.equal(all.includes(TOKEN_PLACEHOLDER), false);
  const cursor = JSON.parse(guides.find((guide) => guide.id === 'cursor').steps[0].code);
  assert.equal(cursor.mcpServers.instacommand.headers.Authorization, `Bearer ${token}`);
  const desktop = JSON.parse(guides.find((guide) => guide.id === 'claude-desktop-local').steps[1].code);
  assert.deepEqual(desktop.mcpServers.instacommand.args, ['C:\\Users\\SEU_USUARIO\\instacommand.cjs', 'mcp']);
  assert.equal(desktop.mcpServers.instacommand.env.INSTACOMMAND_API_URL, urls.apiOrigin);
  // VS Code keeps its own secret prompt instead of embedding the token.
  assert.ok(guides.find((guide) => guide.id === 'vscode').steps[0].code.includes('${input:instacommand-token}'));
});

test('CLI install commands download from this server', () => {
  const steps = cliInstallSteps(urls.cliUrl);
  assert.ok(steps.unix.includes(`curl -fsSL ${urls.cliUrl}`));
  assert.ok(steps.windows.includes(`Invoke-WebRequest ${urls.cliUrl}`));
});
