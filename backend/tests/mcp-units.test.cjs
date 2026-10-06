const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.DATABASE_URL ||= 'postgresql://unit:unit@127.0.0.1:1/unit';
process.env.BACKEND_URL = 'https://api.example.test';

const { requiredScopeFor, resolvePostRequirement, normalizeScopes } = require('../dist/services/api-scopes');
const { isPublicIpAddress, assertFetchableUrl } = require('../dist/utils/safe-fetch');
const { parseRedirectUri, redirectUriMatches, verifyPkce, pkceChallengeFor, parseScopeParam, authorizationServerMetadata, protectedResourceMetadata } = require('../dist/services/oauth.service');
const { asSessionPayload } = require('../dist/middleware/auth');
const { isApiTokenFormat, generateSecret } = require('../dist/services/api-tokens.service');
const { mergeHashtagsIntoCaption } = require('../dist/mcp/tool-kit');
const { detectMediaSignature } = require('../dist/utils/media-signature');
const { MCP_TOOLS } = require('../dist/mcp/catalog');
const { embeddableApiUrl } = require('../dist/routes/downloads.routes');
const cli = require('../dist/cli/instacommand');

const scope = (method, url, body) => requiredScopeFor(method, url, body);

test('scope policy maps each kind of REST action and fails closed', () => {
  assert.deepEqual(scope('GET', '/api/posts?status=DRAFT'), { scope: 'read' });
  assert.deepEqual(scope('GET', '/api/auth/facebook/url'), { scope: 'admin' });
  assert.deepEqual(scope('GET', '/API/Auth/Threads/URL/'), { scope: 'admin' });
  assert.deepEqual(scope('POST', '/api/posts', { status: 'DRAFT' }), { scope: 'write' });
  assert.deepEqual(scope('POST', '/api/posts', { status: 'SCHEDULED' }), { scope: 'publish' });
  assert.deepEqual(scope('POST', '/api/posts/abc/publish'), { scope: 'publish' });
  assert.deepEqual(scope('POST', '/api/posts/import-url'), { scope: 'write' });
  assert.deepEqual(scope('POST', '/api/community/comments/1/reply'), { scope: 'publish' });
  assert.deepEqual(scope('DELETE', '/api/community/comments/1?accountId=x'), { scope: 'publish' });
  assert.deepEqual(scope('PUT', '/api/automations/agent', { enabled: true, autoSend: true }), { scope: 'publish' });
  assert.deepEqual(scope('PUT', '/api/automations/agent', { enabled: true, autoSend: false }), { scope: 'write' });
  assert.deepEqual(scope('PUT', '/api/automations/rule-id', { enabled: true }), { scope: 'publish' });
  assert.deepEqual(scope('POST', '/api/automations', { enabled: false }), { scope: 'write' });
  assert.deepEqual(scope('POST', '/api/automations/subscribe'), { scope: 'admin' });
  assert.deepEqual(scope('PUT', '/api/settings/ai'), { scope: 'admin' });
  assert.deepEqual(scope('PUT', '/api/settings/preferences'), { scope: 'write' });
  assert.deepEqual(scope('DELETE', '/api/accounts/x'), { scope: 'admin' });
  assert.deepEqual(scope('POST', '/api/accounts/select'), { scope: 'admin' });
  assert.deepEqual(scope('POST', '/api/some/future/route'), { scope: 'admin' });
  assert.deepEqual(scope('GET', '/api/integrations/tokens'), { scope: 'session' });
  assert.deepEqual(scope('POST', '/api/oauth/consent'), { scope: 'session' });
  assert.deepEqual(scope('PATCH', '/api/posts/p1', { status: 'DRAFT' }), { postId: 'p1', method: 'PATCH', requestedStatus: 'DRAFT' });
});

test('post-dependent requirements: editing or deleting something public needs publish', () => {
  const patch = (requestedStatus, status) => resolvePostRequirement({ method: 'PATCH', requestedStatus }, { status, publishedPostId: null });
  assert.equal(patch(undefined, 'DRAFT'), 'write');
  assert.equal(patch(undefined, 'SCHEDULED'), 'publish');
  assert.equal(patch('SCHEDULED', 'DRAFT'), 'publish');
  assert.equal(patch('DRAFT', 'SCHEDULED'), 'write');
  const del = (status, publishedPostId = null) => resolvePostRequirement({ method: 'DELETE' }, { status, publishedPostId });
  assert.equal(del('DRAFT'), 'write');
  assert.equal(del('FAILED', 'pp'), 'publish');
  assert.equal(del('PUBLISHED'), 'publish');
  assert.equal(resolvePostRequirement({ method: 'DELETE' }, null), 'write');
  assert.deepEqual(normalizeScopes(['admin', 'read', 'bogus', 'read']), ['read', 'admin']);
});

