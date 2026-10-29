const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

const env = {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!',
  GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret', YOUTUBE_REDIRECT_URI: 'https://api.example.test/api/auth/youtube/callback',
  GEMINI_MODEL: 'gemini', FRONTEND_URL: 'https://app.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads', BACKEND_URL: 'https://api.example.test',
};
let accounts = {};
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  youTubeAccount = {
    findUnique: async ({ where }) => accounts[where.id] || Object.values(accounts).find((a) => a.channelId === where.channelId) || null,
    findFirst: async ({ where }) => Object.values(accounts).find((a) => a.id === where.id && a.userId === where.userId) || null,
    update: async ({ where, data }) => Object.assign(accounts[where.id], data),
    upsert: async ({ create }) => create,
  };
  scheduledPost = { updateMany: async () => ({ count: 0 }) };
  user = { findUnique: async () => null };
} } };

const youtube = require('../dist/services/youtube.service');
const { validateYouTubeSettings } = require('../dist/services/youtube-settings');
const { assertPostReady } = require('../dist/services/post-readiness');
const { encryptSecret } = require('../dist/services/instagram/auth.service');
const { safeFetchPolicy } = require('../dist/utils/safe-fetch');

const settings = { title: 'Bastidores do lançamento', privacyStatus: 'public', madeForKids: false };

test('YouTube login asks Google for offline access with PKCE and only the upload, read and analytics-read scopes', () => {
  const { url } = youtube.createYouTubeAuthorization('user-1');
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(parsed.searchParams.get('client_id'), 'google-client');
  assert.equal(parsed.searchParams.get('access_type'), 'offline');
  assert.equal(parsed.searchParams.get('prompt'), 'consent');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.deepEqual(parsed.searchParams.get('scope').split(' '), [
    'https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly',
  ]);
  const decoded = youtube.readYouTubeState(parsed.searchParams.get('state'));
  assert.equal(decoded.userId, 'user-1');
  assert.equal(parsed.searchParams.get('code_challenge'), crypto.createHash('sha256').update(decoded.verifier).digest('base64url'));
  assert.equal(url.includes(decoded.verifier), false);
  assert.equal(youtube.readYouTubeState('not-a-token'), null);
});

test('YouTube login is refused with a clear code when the server has no Google credentials', () => {
  const saved = env.GOOGLE_CLIENT_ID; env.GOOGLE_CLIENT_ID = '';
  try { assert.throws(() => youtube.createYouTubeAuthorization('user-1'), /YOUTUBE_OAUTH_NOT_CONFIGURED/); } finally { env.GOOGLE_CLIENT_ID = saved; }
});

test('YouTube settings: drafts may be incomplete, scheduling needs a title and the audience declaration', () => {
  assert.equal(validateYouTubeSettings(undefined), null);
  assert.deepEqual(validateYouTubeSettings({ title: '  Meu   vídeo ' }), {
    format: 'video', title: 'Meu vídeo', privacyStatus: 'public', madeForKids: null, alteredContent: false, categoryId: '22', thumbnailUrl: null,
    tags: [], defaultLanguage: null, defaultAudioLanguage: null, license: 'youtube', embeddable: true, publicStatsViewable: true, notifySubscribers: true, recordingDate: null,
  });
  assert.throws(() => validateYouTubeSettings({ title: 'a'.repeat(101) }), /100/);
  assert.throws(() => validateYouTubeSettings({ title: 'a <b>' }), /< ou >/);
  assert.throws(() => validateYouTubeSettings({ title: 'ok', privacyStatus: 'friends' }), /Visibilidade/);
  assert.throws(() => validateYouTubeSettings({ title: 'ok', categoryId: '999' }), /Categoria/);
  assert.throws(() => validateYouTubeSettings({ title: '' }, { requireComplete: true }), /título/);
  assert.throws(() => validateYouTubeSettings({ title: 'ok' }, { requireComplete: true }), /crianças/);
  assert.doesNotThrow(() => validateYouTubeSettings(settings, { requireComplete: true }));
});

