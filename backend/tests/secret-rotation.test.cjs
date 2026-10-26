const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSecretCipher } = require('../dist/utils/secret-cipher');
const old = 'fixture-only-old-key-at-least32characters';
const current = 'fixture-only-new-key-at-least32characters';
const legacy = (value) => {
  const iv = crypto.randomBytes(16), cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(old).digest(), iv);
  return `${iv.toString('hex')}:${Buffer.concat([cipher.update(value), cipher.final()]).toString('hex')}`;
};
test('keyring reads old CBC/GCM but only writes authenticated primary ciphertext', () => {
  const keyring = createSecretCipher(current, old), fresh = createSecretCipher(current);
  for (const value of [legacy('fixture-token'), createSecretCipher(old).encrypt('fixture-token')]) {
    assert.equal(keyring.decrypt(value), 'fixture-token');
    assert.throws(() => keyring.decryptCurrent(value));
    const migrated = keyring.encrypt(keyring.decrypt(value));
    assert.equal(fresh.decrypt(migrated), 'fixture-token');
    assert.throws(() => createSecretCipher(old).decrypt(migrated));
  }
});
test('tampering and malformed encrypted envelopes cannot fall back to plaintext', () => {
  const keyring = createSecretCipher(current, old);
  for (const value of ['plain-secret', 'gcm:a:b:c', '00:00:extra', 'gcm:000000000000000000000000:00000000000000000000000000000000:00']) assert.throws(() => keyring.decrypt(value));
});
