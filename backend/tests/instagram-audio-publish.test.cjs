const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const writes = [];
require.cache[require.resolve('../dist/config/env')] = { exports: { env: { MEDIA_PUBLIC_URL: 'https://media.example.test/uploads' } } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphPost: async (path, token, params) => { writes.push({ path, token, params }); return { id: 'container-1' }; },
  graphGet: async () => ({ status_code: 'FINISHED' }),
  graphDelete: async () => ({}),
} };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: {} };
require.cache[require.resolve('../dist/utils/errors')] = { exports: { ConflictError: class ConflictError extends Error {} } };
require.cache[require.resolve('../dist/services/instagram/facebook-link.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/post-readiness')] = { exports: { assertPostReady: () => {} } };
require.cache[require.resolve('../dist/utils/public-media')] = { exports: { normalizeMediaUrl: value => value } };

const { createMediaContainer } = require('../dist/services/instagram/publish.service');

beforeEach(() => { writes.length = 0; });

test('adds Instagram AI disclosure only when the user opted in', async () => {
  await createMediaContainer('ig-user', 'token', 'IMAGE', ['https://media.example.test/image.jpg'], 'Legenda', { isAiGenerated: true });
  assert.equal(writes[0].params.is_ai_generated, true);

  writes.length = 0;
  await createMediaContainer('ig-user', 'token', 'IMAGE', ['https://media.example.test/image.jpg'], 'Legenda');
  assert.equal(Object.hasOwn(writes[0].params, 'is_ai_generated'), false);
});

test('attaches the selected audio and volume mix only to Instagram Reels', async () => {
  await createMediaContainer('ig-user', 'token', 'REEL', ['https://media.example.test/reel.mp4'], 'Legenda', {
    audioId: '482851939985510', audioVolume: 75, videoVolume: 20,
  });

  assert.equal(writes[0].params.media_type, 'REELS');
  assert.deepEqual(JSON.parse(writes[0].params.audio_configuration), {
    audio_id: '482851939985510', audio_volume: 75, video_volume: 20,
  });

  writes.length = 0;
  await createMediaContainer('ig-user', 'token', 'IMAGE', ['https://media.example.test/image.jpg'], 'Legenda', {
    audioId: '482851939985510', audioVolume: 75, videoVolume: 20,
  });
  assert.equal(Object.hasOwn(writes[0].params, 'audio_configuration'), false);
});
