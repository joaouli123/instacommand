import express, { Router, type Response } from 'express';
import cors from 'cors';
import { oauthConsentPageUrl } from '../config/mcp';
import { rateLimit } from '../middleware/rateLimit';
import { RateLimitError } from '../utils/errors';
import {
  authenticateTokenClient, authorizationServerMetadata, beginAuthorization, exchangeAuthorizationCode,
  OAuthError, protectedResourceMetadata, refreshAccessToken, registerClient, revokeClientToken, signConsentRequest,
} from '../services/oauth.service';

// Public OAuth 2.1 authorization server for remote MCP clients (ChatGPT,
// Claude, Claude Code, Cursor...). Mounted before the credentialed CORS policy:
// these endpoints never use cookies, so any origin may call them.
const router = Router();
const publicCors = cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'MCP-Protocol-Version'], maxAge: 600 });

const noStore = (res: Response) => res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });

const sendOAuthError = (res: Response, error: unknown) => {
  noStore(res);
  if (error instanceof OAuthError) {
    if (error.code === 'invalid_client' && error.status === 401) res.set('WWW-Authenticate', 'Basic realm="InstaCommand OAuth"');
    return res.status(error.status).json({ error: error.code, error_description: error.description });
  }
  console.error('OAuth endpoint failed:', error instanceof Error ? error.message : error);
  return res.status(500).json({ error: 'server_error', error_description: 'Erro interno ao processar a autorização.' });
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

const errorPage = (message: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorização não concluída · InstaCommand</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:16px}main{max-width:440px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,.06)}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.55;color:#475569;margin:0}</style></head>
<body><main><h1>Não foi possível iniciar a autorização</h1><p>${escapeHtml(message)}</p><p style="margin-top:12px">Volte ao aplicativo (Claude, ChatGPT ou outro cliente MCP) e conecte o InstaCommand novamente.</p></main></body></html>`;

router.options(['/.well-known/*', '/oauth/register', '/oauth/token', '/oauth/revoke'], publicCors);

router.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp'], publicCors, (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300').json(authorizationServerMetadata());
});

// RFC 9728: the path-specific document is canonical for the `/mcp` resource;
// the root one serves clients that probe the origin first.
router.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], publicCors, (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300').json(protectedResourceMetadata());
});

router.post('/oauth/register', publicCors, rateLimit({ name: 'oauth-register', windowMs: 60 * 60_000, max: 30, byAddressOnly: true }),
  express.json({ limit: '32kb' }), async (req, res) => {
    try {
      noStore(res);
      res.status(201).json(await registerClient(req.body));
    } catch (error) {
      sendOAuthError(res, error);
    }
  });

router.get('/oauth/authorize', rateLimit({ name: 'oauth-authorize', windowMs: 60_000, max: 60, byAddressOnly: true }), async (req, res) => {
  try {
    const result = await beginAuthorization(req.query as Record<string, unknown>);
    noStore(res);
    if (result.kind === 'error') return res.status(400).type('html').send(errorPage(result.message));
    if (result.kind === 'redirect') return res.redirect(302, result.url);
    // The signed request carries everything the consent screen needs, so no
    // server-side session is required between the redirect and the decision.
    return res.redirect(302, `${oauthConsentPageUrl()}?request=${encodeURIComponent(signConsentRequest(result.request))}`);
  } catch (error) {
    console.error('OAuth authorize failed:', error instanceof Error ? error.message : error);
    return res.status(500).type('html').send(errorPage('Erro interno ao processar a autorização.'));
  }
});

const tokenBody = [express.urlencoded({ extended: false, limit: '16kb' }), express.json({ limit: '16kb' })];

router.post('/oauth/token', publicCors, rateLimit({ name: 'oauth-token', windowMs: 60_000, max: 120, byAddressOnly: true }), ...tokenBody, async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const client = await authenticateTokenClient({ headers: req.headers as Record<string, unknown>, body });
    const grantType = body.grant_type;
    let response;
    if (grantType === 'authorization_code') response = await exchangeAuthorizationCode(client, body);
    else if (grantType === 'refresh_token') response = await refreshAccessToken(client, body);
    else throw new OAuthError('unsupported_grant_type', 'Use authorization_code ou refresh_token.');
    noStore(res);
    return res.json(response);
  } catch (error) {
    return sendOAuthError(res, error);
  }
});

router.post('/oauth/revoke', publicCors, rateLimit({ name: 'oauth-revoke', windowMs: 60_000, max: 60, byAddressOnly: true }), ...tokenBody, async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const client = await authenticateTokenClient({ headers: req.headers as Record<string, unknown>, body });
    await revokeClientToken(client, body.token);
    noStore(res);
    return res.status(200).json({});
  } catch (error) {
    return sendOAuthError(res, error);
  }
});

// Body-parser and rate-limit failures inside this router answer in OAuth's
// error format instead of the API's generic 500.
router.use((error: any, _req: express.Request, res: Response, next: express.NextFunction) => {
  if (error instanceof RateLimitError) return sendOAuthError(res, new OAuthError('temporarily_unavailable', 'Muitas tentativas. Aguarde um pouco e tente novamente.', 429));
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large' || error?.status === 400 || error?.status === 413) {
    return sendOAuthError(res, new OAuthError('invalid_request', 'Corpo da requisição inválido.', error?.status === 413 ? 413 : 400));
  }
  return next(error);
});

export default router;
