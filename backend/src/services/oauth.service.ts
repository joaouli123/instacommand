import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient, type OAuthClient } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env';
import { isMcpResource, mcpResourceUrl, normalizeResource, oauthIssuer } from '../config/mcp';
import { API_SCOPE_DETAILS, API_SCOPES, isApiScope, normalizeScopes, type ApiScope } from './api-scopes';
import { generateSecret, hashSecret, safeEqualHex, tokenDisplayPrefix } from './api-tokens.service';
import { readLimitedBody, safeGet } from '../utils/safe-fetch';

const prisma = new PrismaClient();

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const CONSENT_REQUEST_TTL = '15m';
const CIMD_CACHE_MS = 60 * 60_000;
const CIMD_MAX_BYTES = 64 * 1024;
export const DEFAULT_OAUTH_SCOPES: ApiScope[] = ['read', 'write', 'publish'];

/** An OAuth protocol error, rendered as `{ error, error_description }`. */
export class OAuthError extends Error {
  constructor(public code: string, public description: string, public status = 400) {
    super(description);
  }
}

// ---------------------------------------------------------------- redirect URIs

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const FORBIDDEN_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'blob:', 'filesystem:', 'view-source:', 'ws:', 'wss:', 'ftp:']);

export const isLoopbackRedirect = (url: URL) => url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);

/** Accepts HTTPS, HTTP loopback (RFC 8252 §7.3) and private-use schemes of native apps (§7.1). */
export function parseRedirectUri(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw || raw.length > 1000 || raw.includes('#')) {
    throw new OAuthError('invalid_redirect_uri', 'Endereço de retorno inválido.');
  }
  let url: URL;
  try { url = new URL(raw); } catch { throw new OAuthError('invalid_redirect_uri', 'Endereço de retorno inválido.'); }
  if (url.username || url.password) throw new OAuthError('invalid_redirect_uri', 'O endereço de retorno não pode conter credenciais.');
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:') {
    if (isLoopbackRedirect(url)) return url;
    throw new OAuthError('invalid_redirect_uri', 'Use HTTPS no endereço de retorno (HTTP só é aceito em localhost).');
  }
  if (!/^[a-z][a-z0-9+.-]*:$/.test(url.protocol) || FORBIDDEN_SCHEMES.has(url.protocol)) {
    throw new OAuthError('invalid_redirect_uri', 'Esquema de endereço de retorno não permitido.');
  }
  return url;
}