test('only genuine session payloads are sessions', () => {
  assert.deepEqual(asSessionPayload({ id: 'u', email: 'e@x', iat: 1 }), { id: 'u', email: 'e@x' });
  for (const payload of [{ sub: 'u', purpose: 'meta' }, { sub: 'u', purpose: 'oauth_session' }, { id: 'u' }, { id: 'u', email: 'e', purpose: 'x' }, { id: 'u', email: 'e', aud: 'x' }, null, 'str']) {
    assert.equal(asSessionPayload(payload), null, JSON.stringify(payload));
  }
});

test('SSRF guard classifies private, reserved and mapped addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2002:7f00:1::1', '224.0.0.1', '255.255.255.255']) {
    assert.equal(isPublicIpAddress(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPublicIpAddress(ip), true, ip);
  for (const url of ['http://127.0.0.1/a.jpg', 'http://[::1]/a', 'http://2130706433/a', 'http://0x7f.1/a', 'file:///etc/passwd', 'https://user:pass@example.com/a', 'https://example.com:6379/a', 'ftp://example.com/a']) {
    assert.throws(() => assertFetchableUrl(url, true), undefined, url);
  }
  assert.throws(() => assertFetchableUrl('http://example.com/a', false));
  assert.equal(assertFetchableUrl('https://cdn.example.com:443/a.jpg', false).hostname, 'cdn.example.com');
});

test('redirect URIs: exact matching, loopback port flexibility, unsafe schemes refused', () => {
  assert.ok(redirectUriMatches('https://chatgpt.com/connector/oauth/abc', 'https://chatgpt.com/connector/oauth/abc'));
  assert.equal(redirectUriMatches('https://chatgpt.com/connector/oauth/abc', 'https://chatgpt.com/connector/oauth/abcd'), false);
  assert.ok(redirectUriMatches('http://localhost/callback', 'http://localhost:51234/callback'));
  assert.ok(redirectUriMatches('http://127.0.0.1/callback', 'http://127.0.0.1:9/callback'));
  assert.equal(redirectUriMatches('http://localhost/callback', 'http://127.0.0.1:9/callback'), false);
  assert.equal(redirectUriMatches('http://localhost/callback', 'http://localhost:9/other'), false);
  assert.equal(redirectUriMatches('https://app.example/cb', 'https://app.example:8443/cb'), false);
  for (const uri of ['https://claude.ai/api/mcp/auth_callback', 'http://localhost:3118/callback', 'cursor://anysphere.cursor-mcp/oauth/callback']) assert.ok(parseRedirectUri(uri));
  for (const uri of ['http://evil.example/cb', 'javascript:alert(1)', 'data:text/html,x', 'https://a.example/cb#frag', 'file:///x', 'https://u:p@a.example/cb', 42]) {
    assert.throws(() => parseRedirectUri(uri), undefined, String(uri));
  }
});

test('PKCE S256 and scope parsing', () => {
  const verifier = crypto.randomBytes(40).toString('base64url');
  const challenge = pkceChallengeFor(verifier);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.ok(verifyPkce(verifier, challenge));
  assert.equal(verifyPkce(`${verifier}x`, challenge), false);
  assert.equal(verifyPkce('short', challenge), false);
  assert.equal(verifyPkce(undefined, challenge), false);
  assert.deepEqual(parseScopeParam('admin offline_access read  unknown'), ['read', 'admin']);
  assert.deepEqual(parseScopeParam(undefined), []);
});

test('discovery metadata advertises what Claude and ChatGPT require', () => {
  const as = authorizationServerMetadata();
  assert.equal(as.issuer, 'https://api.example.test');
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.ok(as.token_endpoint_auth_methods_supported.includes('none'));
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.equal(as.authorization_response_iss_parameter_supported, true);
  assert.ok(as.registration_endpoint.endsWith('/oauth/register'));
  const prm = protectedResourceMetadata();
  assert.equal(prm.resource, 'https://api.example.test/mcp');
  assert.deepEqual(prm.authorization_servers, [as.issuer]);
});

test('token formats', () => {
  assert.ok(isApiTokenFormat(generateSecret('personal')));
  assert.ok(isApiTokenFormat(generateSecret('oauthAccess')));
  assert.equal(isApiTokenFormat(generateSecret('oauthRefresh')), false);
  assert.equal(isApiTokenFormat(generateSecret('oauthCode')), false);
  assert.equal(isApiTokenFormat('eyJhbGciOi.jwt.token'), false);
});

