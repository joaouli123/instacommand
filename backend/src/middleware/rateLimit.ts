import { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { RateLimitError } from '../utils/errors';

const store = new Map<string, { count: number; resetTime: number }>();
const MAX_BUCKETS = 20_000;
let lastSweep = 0;

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  // Separate limiters share one store, so each one needs its own namespace.
  name?: string;
  // Public OAuth endpoints are keyed by client address only, never by the
  // credentials a caller chooses to send.
  byAddressOnly?: boolean;
};

const defaultOptions = {
  windowMs: 15 * 60 * 1000,
  max: 300,
  name: 'api',
  byAddressOnly: false,
};

const clientAddress = (req: Request) => {
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
};

// Express interprets forwarding headers using the configured trusted proxy hop.
// Never pick an address directly from attacker-supplied X-Forwarded-For.
const proxiedClientAddress = (req: Request) => {
  return clientAddress(req);
};

const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);

const getClientKey = (req: Request) => {
  // Authenticated requests must not share a bucket just because they pass
  // through the same reverse proxy. Hash secrets before keeping them in
  // memory so the limiter never stores a raw bearer token or cookie.
  const authorization = req.get('authorization');
  if (authorization) return `auth:${fingerprint(authorization)}`;

  const sessionCookie = req.get('cookie')?.match(/(?:^|;\s*)instacommand_token=([^;]+)/)?.[1];
  if (sessionCookie) return `cookie:${fingerprint(sessionCookie)}`;

  return clientAddress(req);
};

export const rateLimit = (options: RateLimitOptions = {}) => {
  const config = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${config.name}:${config.byAddressOnly ? proxiedClientAddress(req) : getClientKey(req)}`;
    const now = Date.now();
    if (now - lastSweep > 60_000 || store.size >= MAX_BUCKETS) {
      for (const [bucket, entry] of store) if (entry.resetTime <= now) store.delete(bucket);
      lastSweep = now;
    }
    const record = store.get(key);

    if (!record || record.resetTime < now) {
      if (!record && store.size >= MAX_BUCKETS) return next(new RateLimitError('Muitas solicitações. Tente novamente em alguns minutos.'));
      store.set(key, { count: 1, resetTime: now + config.windowMs });
      return next();
    }

    if (record.count >= config.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((record.resetTime - now) / 1000))));
      return next(new RateLimitError('Too many requests from this client, please try again later.'));
    }

    record.count++;
    next();
  };
};
