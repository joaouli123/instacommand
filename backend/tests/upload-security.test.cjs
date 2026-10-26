const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
let dir, server, url;
const mock = (name, exports) => { require.cache[require.resolve(name)] = { exports }; };
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'instacommand-upload-security-'));
  mock('../dist/config/env', { env: { MEDIA_UPLOAD_DIR: dir, MEDIA_PUBLIC_URL: 'https://media.example.test/uploads', FRONTEND_URL: 'https://app.example.test' } });
  mock('../dist/lib/prisma', { getPrisma: () => ({}) });
  mock('../dist/middleware/auth', { authenticate: (req, res, next) => { req.user = { id: 'isolated-user' }; next(); } });
  mock('../dist/services/scheduler.service', {});
  mock('../dist/services/instagram/publish.service', {});
  mock('../dist/services/instagram/auth.service', {});
  mock('../dist/services/x.service', {});
  const app = express();
  app.use('/posts', require('../dist/routes/posts.routes').default);
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ error: 'Upload recusado' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${server.address().port}/posts/upload`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  assert.ok(path.basename(dir).startsWith('instacommand-upload-security-'));
  assert.equal(path.dirname(dir), os.tmpdir());
  await fs.rm(dir, { recursive: true, force: true });
});
const send = async (files) => {
  const form = new FormData();
  for (const file of files) form.append('files', new Blob([file.content], { type: file.mime }), file.name);
  const res = await fetch(url, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
};
test('HTML disguised as a JPEG is rejected by content, not accepted by MIME header', async () => {
  const result = await send([{ name: 'fake.jpg', mime: 'image/jpeg', content: '<html><script>alert(1)</script></html>' }]);
  assert.equal(result.status, 400);
  for (let i = 0; i < 20 && (await fs.readdir(path.join(dir, '.incoming'))).length; i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(await fs.readdir(path.join(dir, '.incoming')), []);
});
test('active SVG uploads are refused', async () => {
  assert.equal((await send([{ name: 'x.svg', mime: 'image/svg+xml', content: '<svg onload="alert(1)"/>' }])).status, 400);
});
test('valid PNG content receives a canonical random extension, ignoring supplied HTML filename', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  const result = await send([{ name: 'not-an-html-page.html', mime: 'image/png', content: png }]);
  assert.equal(result.status, 200);
  assert.match(result.body.urls[0], /^https:\/\/media\.example\.test\/uploads\/\d+-[a-f0-9-]+\.png$/);
  const file = path.basename(new URL(result.body.urls[0]).pathname);
  assert.deepEqual(await fs.readFile(path.join(dir, file)), png);
});
