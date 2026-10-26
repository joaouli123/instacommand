const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const load = (file, imports = {}) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, name => imports[name] || require(name));
  return mod.exports;
};
const { proxyBrowserApi } = load('lib/browser-api-proxy.ts', { './config': { BACKEND_ORIGIN: 'https://api.example.test' } });
const { contentSecurityPolicy } = load('lib/content-security.ts');
const settings = { backendOrigin: 'https://api.example.test', frontendOrigin: 'https://app.example.test', production: true };
const request = (path = '/api/auth/login', init = {}) => new Request(`https://app.example.test${path}`, {
  method: 'POST', headers: { origin: settings.frontendOrigin, 'content-type': 'application/json' }, body: '{}', ...init,
});

test('browser login receives only HttpOnly host-scoped cookie, never the bearer in JSON', async () => {
  const res = await proxyBrowserApi(request(), async () => Response.json({ token: 'fixture-session-secret', user: { id: 'workspace-a' } }, {
    headers: { 'set-cookie': 'instacommand_token=fixture-session-secret; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax' },
  }), settings);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user: { id: 'workspace-a' } });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^__Host-instacommand_session=/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(flag));
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('only the dedicated session cookie crosses to the fixed upstream', async () => {
  let calls = 0;
  await proxyBrowserApi(request('/api/accounts?url=https://evil.test', { method: 'GET', body: undefined, headers: {
    cookie: '__Host-instacommand_session=fixture; unrelated=private; instacommand_token=forged',
    authorization: 'Bearer forged', 'x-instacommand-mcp-proxy': 'forged', 'x-forwarded-for': '10.0.0.1',
  } }), async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.example.test/api/accounts?url=https://evil.test');
    assert.equal(init.headers.get('cookie'), 'instacommand_token=fixture');
    for (const name of ['authorization', 'x-instacommand-mcp-proxy', 'x-forwarded-for']) assert.equal(init.headers.has(name), false);
    assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store');
    return Response.json([]);
  }, settings);
  assert.equal(calls, 1);
});

test('cross-site, null/missing origins and same-site sibling writes never reach upstream', async () => {
  for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' }, {}, { origin: 'https://other.example.test' }, { origin: settings.frontendOrigin, 'sec-fetch-site': 'cross-site' }]) {
    const res = await proxyBrowserApi(request('/api/posts', { headers }), () => assert.fail('CSRF reached upstream'), settings);
    assert.equal(res.status, 403);
  }
});

test('duplicate protected cookies and callback/path smuggling fail closed', async () => {
  const duplicate = await proxyBrowserApi(request('/api/posts', { headers: { origin: settings.frontendOrigin, cookie: '__Host-instacommand_session=a; __Host-instacommand_session=b' } }), () => assert.fail('ambiguous session'), settings);
  assert.equal(duplicate.status, 401);
  for (const path of ['/api/posts/a%2fpublish', '/api/webhooks/instagram', '/api/auth/facebook/callback?code=private', '/api//auth/login', '/outside']) {
    assert.equal((await proxyBrowserApi(request(path), () => assert.fail('invalid path'), settings)).status, 400);
  }
});

test('uncertain writes and redirects are never retried or followed', async () => {
  for (const response of [new Response(null, { status: 307, headers: { location: 'https://evil.test' } }), new Error('fixture-private-secret')]) {
    let calls = 0;
    const res = await proxyBrowserApi(request('/api/posts/publish'), async () => { calls++; if (response instanceof Error) throw response; return response; }, settings);
    assert.equal(res.status, 502); assert.equal(calls, 1);
    assert.doesNotMatch(await res.text(), /fixture-private-secret|evil.test/);
  }
});

test('logout clears the exact protected cookie; no arbitrary upstream cookie is exposed', async () => {
  const headers = new Headers();
  headers.append('set-cookie', 'instacommand_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  headers.append('set-cookie', 'unrelated=private');
  const res = await proxyBrowserApi(request('/api/auth/logout'), async () => Response.json({ ok: true }, { headers }), settings);
  assert.match(res.headers.get('set-cookie'), /^__Host-instacommand_session=;.*Max-Age=0; Secure/);
  assert.doesNotMatch(res.headers.get('set-cookie'), /unrelated/);
});

test('new browser code never reads or persists a session bearer', () => {
  for (const file of ['lib/api.ts', 'app/login/page.tsx', 'app/accounts/page.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
    assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)\(["'](?:instacommand_token|token|instacommand_user)["']/);
  }
});

test('production script policy requires unpredictable nonce without inline/eval execution', () => {
  const policy = contentSecurityPolicy('nonceFixture', settings.backendOrigin);
  const scripts = policy.split(';').find(value => value.trim().startsWith('script-src'));
  assert.match(scripts, /'nonce-nonceFixture' 'strict-dynamic'/);
  assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval|https:/);
  for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) assert.ok(policy.includes(directive));
  assert.throws(() => contentSecurityPolicy("bad'; script-src *", settings.backendOrigin));
  assert.ok(fs.readFileSync(path.join(__dirname, '../src/app/layout.tsx'), 'utf8').includes("dynamic = 'force-dynamic'"));
});
test('case/trailing-slash variants cannot expose a browser bearer', async () => {
  const res = await proxyBrowserApi(request('/api/auth/LOGIN/'), async () => Response.json({ token: 'fixture-secret', user: { id: 'a' } }), settings);
  assert.equal((await res.json()).token, undefined);
});
test('forwarded client identity is authenticated server-side, not passed through from callers', async () => {
  await proxyBrowserApi(request('/api/auth/login', { headers: { origin: settings.frontendOrigin, 'x-forwarded-for': 'forged, 198.51.100.7', 'x-instacommand-browser-ip': 'evil', 'x-instacommand-browser-signature': 'evil' } }), async (_url, init) => {
    assert.equal(init.headers.get('x-instacommand-browser-ip'), '198.51.100.7');
    assert.match(init.headers.get('x-instacommand-browser-signature'), /^[a-f0-9]{64}$/);
    assert.notEqual(init.headers.get('x-instacommand-browser-signature'), 'evil');
    return Response.json({ user: { id: 'a' } });
  }, { ...settings, proxySecret: 'fixture-only-proxy-secret-not-production' });
});
