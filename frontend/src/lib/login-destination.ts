/** Only an internal path may be used after sign-in; malformed input cannot break a successful login. */
export function loginDestination(next: string | null, origin: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(next)) return "/"
  try {
    const url = new URL(next, origin)
    if (url.origin !== origin || /^\/login(?:\/|$)/i.test(url.pathname)) return "/"
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return "/" }
}