/** Exact match, except loopback redirects whose port varies per session (RFC 8252 §7.3). */
export function redirectUriMatches(registered: string, requested: string) {
  if (registered === requested) return true;
  try {
    const a = new URL(registered);
    const b = new URL(requested);
    return isLoopbackRedirect(a) && isLoopbackRedirect(b) && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

export const findRegisteredRedirect = (client: Pick<OAuthClient, 'redirectUris'>, requested: unknown) => {
  if (requested === undefined && client.redirectUris.length === 1 && !isLoopbackRedirect(new URL(client.redirectUris[0]))) return client.redirectUris[0];
  if (typeof requested !== 'string') return null;
  return client.redirectUris.some((registered) => redirectUriMatches(registered, requested)) ? requested : null;
};

// ---------------------------------------------------------------- PKCE & scopes

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;
export const isValidCodeChallenge = (value: unknown): value is string => typeof value === 'string' && PKCE_CHALLENGE.test(value);
export const pkceChallengeFor = (verifier: string) => createHash('sha256').update(verifier, 'ascii').digest('base64url');
export const verifyPkce = (verifier: unknown, challenge: string) => {
  if (typeof verifier !== 'string' || !PKCE_VERIFIER.test(verifier)) return false;
  const expected = Buffer.from(challenge);
  const actual = Buffer.from(pkceChallengeFor(verifier));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/** Unknown scopes and `offline_access` (refresh tokens are always issued) are ignored. */
export const parseScopeParam = (raw: unknown): ApiScope[] => normalizeScopes(typeof raw === 'string' ? raw.split(/\s+/).filter(isApiScope) : []);

// ---------------------------------------------------------------- client registration (RFC 7591)

const registrationSchema = z.object({
  redirect_uris: z.array(z.unknown()).min(1).max(10),
  client_name: z.string().trim().max(200).optional(),
  client_uri: z.string().max(500).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
}).passthrough();

const SUPPORTED_AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'];

const optionalHttpsUri = (value: unknown) => {
  if (typeof value !== 'string') return null;
  try { return new URL(value).protocol === 'https:' ? value : null; } catch { return null; }
};

export async function registerClient(raw: unknown, now = new Date()) {
  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) throw new OAuthError('invalid_client_metadata', 'Metadados do cliente inválidos: informe redirect_uris.');
  const input = parsed.data;
  // Keep the exact strings the client registered; parsing only validates them.
  const redirectUris = [...new Set(input.redirect_uris.map((uri) => { parseRedirectUri(uri); return uri as string; }))];
  const authMethod = input.token_endpoint_auth_method ?? 'none';
  if (!SUPPORTED_AUTH_METHODS.includes(authMethod)) throw new OAuthError('invalid_client_metadata', `token_endpoint_auth_method não suportado: ${authMethod}.`);
  const grantTypes = input.grant_types ?? ['authorization_code', 'refresh_token'];
  if (!grantTypes.length || grantTypes.some((grant) => !['authorization_code', 'refresh_token'].includes(grant))) {
    throw new OAuthError('invalid_client_metadata', 'Somente authorization_code e refresh_token são suportados.');
  }
  const responseTypes = input.response_types ?? ['code'];
  if (responseTypes.some((type) => type !== 'code')) throw new OAuthError('invalid_client_metadata', 'Somente response_type=code é suportado.');

  const clientId = `icc_${randomBytes(18).toString('base64url')}`;
  const secret = authMethod === 'none' ? null : `ics_${randomBytes(32).toString('base64url')}`;
  const clientName = input.client_name?.trim() || 'Cliente MCP';

  // Abandoned dynamic registrations (no token ever issued) are pruned lazily.
  prisma.oAuthClient.deleteMany({
    where: { registrationType: 'DCR', createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) }, tokens: { none: {} }, codes: { none: {} } },
  }).catch(() => undefined);

  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash: secret ? hashSecret(secret) : null,
      clientName,
      clientUri: optionalHttpsUri(input.client_uri),
      redirectUris,
      tokenEndpointAuthMethod: authMethod,
      registrationType: 'DCR',
    },
  });

  return {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: client.clientName,
    ...(client.clientUri ? { client_uri: client.clientUri } : {}),
    redirect_uris: client.redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
  };
}

// ---------------------------------------------------------------- Client ID Metadata Documents

const cimdSchema = z.object({
  client_id: z.string(),
  redirect_uris: z.array(z.unknown()).min(1).max(20),
  client_name: z.string().max(200).optional(),
  client_uri: z.string().max(500).optional(),
  token_endpoint_auth_method: z.string().optional(),
}).passthrough();

export const isClientMetadataDocumentId = (clientId: string) => clientId.startsWith('https://');

/** Test seam: replaced in tests so CIMD resolution never needs the network. */
export const cimdFetcher = {
  async fetch(url: string): Promise<unknown> {
    const { response, abort } = await safeGet(url, { allowHttp: false, maxRedirects: 0, timeoutMs: 5_000, headers: { Accept: 'application/json' } });
    // `timeoutMs` is an idle timeout; a slow drip must not hold the request open.
    const deadline = setTimeout(() => response.destroy(new OAuthError('invalid_client', 'O documento do cliente demorou demais para responder.')), 8_000);
    try {
      if (response.statusCode !== 200) {
        response.resume();
        throw new OAuthError('invalid_client', `O documento do cliente respondeu com status ${response.statusCode}.`);
      }
      return JSON.parse((await readLimitedBody(response, CIMD_MAX_BYTES)).toString('utf8'));
    } finally {
      clearTimeout(deadline);
      abort();
    }
  },
};