test('YouTube settings: format, tags, languages and Studio options are checked before they reach YouTube', () => {
  const full = validateYouTubeSettings({ ...settings, format: 'short', tags: ['#finanças', 'fluxo de caixa', 'Finanças', ' '], defaultLanguage: 'pt-BR', defaultAudioLanguage: 'en', license: 'creativeCommon', embeddable: false, publicStatsViewable: false, notifySubscribers: false, recordingDate: '2026-01-15' });
  assert.equal(full.format, 'short');
  assert.deepEqual(full.tags, ['finanças', 'fluxo de caixa']);
  assert.equal(full.license, 'creativeCommon');
  assert.equal(full.notifySubscribers, false);
  assert.throws(() => validateYouTubeSettings({ ...settings, format: 'live' }), /Formato/);
  assert.throws(() => validateYouTubeSettings({ ...settings, tags: ['a,b'] }), /vírgula/);
  assert.throws(() => validateYouTubeSettings({ ...settings, tags: Array.from({ length: 60 }, (_, i) => `tag numero ${i}`) }), /500/);
  assert.throws(() => validateYouTubeSettings({ ...settings, defaultLanguage: 'xx' }), /Idioma/);
  assert.throws(() => validateYouTubeSettings({ ...settings, license: 'mit' }), /Licença/);
  assert.throws(() => validateYouTubeSettings({ ...settings, recordingDate: '2026-02-30' }), /gravação/);
  assert.throws(() => validateYouTubeSettings({ ...settings, recordingDate: '2999-01-01' }), /futuro/);
  assert.throws(() => validateYouTubeSettings({ ...settings, embeddable: 'sim' }), /incorporação/);

  assert.deepEqual(youtube.buildYouTubeMetadata(full, 'Descrição'), {
    snippet: { title: settings.title, description: 'Descrição', categoryId: '22', tags: ['finanças', 'fluxo de caixa'], defaultLanguage: 'pt-BR', defaultAudioLanguage: 'en' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: false, embeddable: false, publicStatsViewable: false, license: 'creativeCommon' },
    recordingDetails: { recordingDate: '2026-01-15T00:00:00Z' },
  });
  assert.equal(youtube.youtubeUploadParts(full), 'snippet,status,recordingDetails');
  assert.equal(youtube.youtubeUploadParts({ ...full, recordingDate: null }), 'snippet,status');
});

test('posting rules: YouTube takes exactly one video, a title and a description without < or >', () => {
  const video = { mediaType: 'REEL', mediaUrls: ['https://cdn.example.test/v.mp4'], caption: 'Descrição', platforms: ['YOUTUBE'], youtubeSettings: settings };
  assert.doesNotThrow(() => assertPostReady(video));
  assert.doesNotThrow(() => assertPostReady({ ...video, platforms: ['INSTAGRAM', 'YOUTUBE'] }));
  assert.throws(() => assertPostReady({ ...video, mediaType: 'IMAGE', mediaUrls: ['https://cdn.example.test/a.jpg'] }), /apenas um vídeo/);
  assert.throws(() => assertPostReady({ ...video, mediaType: 'CAROUSEL', mediaUrls: ['a.mp4', 'b.mp4'] }), /apenas um vídeo/);
  assert.throws(() => assertPostReady({ ...video, youtubeSettings: undefined }), /título/);
  assert.throws(() => assertPostReady({ ...video, caption: 'veja <aqui>' }), /< ou >/);
  assert.throws(() => assertPostReady({ ...video, mediaType: 'TEXT', mediaUrls: [] }), /apenas um vídeo/);
});

