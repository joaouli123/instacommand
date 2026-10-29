const { test } = require('node:test');
const assert = require('node:assert/strict');

const env = {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!',
  GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret', YOUTUBE_REDIRECT_URI: 'https://api.example.test/api/auth/youtube/callback',
  GEMINI_MODEL: 'gemini', FRONTEND_URL: 'https://app.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads', BACKEND_URL: 'https://api.example.test',
};
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
let companies = [], channels = [], competitors = [], snapshots = [];
const matches = (row, where) => Object.entries(where).every(([key, value]) => key === 'account' ? companies.some((c) => c.id === row.accountId && c.userId === value.userId) : row[key] === value);
require.cache[require.resolve('@prisma/client')] = { exports: { Prisma: {}, PrismaClient: class {
  instagramAccount = { findFirst: async ({ where }) => companies.find((row) => matches(row, where)) || null };
  youTubeAccount = { findFirst: async ({ where }) => channels.find((row) => matches(row, where)) || null, findUnique: async ({ where }) => channels.find((row) => row.id === where.id) || null, update: async () => null };
  youTubeCompetitor = {
    count: async ({ where }) => competitors.filter((row) => row.accountId === where.accountId).length,
    findUnique: async ({ where }) => competitors.find((row) => row.accountId === where.accountId_channelId.accountId && row.channelId === where.accountId_channelId.channelId) || null,
    findFirst: async ({ where }) => competitors.find((row) => matches(row, where)) || null,
    create: async ({ data }) => { const row = { id: `c${competitors.length + 1}`, ...data }; competitors.push(row); return row; },
    update: async ({ where, data }) => Object.assign(competitors.find((row) => row.id === where.id), data),
    delete: async ({ where }) => { competitors = competitors.filter((row) => row.id !== where.id); },
  };
  youTubeCompetitorSnapshot = { create: async ({ data }) => { snapshots.push(data); return data; } };
} } };

const { encryptSecret } = require('../dist/services/instagram/auth.service');
const research = require('../dist/services/youtube-research.service');

test('a competitor channel can be given as @handle, channel link, /channel/ link or UC id', () => {
  assert.deepEqual(research.parseChannelInput('@MrBeast'), { forHandle: '@MrBeast' });
  assert.deepEqual(research.parseChannelInput('mrbeast'), { forHandle: '@mrbeast' });
  assert.deepEqual(research.parseChannelInput('https://www.youtube.com/@canal.br/videos'), { forHandle: '@canal.br' });
  assert.deepEqual(research.parseChannelInput('youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA'), { id: 'UCX6OQ3DkcsbYNE6H8uQQuVA' });
  assert.deepEqual(research.parseChannelInput('UCX6OQ3DkcsbYNE6H8uQQuVA'), { id: 'UCX6OQ3DkcsbYNE6H8uQQuVA' });
  assert.throws(() => research.parseChannelInput('  '), /Informe/);
  assert.throws(() => research.parseChannelInput('a b c d'), /Não reconheci/);
});

test('channel averages come from the latest videos; hidden counters do not count as zero', () => {
  const now = Date.parse('2026-10-29T00:00:00Z');
  const metrics = research.channelMetrics([
    { views: 1000, likes: 50, comments: 10, publishedAt: '2026-10-28T00:00:00Z' },
    { views: 500, likes: null, comments: 5, publishedAt: '2026-10-15T00:00:00Z' },
  ], now);
  assert.equal(metrics.avgViews, 750);
  assert.equal(metrics.avgLikes, 50);
  assert.equal(metrics.engagementRate, 65 / 1500 * 100);
  assert.equal(metrics.uploadsPerWeek, 2 / 2);
  assert.equal(research.channelMetrics([]).avgViews, null);
});

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const respond = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('research needs the selected company own channel and never uses another company channel', async () => {
  companies = [{ id: COMPANY, userId: 'u1', isActive: true }, { id: OTHER, userId: 'u1', isActive: true }];
  channels = [{ id: 'yt-other', userId: 'u1', isActive: true, workspaceAccountId: OTHER, channelId: 'UCother', accessToken: encryptSecret('t'), tokenExpiresAt: new Date(Date.now() + 3600_000), connectedAt: new Date() }];
  await assert.rejects(() => research.addYouTubeCompetitor('u1', COMPANY, '@rival'), /Conecte ou vincule o canal do YouTube desta empresa/);
  await assert.rejects(() => research.youtubeTrends('u1', COMPANY, {}), /Conecte ou vincule/);
  await assert.rejects(() => research.addYouTubeCompetitor('someone-else', COMPANY, '@rival'), /Empresa não encontrada/);
});

test('adding a competitor stores the channel and a first snapshot; the company channel and duplicates are refused', async () => {
  channels.push({ id: 'yt-own', userId: 'u1', isActive: true, workspaceAccountId: COMPANY, channelId: 'UCown', accessToken: encryptSecret('t'), tokenExpiresAt: new Date(Date.now() + 3600_000), connectedAt: new Date() });
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    const query = new URL(String(url)).searchParams;
    if (String(url).includes('/channels')) return respond({ items: [{ id: query.get('forHandle') === '@own' ? 'UCown' : 'UCrival', snippet: { title: 'Rival', customUrl: '@rival' }, statistics: { subscriberCount: '1200', viewCount: '50000', videoCount: '80' }, contentDetails: { relatedPlaylists: { uploads: 'UUrival' } } }] });
    if (String(url).includes('/playlistItems')) return respond({ items: [{ contentDetails: { videoId: 'v1' } }] });
    if (String(url).includes('/videos')) return respond({ items: [{ id: 'v1', snippet: { title: 'Vídeo', channelTitle: 'Rival', publishedAt: '2026-10-20T00:00:00Z' }, statistics: { viewCount: '300', likeCount: '30', commentCount: '3' }, contentDetails: { duration: 'PT2M' } }] });
    return new Response('{}', { status: 404 });
  };
  try {
    const competitor = await research.addYouTubeCompetitor('u1', COMPANY, 'https://youtube.com/@rival');
    assert.equal(competitor.channelId, 'UCrival');
    assert.equal(competitors[0].subscribers, 1200);
    assert.equal(snapshots[0].avgViews, 300);
    assert.ok(calls[0].includes('forHandle=%40rival'));
    await assert.rejects(() => research.addYouTubeCompetitor('u1', COMPANY, '@rival'), /já está na lista/);
    await assert.rejects(() => research.addYouTubeCompetitor('u1', COMPANY, '@own'), /canal da própria empresa/);
    await assert.rejects(() => research.removeYouTubeCompetitor('someone-else', competitor.id), /não encontrado/);
    await research.removeYouTubeCompetitor('u1', competitor.id);
    assert.equal(competitors.length, 0);
  } finally { global.fetch = realFetch; }
});
