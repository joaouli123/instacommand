import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { env } from '../config/env';

/** Only a server-side HMAC can carry the real address across the browser facade. */
export function verifiedBrowserAddress(req: Request, secret = env.BROWSER_PROXY_SECRET, now = Date.now()): string | null {
  if (!secret) return null;
  const address = req.get('x-instacommand-browser-ip');
  const time = req.get('x-instacommand-browser-time');
  const signature = req.get('x-instacommand-browser-signature');
  if (!address || !isIP(address) || !time || !/^\d{10}$/.test(time) || Math.abs(now / 1000 - Number(time)) > 30 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const expected = createHmac('sha256', secret).update(`${req.method}\n${req.originalUrl}\n${address}\n${time}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex')) ? address : null;
}
