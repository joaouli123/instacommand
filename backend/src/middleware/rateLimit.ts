import { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { RateLimitError } from '../utils/errors';

const store = new Map<string, { count: number; resetTime: number }>();

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
};

const defaultOptions = {
  windowMs: 15 * 60 * 1000,
  max: 300,
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

  const forwardedFor = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `ip:${forwardedFor || req.ip || req.socket.remoteAddress || 'unknown'}`;
};

export const rateLimit = (options: RateLimitOptions = {}) => {
  const config = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const key = getClientKey(req);
    const now = Date.now();
    const record = store.get(key);

    if (!record || record.resetTime < now) {
      store.set(key, { count: 1, resetTime: now + config.windowMs });
      return next();
    }

    if (record.count >= config.max) {
      return next(new RateLimitError('Too many requests from this client, please try again later.'));
    }

    record.count++;
    next();
  };
};
