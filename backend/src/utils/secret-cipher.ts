import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const derive = (secret: string) => createHash('sha256').update(secret).digest();

/** The previous key is read-only and must be removed after migration. */
export function createSecretCipher(primary: string, previous?: string) {
  const key = derive(primary);
  const legacy = previous ? derive(previous) : key;
  const encrypt = (text: string) => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `gcm:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${bytes.toString('hex')}`;
  };
  const decryptCurrent = (text: string): string => {
    if (!text.startsWith('gcm:')) throw new Error('Legacy ciphertext');
    return decryptGcm(text, key);
  };
  const decrypt = (text: string): string => {
    if (text.startsWith('gcm:')) {
      try { return decryptGcm(text, key); }
      catch { if (previous) return decryptGcm(text, legacy); throw new Error('Segredo armazenado inválido.'); }
    }
    const [iv, bytes, extra] = text.split(':');
    if (extra !== undefined || !/^[a-f0-9]{32}$/i.test(iv || '') || !/^(?:[a-f0-9]{2})+$/i.test(bytes || '')) throw new Error('Segredo armazenado inválido.');
    const decipher = createDecipheriv('aes-256-cbc', legacy, Buffer.from(iv, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(bytes, 'hex')), decipher.final()]).toString('utf8');
  };
  return { encrypt, decrypt, decryptCurrent };
}

function decryptGcm(text: string, key: Buffer): string {
  const [, iv, tag, bytes, extra] = text.split(':');
  if (extra !== undefined || !/^[a-f0-9]{24}$/i.test(iv || '') || !/^[a-f0-9]{32}$/i.test(tag || '') || bytes === undefined || !/^(?:[a-f0-9]{2})*$/i.test(bytes)) throw new Error('Segredo armazenado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(bytes, 'hex')), decipher.final()]).toString('utf8');
}