async function resolveMetadataDocumentClient(clientId: string, now: Date) {
  let url: URL;
  try { url = new URL(clientId); } catch { throw new OAuthError('invalid_client', 'client_id inválido.'); }
  if (url.protocol !== 'https:' || url.hash || url.username || url.password || url.pathname === '/' || clientId.length > 500) {
    throw new OAuthError('invalid_client', 'client_id de documento de metadados inválido.');
  }
  const cached = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (cached && cached.registrationType === 'CIMD' && cached.metadataFetchedAt && now.getTime() - cached.metadataFetchedAt.getTime() < CIMD_CACHE_MS) return cached;

  let document: unknown;
  try {
    document = await cimdFetcher.fetch(clientId);
  } catch (error) {
    if (error instanceof OAuthError) throw error;
    throw new OAuthError('invalid_client', 'Não foi possível obter o documento de metadados do cliente.');
  }
  const parsed = cimdSchema.safeParse(document);
  if (!parsed.success || parsed.data.client_id !== clientId) throw new OAuthError('invalid_client', 'O documento de metadados do cliente é inválido.');
  const method = parsed.data.token_endpoint_auth_method;
  // Metadata-document clients are public clients; shared secrets are not allowed (they would be published).
  if (method && !['none', 'private_key_jwt'].includes(method)) throw new OAuthError('invalid_client', 'Método de autenticação do cliente não suportado.');
  const redirectUris = parsed.data.redirect_uris.map((uri) => { parseRedirectUri(uri); return uri as string; });
  const data = {
    clientName: parsed.data.client_name?.trim().slice(0, 200) || url.hostname,
    clientUri: optionalHttpsUri(parsed.data.client_uri),
    redirectUris,
    tokenEndpointAuthMethod: 'none',
    registrationType: 'CIMD',
    metadataFetchedAt: now,
  };
  return prisma.oAuthClient.upsert({ where: { clientId }, update: data, create: { clientId, ...data } });
}

export async function resolveClient(clientId: unknown, now = new Date()) {
  if (typeof clientId !== 'string' || !clientId || clientId.length > 500) throw new OAuthError('invalid_client', 'client_id ausente ou inválido.');
  if (isClientMetadataDocumentId(clientId)) return resolveMetadataDocumentClient(clientId, now);
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client || client.registrationType !== 'DCR') throw new OAuthError('invalid_client', 'Aplicativo não registrado. Conecte-o novamente pelo cliente MCP.');
  return client;
}

// ---------------------------------------------------------------- authorization requests

// Consent requests are signed with a key derived from JWT_SECRET, so they can
// never be confused with a session token or any other JWT of this app.
const consentKey = () => createHmac('sha256', env.JWT_SECRET).update('instacommand:oauth-consent:v1').digest();
const CONSENT_AUDIENCE = 'instacommand-oauth-consent';

export type ConsentRequest = {
  cid: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: ApiScope[];
  resource: string;
  state?: string;
};

export const signConsentRequest = (request: ConsentRequest) => jwt.sign({ typ: 'oauth_consent', ...request }, consentKey(), {
  expiresIn: CONSENT_REQUEST_TTL, audience: CONSENT_AUDIENCE, issuer: oauthIssuer(),
});

export function verifyConsentRequest(token: unknown): ConsentRequest {
  if (typeof token !== 'string' || token.length > 8000) throw new OAuthError('invalid_request', 'Pedido de autorização inválido.');
  try {
    const payload = jwt.verify(token, consentKey(), { audience: CONSENT_AUDIENCE, issuer: oauthIssuer() }) as Record<string, unknown>;
    if (payload.typ !== 'oauth_consent' || typeof payload.cid !== 'string' || typeof payload.redirectUri !== 'string'
      || typeof payload.codeChallenge !== 'string' || typeof payload.resource !== 'string' || !Array.isArray(payload.scopes)) {
      throw new Error('shape');
    }
    return {
      cid: payload.cid,
      clientId: String(payload.clientId),
      redirectUri: payload.redirectUri,
      codeChallenge: payload.codeChallenge,
      scopes: normalizeScopes(payload.scopes),
      resource: payload.resource,
      state: typeof payload.state === 'string' ? payload.state : undefined,
    };
  } catch {
    throw new OAuthError('invalid_request', 'Este pedido de autorização expirou. Volte ao aplicativo e conecte novamente.');
  }
}

/** Builds the redirect back to the client. `iss` is always included (RFC 9207). */
export function authorizationResponseUrl(redirectUri: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries({ ...params, iss: oauthIssuer() })) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export type AuthorizationStart =
  | { kind: 'consent'; request: ConsentRequest }
  | { kind: 'redirect'; url: string }
  | { kind: 'error'; message: string };

