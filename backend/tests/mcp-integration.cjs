// End-to-end: real PostgreSQL + the real Express app, REST auth/scopes, OAuth
// 2.1 server, MCP over Streamable HTTP (official SDK client) and the CLI.
// Only BullMQ and the Meta publishing call are faked. NEVER point this at production.
//   MCP_INTEGRATION_TEST=1 DATABASE_URL=postgresql://.../instacommand_mcp_test node --test tests/mcp-integration.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

if (process.env.MCP_INTEGRATION_TEST !== '1' || !/\/instacommand_mcp_test(\?|$)/.test(process.env.DATABASE_URL || '')) {
  throw new Error('Dedicated isolated test database required (instacommand_mcp_test).');
}

const PORT = 39117;
const BASE = `http://127.0.0.1:${PORT}`;
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-mcp-uploads-'));
Object.assign(process.env, {
  NODE_ENV: 'test', BACKEND_PORT: String(PORT), BACKEND_URL: BASE, FRONTEND_URL: 'http://localhost:3000',
  JWT_SECRET: 'integration-secret-for-mcp-tests-0123456789', MEDIA_UPLOAD_DIR: uploadDir, MEDIA_PUBLIC_URL: `${BASE}/uploads`,
});

// ---- fakes: in-memory BullMQ and the network publish step
const queue = new Map();
class FakeQueue {
  constructor(name) { this.name = name; }
  async add(name, data, opts = {}) { const id = opts.jobId || crypto.randomUUID(); queue.set(id, { id, name, data, delay: opts.delay ?? 0, queue: this.name }); return { id }; }
  async getJob(id) { const job = queue.get(id); return job ? { ...job, remove: async () => { queue.delete(id); } } : null; }
  async getDelayed() { return [...queue.values()].filter((job) => job.queue === this.name); }
  async getActiveCount() { return 0; } async getWaitingCount() { return 0; } async getDelayedCount() { return queue.size; } async getFailedCount() { return 0; }
}
require.cache[require.resolve('bullmq')] = { exports: { Queue: FakeQueue, Worker: class {} } };
require.cache[require.resolve('../dist/config/redis')] = { exports: { redisConnection: {} } };
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const published = [];
require.cache[require.resolve('../dist/services/instagram/publish.service')] = { exports: {
  publishPost: async (id) => {
    published.push(id);
    const post = await prisma.scheduledPost.findUnique({ where: { id } });
    const row = await prisma.publishedPost.create({ data: { accountId: post.accountId, igMediaId: `ig-${id}`, igPermalink: `https://instagram.example.test/p/${id}`, mediaType: post.mediaType, caption: post.caption, publishResults: { INSTAGRAM: { id: `ig-${id}` } } } });
    await prisma.scheduledPost.update({ where: { id }, data: { status: 'PUBLISHED', publishedPostId: row.id } });
    return row;
  },
  deleteFacebookPost: async () => {}, deleteThreadsPost: async () => {},
} };

const { safeFetchPolicy } = require('../dist/utils/safe-fetch');
const { cimdFetcher } = require('../dist/services/oauth.service');
const { createApp } = require('../dist/app');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { auth: sdkAuth } = require('@modelcontextprotocol/sdk/client/auth.js');
const jwt = require('jsonwebtoken');

const ids = {
  owner: crypto.randomUUID(), stranger: crypto.randomUUID(),
  account: crypto.randomUUID(), strangerAccount: crypto.randomUUID(), threads: crypto.randomUUID(),
};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(2048)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(256)]);
let server, fixture, fixtureBase, sessionJwt, fullToken, readToken, strangerPostId;

