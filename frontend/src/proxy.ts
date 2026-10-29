import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { BACKEND_ORIGIN } from './lib/config';
import { contentSecurityPolicy } from './lib/content-security';
import { canonicalRedirect } from './lib/canonical-host';

export function proxy(request: NextRequest) {
  const redirect = process.env.NODE_ENV === 'production'
    ? canonicalRedirect(request.url, request.headers.get('x-forwarded-host') || request.headers.get('host'), process.env.FRONTEND_URL)
    : null;
  if (redirect) return NextResponse.redirect(redirect, 308);
  const nonce = randomBytes(24).toString('base64');
  const policy = contentSecurityPolicy(nonce, BACKEND_ORIGIN, process.env.NODE_ENV !== 'production');
  const headers = new Headers(request.headers);
  // Replace untrusted values, never trust a client-supplied nonce/CSP.
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'] };