test('hashtag merge matches the composer and is idempotent', () => {
  assert.equal(mergeHashtagsIntoCaption('Oi #Moda', ['moda', '#verão', 'Verão', '']), 'Oi #Moda\n\n#verão');
  assert.equal(mergeHashtagsIntoCaption('', ['a']), '#a');
  assert.equal(mergeHashtagsIntoCaption('Só texto', []), 'Só texto');
  const once = mergeHashtagsIntoCaption('Texto', ['a', 'b']);
  assert.equal(mergeHashtagsIntoCaption(once, ['a', 'b']), once);
});

test('server and CLI media detection agree, and only real media is accepted', () => {
  const samples = {
    jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(12).fill(0)]),
    png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(8).fill(0)]),
    gif: Buffer.from('GIF89a0000000000'),
    webp: Buffer.from('RIFF0000WEBPVP8 '),
    mp4: Buffer.from('\0\0\0\x18ftypisom0000', 'latin1'),
    mov: Buffer.from('\0\0\0\x14ftypqt  0000', 'latin1'),
    heic: Buffer.from('\0\0\0\x18ftypheic0000', 'latin1'),
    html: Buffer.from('<!doctype html>x'),
    text: Buffer.from('-----BEGIN KEY--'),
  };
  for (const [name, head] of Object.entries(samples)) assert.deepEqual(cli.detectMedia(head), detectMediaSignature(head), name);
  assert.equal(detectMediaSignature(samples.mov).extension, '.mov');
  for (const name of ['heic', 'html', 'text']) assert.equal(detectMediaSignature(samples[name]), null, name);
});

test('CLI argument parsing, dates and generic tool arguments', () => {
  const parsed = cli.parseArgv(['posts', 'create', '--media', 'a.jpg', '--media=b.mp4', '--schedule', '-y', '--caption', 'Olá', '--', '--literal']);
  assert.deepEqual(parsed.positionals, ['posts', 'create', '--literal']);
  assert.deepEqual(parsed.flags.media, ['a.jpg', 'b.mp4']);
  assert.equal(parsed.flags.schedule, true);
  assert.equal(parsed.flags.yes, true);
  assert.throws(() => cli.parseArgv(['--caption']));
  const local = new Date(2030, 0, 15, 10, 30);
  assert.equal(new Date(cli.parseDateTimeArg('2030-01-15 10:30')).getTime(), local.getTime());
  assert.equal(new Date(cli.parseDateTimeArg('15/01/2030 10:30')).getTime(), local.getTime());
  assert.equal(cli.parseDateTimeArg('2030-01-15T10:30:00-03:00'), '2030-01-15T10:30:00-03:00');
  for (const bad of ['2030-02-30 10:00', 'amanhã', '2030-01-15']) assert.throws(() => cli.parseDateTimeArg(bad), undefined, bad);
  assert.deepEqual(cli.parseToolArgs(['limit=5', 'status=DRAFT', 'advancedSettings.firstComment=Oi', 'platforms=["THREADS"]'], {}), {
    limit: 5, status: 'DRAFT', advancedSettings: { firstComment: 'Oi' }, platforms: ['THREADS'],
  });
});

test('the CLI stays a single dependency-free file', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'cli', 'instacommand.js'), 'utf8');
  const requires = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(requires.length > 0);
  assert.ok(requires.every((name) => name.startsWith('node:')), requires.join(', '));
  assert.ok(source.startsWith('#!/usr/bin/env node'));
  assert.equal(embeddableApiUrl('https://api.example.test'), 'https://api.example.test');
  assert.equal(embeddableApiUrl("https://evil.test/'+require('child_process')+'"), '__INSTACOMMAND_DEFAULT_API_URL__');
});

test('tool catalog invariants', () => {
  const names = MCP_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of MCP_TOOLS) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{2,63}$/, tool.name);
    assert.ok(tool.description.length > 30, tool.name);
    assert.ok(tool.scopes.length > 0, tool.name);
    if (tool.annotations.readOnlyHint) assert.ok(tool.scopes.every((scope) => scope === 'read' || scope === 'admin'), tool.name);
    if (tool.annotations.readOnlyHint) assert.equal(tool.annotations.destructiveHint, false, tool.name);
  }
  // Irreversible actions on public content always require an explicit confirmation flag.
  for (const name of ['publish_post_now', 'delete_post', 'delete_comment', 'disconnect_account', 'delete_automation_rule']) {
    assert.ok('confirm' in MCP_TOOLS.find((tool) => tool.name === name).inputSchema, name);
  }
});