const session = (userId, email) => jwt.sign({ id: userId, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
const call = (method, pathname, { token, body, headers = {} } = {}) => fetch(`${BASE}${pathname}`, {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
  body: body !== undefined ? JSON.stringify(body) : undefined,
  redirect: 'manual',
});

async function mcpClient(token) {
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const tool = async (client, name, args = {}) => client.callTool({ name, arguments: args });
const ok = (result) => { assert.equal(result.isError, undefined, result.content?.[0]?.text); return result.structuredContent; };

before(async () => {
  for (const model of ['oAuthAuthorizationCode', 'apiToken', 'oAuthClient', 'scheduledPost', 'publishedPost', 'threadsAccount', 'instagramAccount', 'user']) await prisma[model].deleteMany();
  await prisma.user.createMany({ data: [{ id: ids.owner, email: 'owner@fixture.invalid', name: 'Dona Fixture' }, { id: ids.stranger, email: 'other@fixture.invalid', name: 'Outra' }] });
  await prisma.instagramAccount.createMany({ data: [
    { id: ids.account, userId: ids.owner, igUserId: 'ig-owner', igUsername: 'loja_fixture', pageId: 'page-owner', pageName: 'Loja Fixture', pageAccessToken: 'not-a-real-token' },
    { id: ids.strangerAccount, userId: ids.stranger, igUserId: 'ig-stranger', igUsername: 'outra_conta', pageId: 'page-stranger', pageAccessToken: 'not-a-real-token' },
  ] });
  await prisma.threadsAccount.create({ data: { id: ids.threads, userId: ids.owner, threadsUserId: 'threads-owner', username: 'loja_threads', accessToken: 'not-a-real-token' } });
  strangerPostId = (await prisma.scheduledPost.create({ data: { userId: ids.stranger, accountId: ids.strangerAccount, mediaType: 'IMAGE', mediaUrls: ['https://x.test/a.jpg'], caption: 'segredo de outro workspace', hashtags: [], scheduledFor: new Date(Date.now() + 86_400_000) } })).id;
  sessionJwt = session(ids.owner, 'owner@fixture.invalid');

  server = await new Promise((resolve) => { const listener = createApp().listen(PORT, '127.0.0.1', () => resolve(listener)); });
  fixture = await new Promise((resolve) => {
    const listener = http.createServer((req, res) => {
      if (req.url === '/photo.jpg') return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(JPEG);
      if (req.url === '/redirect') return res.writeHead(302, { Location: '/photo.jpg' }).end();
      if (req.url === '/fake.jpg') return res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end('<html>not an image</html>');
      return res.writeHead(404).end();
    }).listen(0, '127.0.0.1', () => resolve(listener));
  });
  fixtureBase = `http://127.0.0.1:${fixture.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => fixture.close(resolve));
  await prisma.$disconnect();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

test('critical regression: non-session JWTs signed with JWT_SECRET are not sessions', async () => {
  const stateLike = jwt.sign({ sub: ids.owner, purpose: 'meta', nonce: 'x' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  assert.equal((await call('GET', '/api/posts', { token: stateLike })).status, 401);
  const response = await call('GET', '/api/posts', { token: sessionJwt });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).some((post) => post.id === strangerPostId), false);
});

test('session creates personal tokens; plaintext is returned once and never listed', async () => {
  const created = await call('POST', '/api/integrations/tokens', { token: sessionJwt, body: { name: 'Claude Code', scopes: ['admin', 'read', 'publish', 'write'], expiresInDays: 30 } });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.match(body.secret, /^ic_pat_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(body.token.scopes, ['read', 'write', 'publish', 'admin']);
  fullToken = body.secret;
  readToken = (await (await call('POST', '/api/integrations/tokens', { token: sessionJwt, body: { name: 'Só leitura', scopes: ['read'], expiresInDays: null } })).json()).secret;
  const listed = await (await call('GET', '/api/integrations/tokens', { token: sessionJwt })).json();
  assert.equal(listed.personal.length, 2);
  assert.equal(JSON.stringify(listed).includes(fullToken), false);
  assert.equal(JSON.stringify(listed).includes('tokenHash'), false);
  const row = await prisma.apiToken.findFirst({ where: { name: 'Claude Code' } });
  assert.equal(row.tokenHash, crypto.createHash('sha256').update(fullToken).digest('hex'));
});

test('API tokens cannot manage credentials, and scopes gate REST writes', async () => {
  assert.equal((await call('GET', '/api/integrations/tokens', { token: fullToken })).status, 403);
  assert.equal((await call('POST', '/api/integrations/tokens', { token: fullToken, body: { name: 'x', scopes: ['admin'] } })).status, 403);
  assert.equal((await call('GET', '/api/posts', { token: readToken })).status, 200);
  const draft = { accountId: ids.account, mediaType: 'IMAGE', mediaUrls: ['https://x.test/a.jpg'], caption: 'oi', scheduledFor: new Date(Date.now() + 3_600_000).toISOString() };
  const denied = await call('POST', '/api/posts', { token: readToken, body: draft });
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).message, /"write"/);
  assert.equal((await call('GET', '/api/auth/facebook/url', { token: readToken })).status, 403);
  const bogus = `ic_pat_${'A'.repeat(43)}`;
  assert.equal((await call('GET', '/api/posts', { token: bogus })).status, 401);
});

test('scheduler fixes: unschedule and reschedule refuse posts that are not scheduled', async () => {
  const row = await prisma.scheduledPost.create({ data: { userId: ids.owner, accountId: ids.account, mediaType: 'IMAGE', mediaUrls: ['https://x.test/a.jpg'], caption: 'publicado', hashtags: [], status: 'PUBLISHED', scheduledFor: new Date() } });
  assert.equal((await call('DELETE', `/api/scheduler/${row.id}`, { token: sessionJwt })).status, 409);
  assert.equal((await call('POST', `/api/scheduler/${row.id}/reschedule`, { token: sessionJwt, body: { newPublishAt: new Date(Date.now() + 86_400_000).toISOString() } })).status, 409);
  assert.equal((await prisma.scheduledPost.findUnique({ where: { id: row.id } })).status, 'PUBLISHED');
  await prisma.scheduledPost.delete({ where: { id: row.id } });
});

test('MCP endpoint challenges unauthenticated clients per RFC 9728', async () => {
  const response = await call('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert.equal(response.status, 401);
  const header = response.headers.get('www-authenticate');
  assert.match(header, /resource_metadata="http:\/\/127\.0\.0\.1:39117\/\.well-known\/oauth-protected-resource\/mcp"/);
  const prm = await (await call('GET', '/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(prm.resource, `${BASE}/mcp`);
  assert.deepEqual(prm.authorization_servers, [BASE]);
  const as = await (await call('GET', '/.well-known/oauth-authorization-server')).json();
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.ok(as.token_endpoint_auth_methods_supported.includes('none'));
});

test('MCP full publishing workflow with a personal token', async () => {
  const client = await mcpClient(fullToken);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 58);
  assert.ok(client.getInstructions().includes('get_workspace_overview'));
  assert.equal(tools.find((t) => t.name === 'get_post').annotations.readOnlyHint, true);
  assert.ok(tools.find((t) => t.name === 'publish_post_now').inputSchema.required.includes('confirm'));

  const overview = ok(await tool(client, 'get_workspace_overview'));
  assert.equal(overview.user.id, ids.owner);
  assert.deepEqual(overview.instagramAccounts.map((a) => a.id), [ids.account]);
  assert.equal(overview.instagramAccounts[0].facebookPage.id, 'page-owner');
  assert.equal(overview.threadsAccounts[0].id, ids.threads);

  // Media import is blocked for private addresses by default (SSRF guard)...
  const blocked = await tool(client, 'import_media_from_url', { urls: [`${fixtureBase}/photo.jpg`] });
  assert.equal(blocked.isError, true);
  safeFetchPolicy.allowPrivateNetworks = true;
  safeFetchPolicy.allowAnyPort = true;
  const imported = ok(await tool(client, 'import_media_from_url', { urls: [`${fixtureBase}/redirect`, `${fixtureBase}/fake.jpg`] }));
  assert.equal(imported.urls.length, 1);
  assert.match(imported.urls[0], /^http:\/\/127\.0\.0\.1:39117\/uploads\/\d+-[0-9a-f-]+\.jpg$/);
  assert.equal(imported.errors.length, 1);
  assert.deepEqual(Buffer.from(await (await fetch(imported.urls[0])).arrayBuffer()), JPEG);
  const base64 = ok(await tool(client, 'upload_media_base64', { files: [{ data: `data:image/png;base64,${PNG.toString('base64')}` }] }));
  assert.match(base64.urls[0], /\.png$/);
  assert.equal((await tool(client, 'upload_media_base64', { files: [{ data: Buffer.from('#!/bin/sh').toString('base64') }] })).isError, true);

  const when = new Date(Date.now() + 2 * 86_400_000).toISOString().replace('Z', '+00:00');
  const created = ok(await tool(client, 'create_post', {
    accountId: ids.account, platforms: ['INSTAGRAM', 'FACEBOOK', 'INSTAGRAM'], mediaType: 'CAROUSEL', mediaUrls: [imported.urls[0], base64.urls[0]],
    caption: 'Lançamento #novidade', hashtags: ['#novidade', 'moda', 'verão'], scheduledFor: when,
    advancedSettings: { firstComment: 'Link na bio', collaborators: ['@parceira'] },
  })).post;
  assert.equal(created.status, 'DRAFT');
  assert.deepEqual(created.platforms, ['INSTAGRAM', 'FACEBOOK']);
  assert.equal(created.caption, 'Lançamento #novidade');
  assert.equal(created.captionAsPublished, 'Lançamento #novidade\n\n#moda #verão');
  assert.deepEqual(created.advancedSettings.collaborators, ['parceira']);

  const crossTenant = await tool(client, 'get_post', { postId: strangerPostId });
  assert.equal(crossTenant.isError, true);
  assert.match(crossTenant.content[0].text, /404/);

  const missingConfirm = await tool(client, 'publish_post_now', { postId: created.id });
  assert.equal(missingConfirm.isError, true);

  const scheduled = ok(await tool(client, 'schedule_post', { postId: created.id, scheduledFor: when })).post;
  assert.equal(scheduled.status, 'SCHEDULED');
  assert.equal(scheduled.caption, 'Lançamento #novidade\n\n#moda #verão');
  assert.equal(queue.get(created.id).data.scheduledPostId, created.id);

  const listed = ok(await tool(client, 'list_posts', { status: 'SCHEDULED', from: new Date().toISOString(), platform: 'FACEBOOK' }));
  assert.deepEqual(listed.posts.map((p) => p.id), [created.id]);

  const updated = ok(await tool(client, 'update_post', { postId: created.id, hashtags: ['moda', 'outono'] })).post;
  assert.equal(updated.status, 'SCHEDULED');
  assert.equal(updated.caption, 'Lançamento #novidade\n\n#moda #verão\n\n#outono');

  const unscheduled = ok(await tool(client, 'unschedule_post', { postId: created.id })).post;
  assert.equal(unscheduled.status, 'DRAFT');
  assert.equal(queue.has(created.id), false);

  const text = ok(await tool(client, 'create_post', { accountId: ids.account, platforms: ['THREADS'], threadsAccountId: ids.threads, mediaType: 'TEXT', caption: 'Só texto', hashtags: ['threads'], scheduledFor: when })).post;
  const sent = ok(await tool(client, 'publish_post_now', { postId: text.id, confirm: true }));
  assert.equal(sent.post.status, 'PUBLISHED');
  assert.equal(sent.post.caption, 'Só texto\n\n#threads');
  assert.ok(published.includes(text.id));
  assert.equal(sent.published.permalink, `https://instagram.example.test/p/${text.id}`);
  assert.equal((await tool(client, 'publish_post_now', { postId: text.id, confirm: true })).isError, true);

  const queued = ok(await tool(client, 'publish_post_now', { postId: created.id, confirm: true }));
  assert.equal(queued.queued, true);
  assert.equal(queued.post.status, 'SCHEDULED');
  assert.ok(new Date(queued.publishAt).getTime() - Date.now() < 40_000);

  const copy = ok(await tool(client, 'duplicate_post', { postId: text.id, scheduledFor: when })).post;
  assert.equal(copy.status, 'DRAFT');
  assert.equal(copy.mediaType, 'TEXT');
  assert.equal((await tool(client, 'delete_post', { postId: copy.id })).isError, true);
  assert.equal(ok(await tool(client, 'delete_post', { postId: copy.id, confirm: true })).message, 'Post deleted');

  const guide = ok(await tool(client, 'get_publishing_guide'));
  assert.ok(guide.formats.TEXT.includes('500'));
  await client.close();
});

test('a read-only connection sees every tool but cannot change anything', async () => {
  const client = await mcpClient(readToken);
  const result = await tool(client, 'create_post', { accountId: ids.account, mediaType: 'IMAGE', mediaUrls: ['https://x.test/a.jpg'], scheduledFor: new Date(Date.now() + 3_600_000).toISOString() });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /"write"/);
  assert.match(result._meta['mcp/www_authenticate'][0], /insufficient_scope/);
  assert.equal(ok(await tool(client, 'list_accounts')).instagram.length, 1);
  await client.close();
});

class MemoryProvider {
  constructor(redirectUrl, clientMetadataUrl) { this.redirect = redirectUrl; this.clientMetadataUrl = clientMetadataUrl; this.saved = {}; }
  get redirectUrl() { return this.redirect; }
  get clientMetadata() { return { client_name: 'Cliente de teste', redirect_uris: [this.redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }; }
  clientInformation() { return this.saved.client; }
  saveClientInformation(info) { this.saved.client = info; }
  tokens() { return this.saved.tokens; }
  saveTokens(tokens) { this.saved.tokens = tokens; }
  redirectToAuthorization(url) { this.authorizationUrl = url; }
  saveCodeVerifier(verifier) { this.saved.verifier = verifier; }
  codeVerifier() { return this.saved.verifier; }
}

async function approveInBrowser(authorizationUrl, scopes) {
  const authorize = await fetch(authorizationUrl, { redirect: 'manual' });
  assert.equal(authorize.status, 302);
  const consentPage = new URL(authorize.headers.get('location'));
  assert.equal(consentPage.origin + consentPage.pathname, 'http://localhost:3000/oauth/authorize');
  const request = consentPage.searchParams.get('request');
  const described = await (await call('POST', '/api/oauth/requests/describe', { token: sessionJwt, body: { request } })).json();
  const decision = await call('POST', '/api/oauth/consent', { token: sessionJwt, body: { request, decision: 'approve', ...(scopes ? { scopes } : {}) } });
  assert.equal(decision.status, 200);
  const redirect = new URL((await decision.json()).redirectTo);
  assert.equal(redirect.searchParams.get('iss'), BASE);
  return { code: redirect.searchParams.get('code'), redirect, described, request };
}

test('OAuth 2.1 with dynamic registration, PKCE, consent, audience binding and rotation (SDK client)', async () => {
  const provider = new MemoryProvider('http://localhost:7777/callback');
  assert.equal(await sdkAuth(provider, { serverUrl: `${BASE}/mcp` }), 'REDIRECT');
  assert.match(provider.saved.client.client_id, /^icc_/);
  const url = new URL(provider.authorizationUrl);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('resource'), `${BASE}/mcp`);

  const { code, described } = await approveInBrowser(url, ['read', 'write']);
  assert.equal(described.client.name, 'Cliente de teste');
  assert.equal(described.loopbackOnly, true);
  assert.equal(described.user.email, 'owner@fixture.invalid');
  assert.equal(await sdkAuth(provider, { serverUrl: `${BASE}/mcp`, authorizationCode: code }), 'AUTHORIZED');
  const tokens = provider.saved.tokens;
  assert.match(tokens.access_token, /^ic_oat_/);
  assert.equal(tokens.scope, 'read write');

  const client = new Client({ name: 'oauth-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { authProvider: provider }));
  assert.equal(ok(await tool(client, 'get_profile')).id, ids.owner);
  assert.equal((await tool(client, 'schedule_post', { postId: crypto.randomUUID(), scheduledFor: new Date(Date.now() + 3_600_000).toISOString() })).isError, true);
  await client.close();

  // Audience binding: the OAuth token is only valid at /mcp, not on the REST API.
  assert.equal((await call('GET', '/api/posts', { token: tokens.access_token })).status, 401);

  // Code replay is refused and revokes what the code produced.
  const replay = await fetch(`${BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'http://localhost:7777/callback', client_id: provider.saved.client.client_id, code_verifier: provider.saved.verifier }) });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, 'invalid_grant');
  assert.equal((await call('POST', '/mcp', { token: tokens.access_token, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { Accept: 'application/json, text/event-stream' } })).status, 401);
});

test('refresh tokens rotate; an old refresh token stops working; revocation works', async () => {
  const provider = new MemoryProvider('http://127.0.0.1:8888/cb');
  await sdkAuth(provider, { serverUrl: `${BASE}/mcp` });
  const { code } = await approveInBrowser(new URL(provider.authorizationUrl));
  await sdkAuth(provider, { serverUrl: `${BASE}/mcp`, authorizationCode: code });
  const first = provider.saved.tokens;
  // Spec-compliant clients request the scopes advertised in the 401 challenge; the consent screen may narrow them.
  assert.equal(first.scope, 'read write publish admin');
  const refresh = (refreshToken, extra = {}) => fetch(`${BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: provider.saved.client.client_id, ...extra }) });
  const rotated = await (await refresh(first.refresh_token, { scope: 'read' })).json();
  assert.match(rotated.refresh_token, /^ic_ort_/);
  assert.notEqual(rotated.refresh_token, first.refresh_token);
  assert.equal(rotated.scope, 'read');
  assert.equal((await (await refresh(first.refresh_token)).json()).error, 'invalid_grant');
  assert.equal((await (await refresh(rotated.refresh_token, { scope: 'read admin' })).json()).error, 'invalid_scope');
  const client = await mcpClient(rotated.access_token);
  assert.equal(ok(await tool(client, 'get_profile')).email, 'owner@fixture.invalid');
  await client.close();
  const grants = await (await call('GET', '/api/integrations/tokens', { token: sessionJwt })).json();
  assert.ok(grants.oauth.some((grant) => grant.oauthClient.clientName === 'Cliente de teste'));
  const revoke = await fetch(`${BASE}/oauth/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: rotated.access_token, client_id: provider.saved.client.client_id }) });
  assert.equal(revoke.status, 200);
  assert.equal((await call('POST', '/mcp', { token: rotated.access_token, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })).status, 401);
});

test('authorization errors never redirect to unregistered URIs; protocol errors carry state and iss', async () => {
  const badRegistration = await fetch(`${BASE}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }) });
  assert.equal(badRegistration.status, 400);
  assert.equal((await badRegistration.json()).error, 'invalid_redirect_uri');
  const registered = await (await fetch(`${BASE}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://app.example/cb'], client_name: 'App', token_endpoint_auth_method: 'none' }) })).json();
  const challenge = crypto.createHash('sha256').update('v'.repeat(50)).digest('base64url');
  const authorize = (params) => fetch(`${BASE}/oauth/authorize?${new URLSearchParams({ client_id: registered.client_id, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 's1', ...params })}`, { redirect: 'manual' });
  const wrongRedirect = await authorize({ redirect_uri: 'https://attacker.example/cb' });
  assert.equal(wrongRedirect.status, 400);
  assert.equal(wrongRedirect.headers.get('location'), null);
  const noPkce = await authorize({ redirect_uri: 'https://app.example/cb', code_challenge_method: 'plain' });
  const location = new URL(noPkce.headers.get('location'));
  assert.equal(location.origin, 'https://app.example');
  assert.equal(location.searchParams.get('error'), 'invalid_request');
  assert.equal(location.searchParams.get('state'), 's1');
  assert.equal(location.searchParams.get('iss'), BASE);
  const wrongResource = new URL((await authorize({ redirect_uri: 'https://app.example/cb', resource: 'https://other.example/mcp' })).headers.get('location'));
  assert.equal(wrongResource.searchParams.get('error'), 'invalid_target');
  const ok200 = await authorize({ redirect_uri: 'https://app.example/cb' });
  const request = new URL(ok200.headers.get('location')).searchParams.get('request');
  const denied = await (await call('POST', '/api/oauth/consent', { token: sessionJwt, body: { request, decision: 'deny' } })).json();
  assert.equal(new URL(denied.redirectTo).searchParams.get('error'), 'access_denied');
  // The signed consent request is not a session either.
  assert.equal((await call('GET', '/api/posts', { token: request })).status, 401);
  assert.equal((await call('POST', '/api/oauth/consent', { token: fullToken, body: { request, decision: 'approve' } })).status, 403);
});

test('Client ID Metadata Documents with port-agnostic loopback redirects (Claude Code style)', async () => {
  const metadataUrl = 'https://claude.example/oauth/claude-code-client-metadata';
  cimdFetcher.fetch = async (url) => {
    assert.equal(url, metadataUrl);
    return { client_id: metadataUrl, client_name: 'Claude Code', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], token_endpoint_auth_method: 'none' };
  };
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = 'http://localhost:53123/callback';
  const authorizationUrl = `${BASE}/oauth/authorize?${new URLSearchParams({ client_id: metadataUrl, redirect_uri: redirectUri, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope: 'read write publish admin offline_access', resource: `${BASE}/mcp`, state: 'cc' })}`;
  const { code, described, redirect } = await approveInBrowser(authorizationUrl);
  assert.equal(described.client.name, 'Claude Code');
  assert.equal(described.client.metadataUrl, metadataUrl);
  assert.equal(redirect.origin, 'http://localhost:53123');
  assert.equal(redirect.searchParams.get('state'), 'cc');
  const tokens = await (await fetch(`${BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: metadataUrl, code_verifier: verifier, resource: `${BASE}/mcp` }) })).json();
  assert.equal(tokens.scope, 'read write publish admin');
  const wrongVerifier = await fetch(`${BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: 'ic_oac_x', redirect_uri: redirectUri, client_id: metadataUrl, code_verifier: verifier }) });
  assert.equal((await wrongVerifier.json()).error, 'invalid_grant');
  const client = await mcpClient(tokens.access_token);
  assert.equal(ok(await tool(client, 'get_workspace_overview')).connection.name, 'Claude Code');
  await client.close();
});

const cliPath = path.join(__dirname, '..', 'dist', 'cli', 'instacommand.js');
function runCli(args, { input, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { env: { ...process.env, INSTACOMMAND_API_URL: BASE, INSTACOMMAND_TOKEN: fullToken, INSTACOMMAND_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ic-cli-')), ...env } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  });
}

test('CLI: status, local upload + create, generic call and the stdio MCP bridge', async () => {
  const status = await runCli(['status', '--json']);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).user.id, ids.owner);

  const imagePath = path.join(uploadDir, 'local-photo.jpg');
  fs.writeFileSync(imagePath, JPEG);
  const created = await runCli(['posts', 'create', '--account', '@loja_fixture', '--media', imagePath, '--caption', 'Via CLI', '--hashtags', 'cli,teste', '--at', '2030-01-15 10:30', '--json']);
  assert.equal(created.code, 0, created.stderr);
  const post = JSON.parse(created.stdout).post;
  assert.equal(post.mediaType, 'IMAGE');
  assert.equal(post.status, 'DRAFT');
  assert.equal(post.captionAsPublished, 'Via CLI\n\n#cli #teste');
  assert.equal(new Date(post.scheduledFor).getTime(), new Date(2030, 0, 15, 10, 30).getTime());

  const notMedia = path.join(uploadDir, 'secret.txt');
  fs.writeFileSync(notMedia, 'PRIVATE KEY');
  const refused = await runCli(['media', 'upload', notMedia]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /não é uma imagem ou vídeo/);

  const generic = await runCli(['call', 'list_posts', 'limit=1', 'status=DRAFT']);
  assert.equal(generic.code, 0, generic.stderr);
  assert.equal(JSON.parse(generic.stdout).posts.length, 1);

  assert.equal((await runCli(['posts', 'delete', post.id])).code, 2);

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bridge-test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'upload_local_media', arguments: { paths: [imagePath] } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_profile', arguments: {} } },
  ].map((message) => JSON.stringify(message)).join('\n') + '\n';
  const bridge = await runCli(['mcp'], { input: messages });
  const replies = Object.fromEntries(bridge.stdout.trim().split('\n').map((line) => JSON.parse(line)).map((reply) => [reply.id, reply]));
  assert.equal(replies[1].result.protocolVersion, '2025-06-18');
  assert.equal(replies[1].result.serverInfo.name, 'instacommand');
  assert.ok(replies[2].result.tools.some((t) => t.name === 'upload_local_media'));
  assert.equal(replies[2].result.tools.length, 59);
  assert.match(replies[3].result.structuredContent.urls[0], /\/uploads\/.+\.jpg$/);
  assert.equal(replies[4].result.structuredContent.id, ids.owner);
});

test('the downloadable CLI embeds this server URL', async () => {
  const response = await fetch(`${BASE}/downloads/instacommand.cjs`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(body.startsWith('#!/usr/bin/env node'));
  assert.ok(body.includes(`'${BASE}'`));
  assert.equal(body.includes('__INSTACOMMAND_DEFAULT_API_URL__'), false);
  const catalog = await (await call('GET', '/api/integrations/catalog', { token: sessionJwt })).json();
  assert.equal(catalog.urls.mcp, `${BASE}/mcp`);
  assert.equal(catalog.tools.length, 59);
  assert.equal(catalog.tools.find((t) => t.name === 'delete_post').requiresConfirmation, true);
});
