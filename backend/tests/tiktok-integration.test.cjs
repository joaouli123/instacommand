const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const env = {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!',
  TIKTOK_CLIENT_KEY: 'tt-key', TIKTOK_CLIENT_SECRET: 'tt-secret', TIKTOK_REDIRECT_URI: 'https://api.example.test/api/auth/tiktok/callback',
  GEMINI_MODEL: 'gemini', FRONTEND_URL: 'https://app.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads', BACKEND_URL: 'https://api.example.test',
};
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
let account;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  tikTokAccount = {
    findUnique: async () => account, findFirst: async ({ where }) => (account && account.id === where.id && account.userId === where.userId ? account : null),
    update: async ({ data }) => Object.assign(account, data),
  };
} } };

const { encryptSecret } = require('../dist/services/instagram/auth.service');
const { safeFetchPolicy } = require('../dist/utils/safe-fetch');
const tiktok = require('../dist/services/tiktok.service');
const report = require('../dist/services/tiktok-report.service');
const { validateTikTokSettings, tiktokDisclosureLabel } = require('../dist/services/tiktok-settings');

const complete = { privacyLevel: 'SELF_ONLY', consent: true };

test('TikTok login asks for profile, stats, video list and publishing, with a signed state', () => {
  const { url } = tiktok.createTikTokAuthorization('user-1', 'company-1');
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.equal(parsed.searchParams.get('client_key'), 'tt-key');
  assert.deepEqual(parsed.searchParams.get('scope').split(','), ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.publish']);
  assert.deepEqual(tiktok.readTikTokState(parsed.searchParams.get('state')), { userId: 'user-1', workspaceAccountId: 'company-1' });
  assert.equal(tiktok.readTikTokState('forged'), null);
});

test('TikTok options follow the Direct Post rules: chosen privacy, consent, disclosure and branded content not private', () => {
  assert.deepEqual(validateTikTokSettings({}), { privacyLevel: null, allowComment: false, allowDuet: false, allowStitch: false, commercialContent: false, yourBrand: false, brandedContent: false, aiGenerated: false, consent: false });
  assert.throws(() => validateTikTokSettings({}, { requireComplete: true }), /Escolha quem pode ver/);
  assert.throws(() => validateTikTokSettings({ privacyLevel: 'SELF_ONLY' }, { requireComplete: true }), /Declaração de Uso de Música/);
  assert.throws(() => validateTikTokSettings({ ...complete, commercialContent: true }, { requireComplete: true }), /Sua marca/);
  assert.throws(() => validateTikTokSettings({ ...complete, commercialContent: true, brandedContent: true }), /não pode ser publicado como "Só eu"/);
  assert.throws(() => validateTikTokSettings({ privacyLevel: 'FRIENDS' }), /Privacidade do TikTok inválida/);
  assert.equal(validateTikTokSettings({ ...complete, yourBrand: true }).yourBrand, false, 'disclosure options only count with the toggle on');
  assert.equal(tiktokDisclosureLabel({ commercialContent: true, yourBrand: true, brandedContent: false }), 'Conteúdo promocional');
  assert.equal(tiktokDisclosureLabel({ commercialContent: true, yourBrand: true, brandedContent: true }), 'Parceria paga');
});

test('videos are sent whole when small and in 10 MB chunks otherwise, the last one taking the rest', () => {
  assert.deepEqual(tiktok.tiktokChunkPlan(3 * 1024 * 1024), { chunkSize: 3 * 1024 * 1024, totalChunks: 1 });
  assert.deepEqual(tiktok.tiktokChunkPlan(25 * 1024 * 1024), { chunkSize: 10 * 1024 * 1024, totalChunks: 2 });
  assert.deepEqual(tiktok.tiktokChunkPlan(50000123), { chunkSize: 10 * 1024 * 1024, totalChunks: 4 });
});

test('TikTok errors become clear messages and never a 401', () => {
  assert.match(tiktok.describeTikTokError(403, { error: { code: 'unaudited_client_can_only_post_to_private_accounts' } }), /perfil do TikTok em modo privado/);
  assert.match(tiktok.describeTikTokError(401, {}), /Conecte o perfil novamente/);
  assert.match(tiktok.describeTikTokError(400, { error: { code: 'spam_risk_too_many_posts' } }), /limite diário/);
});

test('publishing checks the creator options, uploads the file and waits for TikTok to finish', async () => {
  account = { id: 'tt', userId: 'u1', isActive: true, accessToken: encryptSecret('token'), tokenExpiresAt: new Date(Date.now() + 3600_000) };
  const video = Buffer.from('fake-mp4-bytes');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': video.length }); res.end(video); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const realFetch = global.fetch;
  const saved = { ...safeFetchPolicy };
  Object.assign(safeFetchPolicy, { allowPrivateNetworks: true, allowAnyPort: true });
  const calls = [];
  let statusChecks = 0;
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null, headers: init.headers });
    const path = String(url);
    if (path.includes('/creator_info/query/')) return new Response(JSON.stringify({ data: { creator_nickname: 'UX Move', creator_username: 'uxmove', privacy_level_options: ['SELF_ONLY'], comment_disabled: true, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 600 }, error: { code: 'ok' } }), { status: 200 });
    if (path.includes('/video/init/')) return new Response(JSON.stringify({ data: { publish_id: 'pub1', upload_url: 'https://upload.example.test/u' }, error: { code: 'ok' } }), { status: 200 });
    if (path === 'https://upload.example.test/u') return new Response('', { status: 201 });
    if (path.includes('/status/fetch/')) return new Response(JSON.stringify({ data: statusChecks++ ? { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7123] } : { status: 'PROCESSING_UPLOAD' }, error: { code: 'ok' } }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  try {
    const post = { caption: 'Legenda #teste', mediaUrls: [`http://127.0.0.1:${server.address().port}/v.mp4`], mediaType: 'REEL' };
    await assert.rejects(() => tiktok.publishTikTokVideo({ ...post, tiktokSettings: { privacyLevel: 'PUBLIC_TO_EVERYONE', consent: true } }, 'tt'), /não está disponível para este perfil/);
    const result = await tiktok.publishTikTokVideo({ ...post, tiktokSettings: { privacyLevel: 'SELF_ONLY', allowComment: true, allowDuet: true, consent: true } }, 'tt');
    const init = calls.find((call) => call.url.includes('/video/init/')).body;
    assert.deepEqual(init.post_info, { title: 'Legenda #teste', privacy_level: 'SELF_ONLY', disable_comment: true, disable_duet: false, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: false, is_aigc: false });
    assert.deepEqual(init.source_info, { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: video.length, total_chunk_count: 1 });
    const upload = calls.find((call) => call.url === 'https://upload.example.test/u');
    assert.equal(upload.headers['Content-Range'], `bytes 0-${video.length - 1}/${video.length}`);
    assert.equal(result.publishId, 'pub1');
    assert.equal(result.postId, '7123');
    assert.equal(result.url, 'https://www.tiktok.com/@uxmove/video/7123');
    assert.ok(result.warnings.some((warning) => /Só eu/.test(warning)));
  } finally {
    global.fetch = realFetch; Object.assign(safeFetchPolicy, saved); server.close();
  }
});

test('the report sums only the videos of the period and keeps missing counters empty', () => {
  const rows = [report.toVideoRow({ id: '1', title: 'A', create_time: 1761700000, view_count: 100, like_count: 10, comment_count: 2, share_count: 1 }), report.toVideoRow({ id: '2', create_time: 1761710000, view_count: 50 })];
  const summary = report.summarizeTikTokVideos(rows);
  assert.deepEqual(summary.totals, { videos: 2, views: 150, likes: 10, comments: 2, shares: 1 });
  assert.equal(summary.engagementRate, 13 / 150 * 100);
  assert.equal(rows[1].title, 'Vídeo sem legenda');
});
