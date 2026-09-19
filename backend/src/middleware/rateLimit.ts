import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/errors';

// Simple in-memory rate limiter
const store = new Map<string, { count: number; resetTime: number }>();

export const rateLimit = (
  options = { windowMs: 15 * 60 * 1000, max: 100 }
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = store.get(key);

    if (!record || record.resetTime < now) {
      store.set(key, { count: 1, resetTime: now + options.windowMs });
      return next();
    }

    if (record.count >= options.max) {
      return next(new RateLimitError('Too many requests from this IP, please try again later.'));
    }

    record.count++;
    next();
  };
};
