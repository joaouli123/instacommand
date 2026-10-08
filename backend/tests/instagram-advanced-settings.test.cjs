const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateInstagramAdvancedSettings } = require('../dist/services/instagram/advanced-settings');

test('normalizes valid collaborators and records positioned people tags', () => {
  const result = validateInstagramAdvancedSettings({
    altTexts: ['Descrição acessível'],
    collaborators: ['@Parceiro'],
    firstComment: '  Primeiro comentário  ',
    disableComments: false,
    userTags: [{ username: '@Pessoa', x: 0.2, y: 0.8, mediaIndex: 0 }],
  }, 'IMAGE', 1);

  assert.deepEqual(result, {
    altTexts: ['Descrição acessível'],
    collaborators: ['parceiro'],
    firstComment: 'Primeiro comentário',
    disableComments: false,
    userTags: [{ username: 'pessoa', x: 0.2, y: 0.8, mediaIndex: 0 }],
    locationId: null,
    locationName: null,
    shareToFeed: true,
    coverUrl: null,
    thumbOffset: null,
    trialGraduation: null,
  });
});

test('accepts a location by id or Facebook link on feed posts and Reels, never on Stories', () => {
  const byId = validateInstagramAdvancedSettings({ locationId: '110970792260960', locationName: ' Parque Ibirapuera ' }, 'IMAGE', 1);
  assert.equal(byId.locationId, '110970792260960');
  assert.equal(byId.locationName, 'Parque Ibirapuera');
  const byUrl = validateInstagramAdvancedSettings({ locationId: 'https://www.facebook.com/Parque-Ibirapuera-110970792260960/' }, 'REEL', 1);
  assert.equal(byUrl.locationId, '110970792260960');
  assert.equal(validateInstagramAdvancedSettings({ locationId: 'https://www.facebook.com/profile.php?id=123456789' }, 'CAROUSEL', 2).locationId, '123456789');
  assert.throws(() => validateInstagramAdvancedSettings({ locationId: '110970792260960' }, 'STORY', 1), /não em Stories/);
  assert.throws(() => validateInstagramAdvancedSettings({ locationId: 'Parque' }, 'IMAGE', 1), /Localização inválida/);
});

test('validates Reel-only options: feed sharing, cover, frame and trial reels', () => {
  const reel = validateInstagramAdvancedSettings({ shareToFeed: false, thumbOffset: 1500, trialGraduation: 'ss_performance' }, 'REEL', 1);
  assert.equal(reel.shareToFeed, false);
  assert.equal(reel.thumbOffset, 1500);
  assert.equal(reel.trialGraduation, 'SS_PERFORMANCE');
  assert.throws(() => validateInstagramAdvancedSettings({ shareToFeed: false }, 'IMAGE', 1), /só valem para Reels/);
  assert.throws(() => validateInstagramAdvancedSettings({ coverUrl: 'https://x.test/c.jpg' }, 'CAROUSEL', 2), /só valem para Reels/);
  assert.throws(() => validateInstagramAdvancedSettings({ trialGraduation: 'MANUAL' }, 'STORY', 1), /só valem para Reels/);
  assert.throws(() => validateInstagramAdvancedSettings({ coverUrl: 'https://x.test/c.jpg', thumbOffset: 10 }, 'REEL', 1), /não os dois/);
  assert.throws(() => validateInstagramAdvancedSettings({ coverUrl: 'ftp://x' }, 'REEL', 1), /link público/);
  assert.throws(() => validateInstagramAdvancedSettings({ thumbOffset: -1 }, 'REEL', 1), /milissegundos/);
  assert.throws(() => validateInstagramAdvancedSettings({ trialGraduation: 'SOMETIMES' }, 'REEL', 1), /MANUAL ou SS_PERFORMANCE/);
});

test('accepts collaborators on a carousel post', () => {
  const result = validateInstagramAdvancedSettings({ collaborators: ['@parceiro'] }, 'CAROUSEL', 2);
  assert.deepEqual(result.collaborators, ['parceiro']);
});

test('rejects unsupported story comment controls before publishing', () => {
  assert.throws(
    () => validateInstagramAdvancedSettings({ firstComment: 'Oi' }, 'STORY', 1),
    /não em Stories/,
  );
});

test('rejects a person tag with an invalid carousel item index or coordinates', () => {
  assert.throws(
    () => validateInstagramAdvancedSettings({ userTags: [{ username: 'pessoa', x: 1.2, y: 0.5, mediaIndex: 0 }] }, 'CAROUSEL', 2),
    /posição/,
  );
  assert.throws(
    () => validateInstagramAdvancedSettings({ userTags: [{ username: 'pessoa', x: 0.5, y: 0.5, mediaIndex: 2 }] }, 'CAROUSEL', 2),
    /posição/,
  );
});
