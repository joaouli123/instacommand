import { createHash } from 'node:crypto';

type Claims = { nonce?: unknown; exp?: unknown };
type NonceStore = { set: (key: string, value: string, expiry: 'EX', seconds: number, onlyIfAbsent: 'NX') => Promise<unknown> };

/** Call only after signature/purpose verification; consume atomically across replicas. */
export async function consumeOAuthNonce(claims: Claims, purpose: string, store?: NonceStore): Promise<boolean> {
  const ttl = typeof claims.exp === 'number' ? claims.exp - Math.floor(Date.now() / 1000) : 0;
  if (typeof claims.nonce !== 'string' || !/^[a-f0-9-]{36}$/i.test(claims.nonce) || !Number.isInteger(ttl) || ttl < 1 || ttl > 720) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const connection = store || (await import('../config/redis.js')).redisConnection;
    const digest = createHash('sha256').update(`${purpose}\0${claims.nonce}`).digest('hex');
    const result = await Promise.race([
      connection.set(`oauth-used:${digest}`, '1', 'EX', ttl, 'NX'),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 4000); }),
    ]);
    return result === 'OK';
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}
