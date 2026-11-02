const { test } = require('node:test');
const assert = require('node:assert/strict');

let statuses = [];
require.cache[require.resolve('../dist/config/env')] = { exports: { env: { MEDIA_PUBLIC_URL: 'https://media.example.test/uploads' } } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphPost: async () => ({ id: 'c1' }), graphGet: async () => statuses.shift() || { status_code: 'IN_PROGRESS' }, graphDelete: async () => ({}),
} };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {} } };
require.cache[require.resolve('../dist/services/instagram/auth.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: {} };
require.cache[require.resolve('../dist/utils/errors')] = { exports: { ConflictError: class ConflictError extends Error {} } };
require.cache[require.resolve('../dist/services/instagram/facebook-link.service')] = { exports: {} };
require.cache[require.resolve('../dist/services/post-readiness')] = { exports: { assertPostReady: () => {} } };
require.cache[require.resolve('../dist/utils/public-media')] = { exports: { normalizeMediaUrl: value => value } };
const { waitForContainer } = require('../dist/services/instagram/publish.service');

test('a slow video keeps waiting until Instagram finishes it', async () => {
  statuses = [{ status_code: 'IN_PROGRESS' }, { status_code: 'IN_PROGRESS' }, { status_code: 'IN_PROGRESS' }, { status_code: 'FINISHED' }];
  await waitForContainer('c1', 't', true, [1, 1, 1, 1, 1]);
  assert.equal(statuses.length, 0);
});

test('a refused container shows Instagram\'s reason', async () => {
  statuses = [{ status_code: 'ERROR', status: 'Error: Media upload has failed with error code 2207026' }];
  await assert.rejects(waitForContainer('c1', 't', true, [1]), /recusou a mídia: Error: Media upload has failed with error code 2207026/);
});

test('a timeout says the video is still processing, not that it failed', async () => {
  statuses = [];
  await assert.rejects(waitForContainer('c1', 't', true, [1, 1]), /ainda está processando o vídeo/);
});

