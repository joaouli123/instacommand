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
  });
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