/** Validates `/oauth/authorize`. Errors before the redirect URI is trusted are never redirected. */
export async function beginAuthorization(query: Record<string, unknown>, now = new Date()): Promise<AuthorizationStart> {
  const keys = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];
  // A repeated parameter is ambiguous; never guess which copy the client meant.
  if (keys.some((key) => Array.isArray(query[key]))) return { kind: 'error', message: 'O pedido de autorização tem parâmetros repetidos.' };
  const single = (key: string) => query[key];
  let client: OAuthClient;
  try {
    client = await resolveClient(single('client_id'), now);
  } catch (error) {
    return { kind: 'error', message: error instanceof OAuthError ? error.description : 'Aplicativo desconhecido.' };
  }
  const redirectUri = findRegisteredRedirect(client, single('redirect_uri'));
  if (!redirectUri) return { kind: 'error', message: 'O endereço de retorno não corresponde ao registrado por este aplicativo.' };

  const stateValue = single('state');
  const state = typeof stateValue === 'string' && stateValue.length <= 2000 ? stateValue : undefined;
  const fail = (error: string, description: string): AuthorizationStart => ({ kind: 'redirect', url: authorizationResponseUrl(redirectUri, { error, error_description: description, state }) });

  if (single('response_type') !== 'code') return fail('unsupported_response_type', 'Somente response_type=code é suportado.');
  const codeChallenge = single('code_challenge');
  if (single('code_challenge_method') !== 'S256' || !isValidCodeChallenge(codeChallenge)) {
    return fail('invalid_request', 'PKCE com code_challenge_method=S256 é obrigatório.');
  }
  if (stateValue !== undefined && state === undefined) return fail('invalid_request', 'Parâmetro state inválido.');
  const resourceParam = single('resource');
  if (resourceParam !== undefined && resourceParam !== null && (typeof resourceParam !== 'string' || !isMcpResource(resourceParam))) {
    return fail('invalid_target', `Este servidor emite tokens somente para ${mcpResourceUrl()}.`);
  }
  const requested = parseScopeParam(single('scope'));
  return {
    kind: 'consent',
    request: {
      cid: client.id,
      clientId: client.clientId,
      redirectUri,
      codeChallenge,
      scopes: requested.length ? requested : DEFAULT_OAUTH_SCOPES,
      resource: mcpResourceUrl(),
      state,
    },
  };
}

export async function describeConsentRequest(token: unknown) {
  const request = verifyConsentRequest(token);
  const client = await prisma.oAuthClient.findUnique({ where: { id: request.cid } });
  if (!client || client.clientId !== request.clientId) throw new OAuthError('invalid_request', 'Este aplicativo não está mais registrado. Conecte novamente.');
  const redirect = new URL(request.redirectUri);
  return {
    client: {
      name: client.clientName,
      uri: client.clientUri,
      registrationType: client.registrationType,
      metadataUrl: client.registrationType === 'CIMD' ? client.clientId : null,
    },
    redirectUri: request.redirectUri,
    redirectHost: redirect.protocol === 'https:' || redirect.protocol === 'http:' ? redirect.host : redirect.protocol.replace(/:$/, ''),
    // Any local process can listen on a loopback port; the consent screen warns about it (MCP spec).
    loopbackOnly: client.redirectUris.every((uri) => { try { return isLoopbackRedirect(new URL(uri)); } catch { return false; } }),
    resource: request.resource,
    scopes: request.scopes.map((scope) => ({ id: scope, ...API_SCOPE_DETAILS[scope] })),
  };
}

export async function decideConsent(userId: string, token: unknown, decision: 'approve' | 'deny', chosenScopes: unknown, now = new Date()) {
  const request = verifyConsentRequest(token);
  const client = await prisma.oAuthClient.findUnique({ where: { id: request.cid } });
  if (!client || client.clientId !== request.clientId || !findRegisteredRedirect(client, request.redirectUri)) {
    throw new OAuthError('invalid_request', 'Este aplicativo não está mais registrado. Conecte novamente.');
  }
  if (decision === 'deny') {
    return { redirectTo: authorizationResponseUrl(request.redirectUri, { error: 'access_denied', error_description: 'O usuário negou o acesso.', state: request.state }) };
  }
  const chosen = Array.isArray(chosenScopes) ? normalizeScopes(chosenScopes) : request.scopes;
  const scopes = request.scopes.filter((scope) => chosen.includes(scope));
  if (!scopes.length) throw new OAuthError('invalid_scope', 'Escolha ao menos uma permissão para autorizar.');

  const code = generateSecret('oauthCode');
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashSecret(code),
      clientId: client.id,
      userId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      scopes,
      resource: request.resource,
      expiresAt: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
    },
  });
  prisma.oAuthAuthorizationCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } }).catch(() => undefined);
  return { redirectTo: authorizationResponseUrl(request.redirectUri, { code, state: request.state }) };
}

