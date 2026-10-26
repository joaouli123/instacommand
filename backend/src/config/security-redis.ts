import Redis from 'ioredis';
import { env } from './env';

// Security checks cannot remain queued indefinitely like background jobs can.
export const securityRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1, enableOfflineQueue: false,
  connectTimeout: 2000, commandTimeout: 2500,
});
securityRedis.on('error', () => { /* Request handlers fail closed without logging credentials. */ });
