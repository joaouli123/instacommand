// Older public addresses of the panel. Visitors there are sent to FRONTEND_URL,
// so sessions (host-only cookies) and OAuth returns always land on one host.
export const LEGACY_FRONTEND_HOSTS = [
  'instagram.uxcode.com.br',
  'www.instagram.uxcode.com.br',
  'instacommand.179.198.98.63.sslip.io',
  'www.uxgram.com.br',
]

/**
 * Canonical URL for a request on a legacy host, or null to serve it as is.
 * Unknown hosts (health checks on localhost, previews) are never redirected.
 */
export function canonicalRedirect(requestUrl: string, host: string | null, frontendUrl: string | undefined): string | null {
  if (!frontendUrl || !host) return null
  const canonical = new URL(frontendUrl)
  const hostname = host.toLowerCase().replace(/:\d+$/, '')
  if (hostname === canonical.hostname || !LEGACY_FRONTEND_HOSTS.includes(hostname)) return null
  const current = new URL(requestUrl)
  return `${canonical.origin}${current.pathname}${current.search}`
}