// ---------------------------------------------------------------- token endpoint

type TokenRequest = { headers: Record<string, unknown>; body: Record<string, unknown> };

const formDecode = (value: string) => decodeURIComponent(value.replace(/\+/g, ' '));

/** Client authentication per RFC 6749 §2.3: public (`none`), `client_secret_post` or `client_secret_basic`. */
export async function authenticateTokenClient({ headers, body }: TokenRequest) {
  let basicId: string | undefined;
  let basicSecret: string | undefined;
  const authorization = typeof headers.authorization === 'string' ? headers.authorization : '';
  if (/^basic /i.test(authorization)) {
    const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) throw new OAuthError('invalid_client', 'Credenciais do cliente inválidas.', 401);
    try {
      basicId = formDecode(decoded.slice(0, separator));
      basicSecret = formDecode(decoded.slice(separator + 1));
    } catch {
      throw new OAuthError('invalid_client', 'Credenciais do cliente inválidas.', 401);
    }
  }
  const bodyId = typeof body.client_id === 'string' ? body.client_id : undefined;
  if (basicId && bodyId && basicId !== bodyId) throw new OAuthError('invalid_request', 'client_id divergente.');
  const clientId = basicId ?? bodyId;
  if (!clientId) throw new OAuthError('invalid_client', 'Informe o client_id.', 401);

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new OAuthError('invalid_client', 'Cliente desconhecido.', 401);
  if (client.tokenEndpointAuthMethod !== 'none') {
    const secret = basicSecret ?? (typeof body.client_secret === 'string' ? body.client_secret : undefined);
    if (!secret || !client.clientSecretHash || !safeEqualHex(hashSecret(secret), client.clientSecretHash)) {
      throw new OAuthError('invalid_client', 'Credenciais do cliente inválidas.', 401);
    }
  }
  return client;
}

async function issueTokenPair(db: Pick<PrismaClient, 'apiToken'>, client: OAuthClient, userId: string, scopes: ApiScope[], resource: string, now: Date) {
  const accessToken = generateSecret('oauthAccess');
  const refreshToken = generateSecret('oauthRefresh');
  const row = await db.apiToken.create({
    data: {
      userId,
      kind: 'OAUTH',
      name: client.clientName.slice(0, 100),
      tokenPrefix: tokenDisplayPrefix(accessToken),
      tokenHash: hashSecret(accessToken),
      refreshTokenHash: hashSecret(refreshToken),
      scopes,
      resource,
      oauthClientId: client.id,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    },
  });
  return { row, body: tokenResponse(accessToken, refreshToken, scopes) };
}

const tokenResponse = (accessToken: string, refreshToken: string, scopes: ApiScope[]) => ({
  access_token: accessToken,
  token_type: 'Bearer',
  expires_in: ACCESS_TOKEN_TTL_SECONDS,
  refresh_token: refreshToken,
  scope: scopes.join(' '),
});

const assertResourceParam = (value: unknown, bound: string) => {
  if (value === undefined) return;
  if (typeof value !== 'string' || normalizeResource(value) !== normalizeResource(bound)) {
    throw new OAuthError('invalid_target', 'O resource informado não corresponde a esta autorização.');
  }
};

