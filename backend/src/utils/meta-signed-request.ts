import { createHmac, timingSafeEqual } from 'node:crypto';

/** Meta deauthorization/deletion callbacks are public, but never unsigned. */
export function verifyMetaSignedRequest(value: unknown, secret: string, now = Date.now()): string | null {
  if (typeof value !== 'string' || value.length > 8192 || !secret) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const received = Buffer.from(parts[0], 'base64url');
    const expected = createHmac('sha256', secret).update(parts[1]).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.algorithm !== 'HMAC-SHA256' || !Number.isInteger(payload.issued_at)) return null;
    const age = now / 1000 - payload.issued_at;
    if (age < -60 || age > 86400) return null;
    return typeof payload.user_id === 'string' && /^\d{1,40}$/.test(payload.user_id) ? payload.user_id : null;
  } catch { return null; }
}
