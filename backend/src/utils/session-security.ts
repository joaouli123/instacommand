import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errors';

type SecurityStore = { get: (key: string) => Promise<string | null>; set: (key: string, value: string, expiry: 'EX', ttl: number) => Promise<unknown> };
// Tests/dev do not require a live service. Production always uses shared Redis.
const fixtures = new Map<string, number>();
const fixtureStore: SecurityStore = {
  get: async key => { const expiry = fixtures.get(key); if (!expiry || expiry <= Date.now()) { fixtures.delete(key); return null; } return '1'; },
  set: async (key, _value, _expiry, ttl) => { fixtures.set(key, Date.now() + ttl * 1000); return 'OK'; },
};
export const sessionRevocationKey = (token: string) => `session-revoked:${createHash('sha256').update(token).digest('hex')}`;

export async function securityCommand<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Security store unavailable')), 3000);
    })]);
  } catch {
    // Refuse access, not a silent local fallback that allows a revoked session.
    throw new AppError('Não foi possível validar a segurança da sessão. Tente novamente em instantes.', 503);
  } finally { if (timer) clearTimeout(timer); }
}

async function store(): Promise<SecurityStore> {
  if (env.NODE_ENV !== 'production') return fixtureStore;
  return (await import('../config/security-redis.js')).securityRedis;
}

/** Call only after JWT signature/expiry verification. No raw bearer enters Redis. */
export async function isSessionRevoked(token: string, injected?: SecurityStore): Promise<boolean> {
  return securityCommand(async () => (await (injected || await store()).get(sessionRevocationKey(token))) !== null);
}

export async function revokeSession(token: string, injected?: SecurityStore): Promise<void> {
  const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof claims === 'string' || typeof claims.exp !== 'number') throw new AppError('Sessão inválida.', 401);
  const ttl = Math.min(7 * 86400, Math.max(1, claims.exp - Math.floor(Date.now() / 1000)));
  await securityCommand(async () => { await (injected || await store()).set(sessionRevocationKey(token), '1', 'EX', ttl); });
}