export async function exchangeAuthorizationCode(client: OAuthClient, body: Record<string, unknown>, now = new Date()) {
  const { code, redirect_uri: redirectUri, code_verifier: verifier } = body;
  if (typeof code !== 'string' || !code.startsWith('ic_oac_')) throw new OAuthError('invalid_grant', 'Código de autorização inválido.');
  const row = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hashSecret(code) } });
  if (!row || row.clientId !== client.id) throw new OAuthError('invalid_grant', 'Código de autorização inválido.');
  if (row.usedAt) {
    // A replayed code may mean it leaked: revoke what it produced (RFC 6749 §4.1.2).
    if (row.tokenId) await prisma.apiToken.updateMany({ where: { id: row.tokenId, revokedAt: null }, data: { revokedAt: now } });
    throw new OAuthError('invalid_grant', 'Este código de autorização já foi usado.');
  }
  if (row.expiresAt <= now) throw new OAuthError('invalid_grant', 'O código de autorização expirou.');
  if (typeof redirectUri !== 'string' || redirectUri !== row.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri não corresponde à autorização.');
  if (!verifyPkce(verifier, row.codeChallenge)) throw new OAuthError('invalid_grant', 'code_verifier inválido.');
  assertResourceParam(body.resource, row.resource);

  // Claim, issue and link in one transaction, so a concurrent replay can never
  // observe a used code whose token is not yet recorded (and therefore revocable).
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.oAuthAuthorizationCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (!claimed.count) throw new OAuthError('invalid_grant', 'Este código de autorização já foi usado.');
    const { row: token, body: response } = await issueTokenPair(tx, client, row.userId, normalizeScopes(row.scopes), row.resource, now);
    await tx.oAuthAuthorizationCode.update({ where: { id: row.id }, data: { tokenId: token.id } });
    return response;
  });
}

export async function refreshAccessToken(client: OAuthClient, body: Record<string, unknown>, now = new Date()) {
  const refreshToken = body.refresh_token;
  if (typeof refreshToken !== 'string' || !refreshToken.startsWith('ic_ort_')) throw new OAuthError('invalid_grant', 'Refresh token inválido.');
  const oldHash = hashSecret(refreshToken);
  const row = await prisma.apiToken.findUnique({ where: { refreshTokenHash: oldHash } });
  if (!row || row.kind !== 'OAUTH' || row.oauthClientId !== client.id || row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt <= now || !row.resource) {
    throw new OAuthError('invalid_grant', 'Refresh token inválido, expirado ou revogado.');
  }
  assertResourceParam(body.resource, row.resource);
  const granted = normalizeScopes(row.scopes);
  let scopes = granted;
  if (typeof body.scope === 'string' && body.scope.trim()) {
    const requested = parseScopeParam(body.scope);
    const unknownOrWider = body.scope.split(/\s+/).filter((scope) => scope && scope !== 'offline_access').some((scope) => !granted.includes(scope as ApiScope));
    if (unknownOrWider || !requested.length) throw new OAuthError('invalid_scope', 'O escopo pedido excede o que foi autorizado.');
    scopes = requested;
  }

  const accessToken = generateSecret('oauthAccess');
  const nextRefresh = generateSecret('oauthRefresh');
  // Rotation is atomic: only one of two concurrent refreshes with the same token wins.
  const rotated = await prisma.apiToken.updateMany({
    where: { id: row.id, refreshTokenHash: oldHash, revokedAt: null },
    data: {
      tokenHash: hashSecret(accessToken),
      tokenPrefix: tokenDisplayPrefix(accessToken),
      refreshTokenHash: hashSecret(nextRefresh),
      scopes,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    },
  });
  if (!rotated.count) throw new OAuthError('invalid_grant', 'Refresh token inválido, expirado ou revogado.');
  return tokenResponse(accessToken, nextRefresh, scopes);
}

/** RFC 7009: always succeeds for the caller, whether or not the token existed. */
export async function revokeClientToken(client: OAuthClient, token: unknown, now = new Date()) {
  if (typeof token !== 'string' || !token) throw new OAuthError('invalid_request', 'Informe o token.');
  const hash = hashSecret(token);
  await prisma.apiToken.updateMany({
    where: { oauthClientId: client.id, revokedAt: null, OR: [{ tokenHash: hash }, { refreshTokenHash: hash }] },
    data: { revokedAt: now },
  });
}

// ---------------------------------------------------------------- discovery metadata

export const authorizationServerMetadata = () => {
  const issuer = oauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...API_SCOPES, 'offline_access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: SUPPORTED_AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: SUPPORTED_AUTH_METHODS,
    code_challenge_methods_supported: ['S256'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${env.FRONTEND_URL.replace(/\/+$/, '')}/integrations`,
  };
};

export const protectedResourceMetadata = () => ({
  resource: mcpResourceUrl(),
  authorization_servers: [oauthIssuer()],
  scopes_supported: [...API_SCOPES],
  bearer_methods_supported: ['header'],
  resource_name: 'InstaCommand',
  resource_documentation: `${env.FRONTEND_URL.replace(/\/+$/, '')}/integrations`,
});
