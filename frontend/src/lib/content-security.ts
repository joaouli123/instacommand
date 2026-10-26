/** Script nonces prevent injected inline scripts and event handlers from running. */
export function contentSecurityPolicy(nonce: string, backendOrigin: string, development = false) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error('Invalid script nonce');
  const backend = new URL(backendOrigin).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // Charts and existing components use inline style attributes, not inline scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "media-src 'self' https: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${backend}${development ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "frame-src 'none'",
    ...(!development ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
