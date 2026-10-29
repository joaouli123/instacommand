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
  youTubeAccount = { findUnique: async () => channel, update: async ({ data }) => Object.assign(channel, data) };
} } };
const { encryptSecret } = require('../dist/services/instagram/auth.service');
const youtube = require('../dist/services/youtube.service');

const withFetch = async (status, run) => {
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => { calls.push({ url: String(url), method: init.method }); return new Response(status === 204 ? null : JSON.stringify({ error: { message: 'Forbidden' } }), { status }); };
  try { await run(calls); } finally { global.fetch = realFetch; }
};

test('deleting a YouTube video needs the manage permission and calls videos.delete once', async () => {
  channel = { id: 'yt', isActive: true, accessToken: encryptSecret('token'), tokenExpiresAt: new Date(Date.now() + 3600_000), scopes: 'https://www.googleapis.com/auth/youtube.upload' };
  await assert.rejects(() => youtube.deleteYouTubeVideo('yt', '5aYQ5HBaU4w'), /Reconecte o canal/);
  channel.scopes += ' https://www.googleapis.com/auth/youtube.force-ssl';
  await assert.rejects(() => youtube.deleteYouTubeVideo('yt', 'bad id!'), /inválido/);
  await withFetch(204, async (calls) => {
    await youtube.deleteYouTubeVideo('yt', '5aYQ5HBaU4w');
    assert.deepEqual(calls, [{ url: 'https://www.googleapis.com/youtube/v3/videos?id=5aYQ5HBaU4w', method: 'DELETE' }]);
  });
  await withFetch(404, async () => { await youtube.deleteYouTubeVideo('yt', '5aYQ5HBaU4w'); });
  await withFetch(403, async () => { await assert.rejects(() => youtube.deleteYouTubeVideo('yt', '5aYQ5HBaU4w'), /YouTube recusou/); });
});
