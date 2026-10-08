const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const calls = [];
let fail = false;
require.cache[require.resolve('../dist/config/env')] = { exports: { env: {} } };
require.cache[require.resolve('../dist/utils/instagram-api')] = { exports: {
  graphGet: async (path, token, params) => {
    calls.push({ path, params });
    if (fail) throw Object.assign(new Error('Meta Graph API request was rejected.'), { statusCode: 400 });
    if (path === '/pages/search') return { data: [
      { id: '1101', name: 'Parque Ibirapuera', location: { city: 'São Paulo', country: 'Brazil' }, verification_status: 'blue_verified' },
      { id: '1102', name: 'Página sem endereço' },
    ] };
    return { id: '1101', name: 'Parque Ibirapuera', location: { city: 'São Paulo' } };
  },
} };

const { searchInstagramLocations, clearLocationCache, UNAVAILABLE_MESSAGE } = require('../dist/services/instagram/locations.service');
const cli = require('../dist/cli/instacommand');

beforeEach(() => { calls.length = 0; fail = false; clearLocationCache(); });

test('searches Facebook pages with a location and caches the result', async () => {
  const first = await searchInstagramLocations('token', 'Ibirapuera');
  assert.deepEqual(first.items.map(item => item.id), ['1101']);
  assert.equal(first.items[0].city, 'São Paulo');
  assert.equal(first.items[0].verified, true);
  assert.equal(calls[0].path, '/pages/search');
  assert.match(calls[0].params.fields, /location\{city,state,country,street\}/);
  await searchInstagramLocations('token', 'ibirapuera ');
  assert.equal(calls.length, 1);
});

test('resolves a pasted page link directly', async () => {
  const result = await searchInstagramLocations('token', 'https://www.facebook.com/Parque-1101000/');
  assert.equal(calls[0].path, '/1101000');
  assert.equal(result.items[0].name, 'Parque Ibirapuera');
});

test('reports a clear Portuguese message (not an auth error) when Meta refuses the search', async () => {
  fail = true;
  const result = await searchInstagramLocations('token', 'Ibirapuera');
  assert.equal(result.unavailable, true);
  assert.equal(result.message, UNAVAILABLE_MESSAGE);
  fail = false;
  await searchInstagramLocations('token', 'Ibirapuera');
  assert.equal(calls.length, 2, 'failures are not cached');
});

test('CLI maps advanced flags and keeps existing options on update', async () => {
  const { flags } = cli.parseArgv(['--location', '1101', '--location-name', 'Parque', '--no-feed', '--thumb-offset', '1500',
    '--trial-reel', 'auto', '--tag', '@ana:0.2:0.3:1', '--collaborator', '@joao', '--alt-text', 'Foto', '--first-comment', 'Oi']);
  const result = await cli.advancedSettingsFromFlags(flags, { disableComments: true });
  assert.deepEqual(result, {
    disableComments: true,
    altTexts: ['Foto'],
    collaborators: ['joao'],
    firstComment: 'Oi',
    userTags: [{ username: 'ana', x: 0.2, y: 0.3, mediaIndex: 1 }],
    locationId: '1101',
    locationName: 'Parque',
    shareToFeed: false,
    thumbOffset: 1500,
    coverUrl: null,
    trialGraduation: 'SS_PERFORMANCE',
  });
  assert.equal(await cli.advancedSettingsFromFlags(cli.parseArgv([]).flags), undefined);
  const searched = await cli.advancedSettingsFromFlags(cli.parseArgv(['--location-search', 'Ibirapuera']).flags, null, async () => ({ id: '9', name: 'Ibira' }));
  assert.equal(searched.locationId, '9');
  assert.throws(() => cli.parseUserTag('@ana:meio'), /Marcação inválida/);
});
