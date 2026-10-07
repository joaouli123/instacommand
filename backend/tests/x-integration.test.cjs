const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const env = {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!',
  X_CLIENT_ID: 'client-id', X_CLIENT_SECRET: 'client-secret', X_REDIRECT_URI: 'https://api.example.test/api/auth/x/callback',
  GEMINI_MODEL: 'gemini', FRONTEND_URL: 'https://app.example.test',
};
let accounts = {};
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  xAccount = {
    findUnique: async ({ where }) => accounts[where.id] || Object.values(accounts).find((a) => a.xUserId === where.xUserId) || null,
    findFirst: async ({ where }) => Object.values(accounts).find((a) => a.id === where.id && a.userId === where.userId && a.isActive) || null,
    update: async ({ where, data }) => Object.assign(accounts[where.id], data),
    upsert: async ({ create }) => create,
  };
  scheduledPost = { updateMany: async () => ({ count: 0 }) };
  user = { findUnique: async () => null };
} } };

const x = require('../dist/services/x.service');
const { assertPostReady } = require('../dist/services/post-readiness');
const { mapXPost, summarizeXPosts } = require('../dist/services/x-report.service');
const { encryptSecret } = require('../dist/services/instagram/auth.service');

test('X login uses OAuth 2.0 with PKCE S256 and keeps the verifier secret inside the signed state', () => {
  const { url } = x.createXAuthorization('user-1');
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://x.com/i/oauth2/authorize');
  assert.equal(parsed.searchParams.get('client_id'), 'client-id');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsed.searchParams.get('redirect_uri'), env.X_REDIRECT_URI);
  assert.deepEqual(parsed.searchParams.get('scope').split(' '), ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access']);
  const state = parsed.searchParams.get('state');
  const decoded = x.readXState(state);
  assert.equal(decoded.userId, 'user-1');
  const challenge = crypto.createHash('sha256').update(decoded.verifier).digest('base64url');
  assert.equal(parsed.searchParams.get('code_challenge'), challenge);
  // The verifier never appears in clear text in the URL.
  assert.equal(url.includes(decoded.verifier), false);
  assert.equal(x.readXState(state.slice(0, -2) + 'xx'), null);
  assert.equal(x.readXState('not-a-token'), null);
});

test('X login is refused with a clear code when the server has no X credentials', () => {
  const saved = env.X_CLIENT_ID; env.X_CLIENT_ID = '';
  try { assert.throws(() => x.createXAuthorization('user-1'), /X_OAUTH_NOT_CONFIGURED/); } finally { env.X_CLIENT_ID = saved; }
});

test('posting rules: 280 characters and up to 4 media on X; text-only posts on Threads and X', () => {
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], caption: 'Bom dia', platforms: ['X'] }));
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], caption: 'Bom dia', platforms: ['THREADS', 'X'] }));
  assert.throws(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], caption: 'a'.repeat(281), platforms: ['X'] }), /280/);
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], caption: 'a'.repeat(400), platforms: ['THREADS'] }));
  assert.throws(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], caption: 'oi', platforms: ['INSTAGRAM', 'X'] }), /Threads e no X/);
  assert.throws(() => assertPostReady({ mediaType: 'CAROUSEL', mediaUrls: ['a', 'b', 'c', 'd', 'e'], caption: 'oi', platforms: ['INSTAGRAM', 'X'] }), /até 4/);
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'CAROUSEL', mediaUrls: ['a', 'b', 'c', 'd', 'e'], caption: 'oi', platforms: ['INSTAGRAM'] }));
  // Emoji count as one character, as on X.
  assert.doesNotThrow(() => assertPostReady({ mediaType: 'TEXT', mediaUrls: [], caption: '🚗'.repeat(280), platforms: ['X'] }));
});

