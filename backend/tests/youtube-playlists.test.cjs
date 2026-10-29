const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const env = {
  ENCRYPTION_KEY: 'test-only-encryption-key-32-characters', JWT_SECRET: 'test-only-jwt-secret-with-32-characters!!',
  GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret', YOUTUBE_REDIRECT_URI: 'https://api.example.test/api/auth/youtube/callback',
  GEMINI_MODEL: 'gemini', FRONTEND_URL: 'https://app.example.test', MEDIA_PUBLIC_URL: 'https://api.example.test/uploads', BACKEND_URL: 'https://api.example.test',
};
require.cache[require.resolve('../dist/config/env')] = { exports: { env } };
let channel;
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  youTubeAccount = { findUnique: async () => channel, update: async ({ data }) => Object.assign(channel, data) };
} } };
const { encryptSecret } = require('../dist/services/instagram/auth.service');
const { safeFetchPolicy } = require('../dist/utils/safe-fetch');
const youtube = require('../dist/services/youtube.service');
const { validateYouTubeSettings } = require('../dist/services/youtube-settings');

test('playlist choices are validated: real ids, at most 10, and a named new playlist', () => {
  const base = { title: 'Vídeo', madeForKids: false };
  assert.deepEqual(validateYouTubeSettings({ ...base, playlistIds: ['PLabcdefghij', 'PLabcdefghij'] }).playlistIds, ['PLabcdefghij']);
  assert.throws(() => validateYouTubeSettings({ ...base, playlistIds: ['x'] }), /Playlist do YouTube inválida/);
  assert.throws(() => validateYouTubeSettings({ ...base, playlistIds: Array.from({ length: 11 }, (_, i) => `PLplaylist${String(i).padStart(4, '0')}`) }), /até 10/);
  assert.equal(validateYouTubeSettings({ ...base, newPlaylist: { title: '   ' } }).newPlaylist, null);
  assert.deepEqual(validateYouTubeSettings({ ...base, newPlaylist: { title: ' Bastidores ', privacyStatus: 'unlisted' } }).newPlaylist, { title: 'Bastidores', privacyStatus: 'unlisted' });
  assert.throws(() => validateYouTubeSettings({ ...base, newPlaylist: { title: 'a <b>' } }), /150 caracteres/);
});

async function publishWith(scopes, settings) {
  channel = { id: 'ch', isActive: true, accessToken: encryptSecret('token'), tokenExpiresAt: new Date(Date.now() + 3600_000), scopes };
  const video = Buffer.from('fake-mp4');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': video.length }); res.end(video); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const realFetch = global.fetch;
  const saved = { ...safeFetchPolicy };
  Object.assign(safeFetchPolicy, { allowPrivateNetworks: true, allowAnyPort: true });
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? String(init.body) : '' });
    if (String(url).includes('/upload/youtube/v3/videos')) return new Response('', { status: 200, headers: { location: 'https://upload.example.test/s' } });
    if (String(url) === 'https://upload.example.test/s') return new Response(JSON.stringify({ id: 'vid1', status: { privacyStatus: 'private' } }), { status: 200 });
    if (String(url).includes('/youtube/v3/playlists?')) return new Response(JSON.stringify({ id: 'PLnewone12345' }), { status: 200 });
    if (String(url).includes('/youtube/v3/playlistItems')) return JSON.parse(init.body).snippet.playlistId === 'PLbroken12345' ? new Response(JSON.stringify({ error: { message: 'Playlist not found' } }), { status: 404 }) : new Response(JSON.stringify({ id: 'item' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  try {
    const result = await youtube.publishYouTubeVideo({ caption: 'x', mediaUrls: [`http://127.0.0.1:${server.address().port}/v.mp4`], mediaType: 'REEL', youtubeSettings: { title: 'Vídeo', madeForKids: false, privacyStatus: 'private', ...settings } }, 'ch');
    return { result, calls };
  } finally { global.fetch = realFetch; Object.assign(safeFetchPolicy, saved); server.close(); }
}

test('after publishing, the video goes into the chosen playlists and the new one; failures only warn', async () => {
  const { result, calls } = await publishWith('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl', { playlistIds: ['PLexisting123', 'PLbroken12345'], newPlaylist: { title: 'Lançamentos', privacyStatus: 'public' } });
  assert.equal(result.id, 'vid1');
  const created = calls.find((call) => call.url.includes('/youtube/v3/playlists?'));
  assert.deepEqual(JSON.parse(created.body), { snippet: { title: 'Lançamentos' }, status: { privacyStatus: 'public' } });
  const added = calls.filter((call) => call.url.includes('/playlistItems')).map((call) => JSON.parse(call.body).snippet);
  assert.deepEqual(added.map((item) => item.playlistId), ['PLexisting123', 'PLbroken12345', 'PLnewone12345']);
  assert.deepEqual(added[0].resourceId, { kind: 'youtube#video', videoId: 'vid1' });
  assert.equal(result.warnings.filter((warning) => /não entrou em uma das playlists/.test(warning)).length, 1);
});

test('without the manage permission the video is published and the playlists only produce a reconnect warning', async () => {
  const { result, calls } = await publishWith('https://www.googleapis.com/auth/youtube.upload', { playlistIds: ['PLexisting123'] });
  assert.equal(result.id, 'vid1');
  assert.equal(calls.some((call) => call.url.includes('playlist')), false);
  assert.ok(result.warnings.some((warning) => /reconecte o canal/.test(warning)));
});
