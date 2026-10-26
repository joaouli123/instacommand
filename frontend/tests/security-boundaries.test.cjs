const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('login identifies its own service and never presents the Instagram mark as its identity', () => {
  const login = fs.readFileSync(path.join(root, 'src/app/login/page.tsx'), 'utf8');
  assert.match(login, /UX Code Desenvolvimento Web/);
  assert.match(login, /Não use a senha do Instagram/);
  assert.match(login, /Senha do InstaCommand/);
  assert.match(login, /Não é o Instagram nem um produto da Meta/);
  assert.doesNotMatch(login, /<Instagram\b|<SiInstagram\b/);
});
test('browser headers prevent framing and content sniffing; SVG optimization stays disabled', () => {
  const config = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8');
  assert.match(config, /source: "\/:path\*"/);
  assert.match(config, /X-Frame-Options.*DENY/);
  assert.match(config, /X-Content-Type-Options.*nosniff/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /dangerouslyAllowSVG: false/);
});
test('container build contexts exclude local secrets, media and generated artifacts', () => {
  for (const app of ['frontend', 'backend']) {
    const ignored = fs.readFileSync(path.join(root, '..', app, '.dockerignore'), 'utf8').split(/\r?\n/);
    for (const pattern of ['.env', '.env.*', 'node_modules', 'artifacts', '*.pem', '*.key']) assert.ok(ignored.includes(pattern), `${app}: ${pattern}`);
  }
});