test('X report sums counters, prefers private impressions and never invents missing ones', () => {
  const media = new Map([['m1', { media_key: 'm1', url: 'https://pbs.twimg.com/a.jpg' }]]);
  const a = mapXPost({ id: '1', text: 'oi', created_at: '2026-10-01T10:00:00Z', attachments: { media_keys: ['m1'] }, public_metrics: { like_count: 5, reply_count: 1, retweet_count: 2, quote_count: 0, bookmark_count: 1, impression_count: 90 }, non_public_metrics: { impression_count: 100, url_link_clicks: 3, user_profile_clicks: 4 } }, media, 'marca');
  const b = mapXPost({ id: '2', text: 'olá', created_at: '2026-10-02T10:00:00Z', public_metrics: { like_count: 1, reply_count: 0, retweet_count: 0, quote_count: 1, bookmark_count: 0 } }, media, 'marca');
  assert.equal(a.metrics.impressions, 100);
  assert.equal(a.image, 'https://pbs.twimg.com/a.jpg');
  assert.equal(a.url, 'https://x.com/marca/status/1');
  assert.equal(b.metrics.impressions, null);
  const summary = summarizeXPosts([a, b]);
  assert.equal(summary.totals.impressions, 100);
  assert.equal(summary.totals.engagement, 11);
  assert.equal(summary.engagementRate, 11);
  assert.equal(summary.totals.urlClicks, 3);
  assert.deepEqual(summary.daily.map((day) => day.date), ['2026-10-01', '2026-10-02']);
  assert.equal(summarizeXPosts([]).engagementRate, null);
});

test('publishing creates the post with the uploaded media and refreshes an expiring token first', async () => {
  accounts = { acc: { id: 'acc', userId: 'u', isActive: true, xUserId: '9', username: 'marca', accessToken: encryptSecret('old'), refreshToken: encryptSecret('refresh-1'), tokenExpiresAt: new Date(Date.now() + 30_000) } };
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/2/oauth2/token')) return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'refresh-2', expires_in: 7200 }), { status: 200 });
    if (String(url).endsWith('/2/tweets')) return new Response(JSON.stringify({ data: { id: '777' } }), { status: 201 });
    return new Response('{}', { status: 404 });
  };
  try {
    const id = await x.publishXPost({ caption: 'Lançamento hoje', mediaUrls: [], mediaType: 'TEXT' }, 'acc');
    assert.equal(id, '777');
    const tokenCall = calls.find((call) => call.url.endsWith('/2/oauth2/token'));
    assert.match(String(tokenCall.init.body), /grant_type=refresh_token/);
    assert.match(tokenCall.init.headers.Authorization, /^Basic /);
    const post = calls.find((call) => call.url.endsWith('/2/tweets'));
    assert.equal(post.init.headers.Authorization, 'Bearer fresh');
    assert.deepEqual(JSON.parse(post.init.body), { text: 'Lançamento hoje' });
    // The rotated refresh token is stored encrypted, never in clear text.
    assert.notEqual(accounts.acc.refreshToken, 'refresh-2');
    await assert.rejects(x.publishXPost({ caption: 'a'.repeat(281), mediaUrls: [], mediaType: 'TEXT' }, 'acc'), /280/);
  } finally { global.fetch = realFetch; }
});

test('X API errors become clear messages (credits, expired connection, limits)', () => {
  assert.match(x.describeXError(402, {}), /créditos/);
  assert.match(x.describeXError(401, {}), /Conecte a conta novamente/);
  assert.match(x.describeXError(429, {}), /limitou/);
  assert.match(x.describeXError(403, { detail: 'You are not permitted to perform this action.' }), /recusou/);
});

test('GET /accounts/x is declared before the /:id route that would swallow it', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/routes/accounts.routes.ts'), 'utf8');
  assert.ok(source.indexOf("router.get('/x'") > -1);
  assert.ok(source.indexOf("router.get('/x'") < source.indexOf("router.get('/:id'"));
  assert.ok(source.indexOf("router.delete('/x/:id'") < source.indexOf("router.delete('/:id'"));
});

test('X connection problems never answer 401, which would sign the user out of InstaCommand', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/services/x.service.ts'), 'utf8');
  assert.doesNotMatch(source, /AppError\([^)]*,\s*401\)/);
  assert.doesNotMatch(source, /\?\s*401\s*:/);
});

test('stored X numbers are reused for 6 hours; a manual refresh waits at least 15 minutes', () => {
  const { shouldSyncX } = require('../dist/services/x-report.service');
  const now = Date.parse('2026-10-07T12:00:00Z');
  const minutesAgo = (m) => new Date(now - m * 60000);
  assert.equal(shouldSyncX(null, false, now), true);
  assert.equal(shouldSyncX(minutesAgo(60), false, now), false);
  assert.equal(shouldSyncX(minutesAgo(6 * 60 + 1), false, now), true);
  assert.equal(shouldSyncX(minutesAgo(5), true, now), false);
  assert.equal(shouldSyncX(minutesAgo(16), true, now), true);
});
