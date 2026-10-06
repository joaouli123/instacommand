import { env } from './env';

const trimSlash = (value: string) => value.replace(/\/+$/, '');

/** The backend is both the OAuth authorization server and the MCP resource server. */
export const oauthIssuer = () => trimSlash(env.BACKEND_URL);
export const mcpResourceUrl = () => `${oauthIssuer()}/mcp`;
export const protectedResourceMetadataUrl = () => `${oauthIssuer()}/.well-known/oauth-protected-resource/mcp`;
export const integrationsPageUrl = () => `${trimSlash(env.FRONTEND_URL)}/integrations`;
export const oauthConsentPageUrl = () => `${trimSlash(env.FRONTEND_URL)}/oauth/authorize`;

/** Compares resource indicators without being tripped by a trailing slash or host casing. */
export const normalizeResource = (raw: string) => {
  try {
    const url = new URL(raw);
    if (url.hash) return null;
    return `${url.protocol}//${url.host.toLowerCase()}${trimSlash(url.pathname)}${url.search}`;
  } catch {
    return null;
  }
};

export const isMcpResource = (raw: string | null | undefined) => Boolean(raw) && normalizeResource(String(raw)) === normalizeResource(mcpResourceUrl());
