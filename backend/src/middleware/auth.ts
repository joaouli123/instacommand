import { getPrisma } from '../lib/prisma';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { AppError, ForbiddenError, UnauthorizedError } from '../utils/errors';
import { isApiTokenFormat, verifyApiToken } from '../services/api-tokens.service';
import { API_SCOPE_DETAILS, requiredScopeFor, resolvePostRequirement, type ApiScope } from '../services/api-scopes';
import { isTrustedMcpProxyRequest } from '../mcp/proxy-trust';

const prisma = getPrisma();

export type RequestAuth =
  | { kind: 'session' }
  | { kind: 'api_token'; tokenId: string; tokenKind: 'PERSONAL' | 'OAUTH'; scopes: ApiScope[]; clientName: string | null };

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  auth?: RequestAuth;
}

export const getBearerOrCookieToken = (req: Request) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  // Browser sessions are refreshed through the HttpOnly cookie after OAuth.
  // Prefer it over a possibly stale localStorage bearer token so a connection
  // is never attached to a different workspace than the one in the browser.
  return req.cookies?.instacommand_token || bearerToken;
};

export const getApiTokenFromRequest = (req: Request) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  return isApiTokenFormat(bearerToken) ? bearerToken : undefined;
};

export const verifyAuthToken = (req: Request) => {
  const token = getBearerOrCookieToken(req);
  const cookieToken = req.cookies?.instacommand_token;
  const candidates = [cookieToken, token].filter(
    (candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index,
  );

  for (const candidate of candidates) {
    try {
      const session = asSessionPayload(jwt.verify(candidate, env.JWT_SECRET));
      if (session) return session;
    } catch {
      // A stale browser bearer token must not hide a fresh OAuth session cookie.
    }
  }

  return null;
};

// Other short-lived JWTs (OAuth state, OAuth session handoff) share the same
// signing secret. Accepting one as a session would leave `req.user.id`
// undefined, and Prisma treats `where: { userId: undefined }` as "no filter",
// exposing every workspace. Only genuine session payloads are accepted.
export const asSessionPayload = (payload: unknown): { id: string; email: string } | null => {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  if (value.purpose !== undefined || value.aud !== undefined) return null;
  if (typeof value.id !== 'string' || !value.id || typeof value.email !== 'string' || !value.email) return null;
  return { id: value.id, email: value.email };
};

const insufficientScope = (scope: ApiScope) => new ForbiddenError(
  `Este token não tem a permissão "${scope}" (${API_SCOPE_DETAILS[scope].label}) exigida por esta ação. Crie um token com essa permissão na página MCP e CLI.`,
);

async function authenticateApiToken(req: AuthRequest, secret: string) {
  const token = await verifyApiToken(secret);
  if (!token) throw new UnauthorizedError('Token de API inválido, expirado ou revogado.');
  // OAuth tokens are issued for the MCP resource only. They reach the REST
  // API exclusively through the MCP server's own loopback calls.
  if (token.resource && !isTrustedMcpProxyRequest(req)) {
    throw new UnauthorizedError('Este token foi emitido para o endpoint MCP e só pode ser usado por ele.');
  }

  const requirement = requiredScopeFor(req.method, req.originalUrl, req.body);
  let scope: ApiScope | 'session';
  if ('postId' in requirement) {
    const post = await prisma.scheduledPost.findFirst({
      where: { id: requirement.postId, userId: token.userId },
      select: { status: true, publishedPostId: true },
    });
    scope = resolvePostRequirement(requirement, post);
  } else {
    scope = requirement.scope;
  }
  if (scope === 'session') throw new ForbiddenError('Tokens de API não podem gerenciar credenciais. Use o painel do InstaCommand.');
  if (!token.scopes.includes(scope)) throw insufficientScope(scope);

  req.user = { id: token.userId, email: token.email };
  req.auth = { kind: 'api_token', tokenId: token.tokenId, tokenKind: token.kind, scopes: token.scopes, clientName: token.clientName };
}

export const authenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const apiToken = getApiTokenFromRequest(req);
    if (apiToken) {
      await authenticateApiToken(req, apiToken);
      return next();
    }

    const decoded = verifyAuthToken(req);
    if (!decoded) return next(new UnauthorizedError('Invalid or expired token'));

    req.user = decoded;
    req.auth = { kind: 'session' };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new UnauthorizedError('Invalid or expired token'));
  }
};
