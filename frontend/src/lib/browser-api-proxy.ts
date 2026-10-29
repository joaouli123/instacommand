import { BACKEND_ORIGIN } from './config';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

// This is a fixed upstream, never a URL supplied by a browser/query parameter.
type Settings = { backendOrigin: string; frontendOrigin: string; production: boolean; proxySecret?: string };
const defaults: Settings = {
  backendOrigin: process.env.BROWSER_API_UPSTREAM || BACKEND_ORIGIN,
  frontendOrigin: process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://instagram.uxcode.com.br' : 'http://localhost:3000'),
  production: process.env.NODE_ENV === 'production',
  proxySecret: process.env.BROWSER_PROXY_SECRET,
};
const SESSION_RESPONSES = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/oauth-session']);
const SESSION_LIFETIME = 7 * 24 * 60 * 60;

/** Same-origin BFF: browser JavaScript never receives the session bearer. */
export async function proxyBrowserApi(request: Request, fetcher: typeof fetch = fetch, settings: Settings = defaults): Promise<Response> {
  const url = new URL(request.url);
  const origin = new URL(settings.frontendOrigin).origin;
  const incomingOrigin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const read = ['GET', 'HEAD'].includes(request.method);
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  if ((incomingOrigin && incomingOrigin !== origin) || site === 'cross-site' || (!read && incomingOrigin !== origin)) {
    return fail(403, 'Origem da solicitação não permitida.');
  }
  // Callbacks/webhooks stay on their registered API host, not this browser facade.
  if (!url.pathname.startsWith('/api/') || /%(?:2f|5c|2e)|\\/i.test(url.pathname) || url.pathname.includes('//') ||
      /^\/api\/(?:webhooks(?:\/|$)|auth\/(?:facebook|threads|x|youtube)\/(?:callback|delete|uninstall)$)/.test(url.pathname)) {
    return fail(400, 'Endereço de API inválido.');
  }
  const headers = new Headers({ Origin: origin, Accept: request.headers.get('accept') || 'application/json' });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  // Do not forward arbitrary cookies, Authorization, Host, proxy or MCP trust headers.
  const cookieName = settings.production ? '__Host-instacommand_session' : 'instacommand_session';
  const cookies = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
  if (cookies.length > 1) return fail(401, 'Sessão inválida. Entre novamente.');
  if (cookies[0]) headers.set('Cookie', `instacommand_token=${cookies[0].slice(cookieName.length + 1)}`);
  // The frontend port is not published: Traefik supplies the final address.
  // Authenticate this hop independently so public API callers cannot forge an IP.
  const address = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (settings.proxySecret && address && isIP(address)) {
    const time = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', settings.proxySecret).update(`${request.method}\n${url.pathname}${url.search}\n${address}\n${time}`).digest('hex');
    headers.set('X-Instacommand-Browser-IP', address);
    headers.set('X-Instacommand-Browser-Time', time);
    headers.set('X-Instacommand-Browser-Signature', signature);
  }
  try {
    const upstream = await fetcher(`${settings.backendOrigin}${url.pathname}${url.search}`, {
      method: request.method, headers, body: read ? undefined : request.body,
      ...(!read && request.body ? { duplex: 'half' } : {}),
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    } as RequestInit);
    // Never follow a redirect that could receive cookies or replay a write.
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return fail(502, 'Redirecionamento inesperado da API. A operação não foi repetida.');
    }
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'" });
    for (const name of ['content-type', 'content-disposition', 'retry-after']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      if (!cookie.startsWith('instacommand_token=')) continue;
      const value = cookie.slice('instacommand_token='.length).split(';')[0];
      const age = cookie.match(/(?:^|;)\s*Max-Age=(\d+)/i);
      const clearing = !value || /Expires=Thu, 01 Jan 1970/i.test(cookie);
      const maxAge = clearing ? 0 : Math.min(age ? Number(age[1]) : SESSION_LIFETIME, SESSION_LIFETIME);
      responseHeaders.append('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${settings.production ? '; Secure' : ''}`);
    }
    let body: BodyInit | null = upstream.body;
    if (SESSION_RESPONSES.has(url.pathname.toLowerCase().replace(/\/+$/, ''))) {
      const result = await upstream.json() as Record<string, unknown>;
      delete result.token;
      body = JSON.stringify(result);
      responseHeaders.set('Content-Type', 'application/json');
    }
    return new Response(read && request.method === 'HEAD' ? null : body, { status: upstream.status, headers: responseHeaders });
  } catch {
    // Never print errors that may contain session cookies, URLs or request bodies.
    return fail(502, 'Não foi possível confirmar a resposta da API. Confira o resultado antes de tentar novamente.');
  }
}
