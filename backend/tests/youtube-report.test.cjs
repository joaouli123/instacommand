const { test } = require('node:test');
const assert = require('node:assert/strict');

const env = {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!',
  GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret', YOUTUBE_REDIRECT_URI: 'https://api.example.test/api/auth/youtube/callback',
  GEMINI_MODEL: 'gemini', FRONTEND_URL: 'https://app.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads', BACKEND_URL: 'https://api.example.test',
};
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
let channel;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  youTubeAccount = {
    findFirst: async ({ where }) => (channel && channel.id === where.id && channel.userId === where.userId ? channel : null),
    findUnique: async () => channel,
    update: async ({ data }) => Object.assign(channel, data),
  };
} } };

const { encryptSecret } = require('../dist/services/instagram/auth.service');
const report = require('../dist/services/youtube-report.service');
const summary = require('../dist/services/company-summary');

test('YouTube durations and analytics tables are read the way Google sends them', () => {
  assert.equal(report.parseIsoDuration('PT1H2M3S'), 3723);
  assert.equal(report.parseIsoDuration('PT45S'), 45);
  assert.equal(report.parseIsoDuration('P1DT1M'), 86460);
  assert.equal(report.parseIsoDuration('nope'), null);
  assert.deepEqual(report.analyticsRows({ columnHeaders: [{ name: 'day' }, { name: 'views' }], rows: [['2026-10-01', 10], ['2026-10-02', 7]] }), [{ day: '2026-10-01', views: 10 }, { day: '2026-10-02', views: 7 }]);
  assert.deepEqual(report.analyticsRows(null), []);
  assert.deepEqual(report.summarizeVideos([{ views: 10, likes: null, comments: 2 }, { views: 5, likes: null, comments: 0 }]), { videos: 2, views: 15, likes: null, comments: 2 });
});

const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function withFetch(handler, run) {
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => { calls.push(String(url)); return handler(String(url)); };
  try { return await run(calls); } finally { global.fetch = realFetch; }
}

const now = Date.parse('2026-10-29T12:00:00Z');
const channelApi = (url) => {
  if (url.includes('/youtube/v3/channels')) return respond({ items: [{ snippet: { title: 'Lowfy', customUrl: '@lowfy' }, statistics: { subscriberCount: '693', viewCount: '10000', videoCount: '40' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
  if (url.includes('/youtube/v3/playlistItems')) return respond({ items: [
    { contentDetails: { videoId: 'new', videoPublishedAt: '2026-10-20T10:00:00Z' } },
    { contentDetails: { videoId: 'old', videoPublishedAt: '2026-08-01T10:00:00Z' } },
  ], nextPageToken: 'should-not-be-read' });
  if (url.includes('/youtube/v3/videos')) return respond({ items: [{ id: 'new', snippet: { title: 'Vídeo novo', publishedAt: '2026-10-20T10:00:00Z' }, statistics: { viewCount: '120', likeCount: '9', commentCount: '2' }, contentDetails: { duration: 'PT1M5S' } }] });
  return null;
};

test('without the analytics permission the report still brings the channel and the videos, and asks to reconnect', async () => {
  channel = { id: 'yt', userId: 'u1', isActive: true, channelId: 'UC1', title: 'Lowfy', accessToken: encryptSecret('token'), tokenExpiresAt: new Date(Date.now() + 3600_000), scopes: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly' };
  await withFetch((url) => channelApi(url) || respond({}, 404), async (calls) => {
    const body = await report.getYouTubeReport('u1', 'yt', 30, now);
    assert.equal(body.channel.subscribers, 693);
    assert.deepEqual(body.posts.map((video) => video.id), ['new']);
    assert.equal(body.posts[0].durationSeconds, 65);
    assert.deepEqual(body.totals, { videos: 1, views: 120, likes: 9, comments: 2 });
    assert.equal(body.analytics.available, false);
    assert.equal(body.analytics.reason, 'scope');
    assert.equal(calls.some((url) => url.includes('youtubeanalytics')), false);
    assert.equal(calls.filter((url) => url.includes('playlistItems')).length, 1, 'stops paging once uploads are older than the period');
  });
  assert.equal(await report.getYouTubeReport('someone-else', 'yt', 30, now), null);
});

test('with the analytics permission the report brings daily views, watch time, subscribers and the previous period', async () => {
  channel.scopes += ' https://www.googleapis.com/auth/yt-analytics.readonly';
  const analytics = (url) => {
    const query = new URL(url).searchParams;
    if (query.get('dimensions') === 'day') return respond({ columnHeaders: [{ name: 'day' }, { name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'subscribersGained' }, { name: 'subscribersLost' }], rows: [['2026-10-01', 50, 100, 3, 1]] });
    if (query.get('dimensions') === 'insightTrafficSourceType') return respond({ columnHeaders: [{ name: 'insightTrafficSourceType' }, { name: 'views' }], rows: [['YT_SEARCH', 30], ['SHORTS', 20]] });
    if (query.get('dimensions') === 'ageGroup,gender') return respond({ columnHeaders: [{ name: 'ageGroup' }, { name: 'gender' }, { name: 'viewerPercentage' }], rows: [['age25_34', 'male', 60]] });
    const previous = query.get('endDate') < '2026-09-30';
    return respond({ columnHeaders: ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'subscribersGained', 'subscribersLost', 'likes', 'comments', 'shares'].map((name) => ({ name })), rows: [previous ? [40, 80, 60, 2, 1, 4, 1, 0] : [50, 100, 70, 3, 1, 5, 2, 1]] });
  };
  await withFetch((url) => url.includes('youtubeanalytics') ? analytics(url) : channelApi(url) || respond({}, 404), async () => {
    const body = await report.getYouTubeReport('u1', 'yt', 30, now);
    assert.equal(body.analytics.available, true);
    assert.equal(body.analytics.totals.views, 50);
    assert.equal(body.analytics.daily[0].watchMinutes, 100);
    assert.deepEqual(body.analytics.trafficSources[0], { source: 'Busca do YouTube', views: 30 });
    assert.deepEqual(body.analytics.demographics[0], { age: '25–34', gender: 'Homens', percent: 60 });
    assert.equal(body.previous.views, 40);
    const card = summary.summarizeYouTube(body);
    assert.equal(card.audience, 693);
    assert.deepEqual(card.metrics.find((metric) => metric.key === 'subscribers'), { key: 'subscribers', label: 'Inscritos no período', value: 2, previous: 1 });
  });
});

test('company summary cards keep numbers the network did not give as empty instead of zero', () => {
  const threads = summary.summarizeThreads({ account: { id: 't', username: 'ux.move' }, metrics: { followers_count: { value: 10, available: true }, views: { value: null, available: false }, likes: { value: 3, available: true } }, previous: null });
  assert.equal(threads.audience, 10);
  assert.equal(threads.metrics.find((metric) => metric.key === 'views').value, null);
  assert.equal(threads.metrics.find((metric) => metric.key === 'reposts').value, null);
  const youtubeWithoutScope = summary.summarizeYouTube({ account: { id: 'y', title: 'Lowfy' }, channel: { subscribers: 5 }, totals: { videos: 1, views: 9, likes: null, comments: 0 }, analytics: { available: false, reason: 'scope', message: '' } });
  assert.match(youtubeWithoutScope.notice, /Reconecte o canal/);
  assert.equal(youtubeWithoutScope.metrics.find((metric) => metric.key === 'likes').value, null);
  assert.equal(summary.failedSummary('X', new Error('Cota acabou')).error, 'Cota acabou');
});