test('publishing uploads the video through a resumable session and reports when YouTube keeps it private', async () => {
  accounts = { ch: { id: 'ch', userId: 'u', isActive: true, channelId: 'UC1', accessToken: encryptSecret('old'), refreshToken: encryptSecret('refresh-1'), tokenExpiresAt: new Date(Date.now() + 30_000) } };
  const video = Buffer.from('fake-mp4-bytes');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': video.length }); res.end(video); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const mediaUrl = `http://127.0.0.1:${server.address().port}/v.mp4`;
  const calls = [];
  const realFetch = global.fetch;
  const savedPolicy = { ...safeFetchPolicy };
  Object.assign(safeFetchPolicy, { allowPrivateNetworks: true, allowAnyPort: true });
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === youtube.GOOGLE_TOKEN_URL) return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3599 }), { status: 200 });
    if (String(url).startsWith(`${youtube.YOUTUBE_UPLOAD_API}/videos`)) return new Response('', { status: 200, headers: { location: 'https://upload.example.test/session-1' } });
    if (String(url) === 'https://upload.example.test/session-1') return new Response(JSON.stringify({ id: 'vid123', status: { privacyStatus: 'private', uploadStatus: 'uploaded' } }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  try {
    const result = await youtube.publishYouTubeVideo({ caption: 'Descrição #marca', mediaUrls: [mediaUrl], mediaType: 'REEL', youtubeSettings: settings }, 'ch');
    assert.equal(result.id, 'vid123');
    assert.equal(result.url, 'https://www.youtube.com/watch?v=vid123');
    // Refresh tokens are not rotated by Google: the stored one is kept.
    assert.match(String(calls[0].init.body), /grant_type=refresh_token/);
    const session = calls.find((call) => call.url.startsWith(`${youtube.YOUTUBE_UPLOAD_API}/videos`));
    assert.equal(session.init.headers.Authorization, 'Bearer fresh');
    assert.equal(session.init.headers['X-Upload-Content-Length'], String(video.length));
    assert.deepEqual(JSON.parse(session.init.body), {
      snippet: { title: settings.title, description: 'Descrição #marca', categoryId: '22' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: false, embeddable: true, publicStatsViewable: true, license: 'youtube' },
    });
    assert.match(session.url, /part=snippet%2Cstatus&notifySubscribers=true$/);
    const upload = calls.find((call) => call.url === 'https://upload.example.test/session-1');
    assert.equal(upload.init.method, 'PUT');
    assert.equal(Buffer.from(upload.init.body).toString(), 'fake-mp4-bytes');
    assert.match(result.warnings[0], /privado/);
    assert.notEqual(accounts.ch.accessToken, 'fresh');
  } finally {
    global.fetch = realFetch;
    Object.assign(safeFetchPolicy, savedPolicy);
    server.close();
  }
});

test('YouTube API errors become clear messages (quota, upload limit, missing channel)', () => {
  assert.match(youtube.describeYouTubeError(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }), /cota/);
  assert.match(youtube.describeYouTubeError(400, { error: { errors: [{ reason: 'uploadLimitExceeded' }] } }), /limite de envios/);
  assert.match(youtube.describeYouTubeError(401, {}), /Conecte o canal novamente/);
  assert.match(youtube.describeYouTubeError(403, { error: { errors: [{ reason: 'youtubeSignupRequired' }] } }), /canal/);
});

test('GET and DELETE /accounts/youtube are declared before the /:id routes that would swallow them', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/routes/accounts.routes.ts'), 'utf8');
  assert.ok(source.indexOf("router.get('/youtube'") > -1);
  assert.ok(source.indexOf("router.get('/youtube'") < source.indexOf("router.get('/:id'"));
  assert.ok(source.indexOf("router.delete('/youtube/:id'") < source.indexOf("router.delete('/:id'"));
});

test('YouTube connection problems never answer 401, which would sign the user out of UX Code Social', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/services/youtube.service.ts'), 'utf8');
  assert.doesNotMatch(source, /AppError\([^)]*,\s*401\)/);
  assert.doesNotMatch(source, /\?\s*401\s*:/);
});
