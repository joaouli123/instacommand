import { env } from '../config/env';
import { InstagramApiError } from './errors';

const graphBaseUrl = () => `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

/**
 * Meta returns absolute pagination URLs that already contain the API version
 * (for example /v25.0/me/accounts). graphGet prefixes the configured version,
 * so passing that path through unchanged would produce /v25.0/v25.0/....
 * Normalize both absolute and relative cursors before requesting the next page
 * and remove any token embedded in a cursor URL.
 */
export const normalizeGraphPagePath = (next: string): string => {
  const parsed = new URL(next, graphBaseUrl());
  const versionPrefix = new RegExp(`^/${env.META_GRAPH_API_VERSION}(?=/|$)`);
  const pathname = parsed.pathname.replace(versionPrefix, '') || '/';
  parsed.searchParams.delete('access_token');
  const query = parsed.searchParams.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
};

const encodeValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
};

const safeMetaDiagnostic = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/\b(access_token|appsecret_proof|client_secret)\s*[:=]\s*[^\s&,}]+/gi, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(/\b(?:EA[A-Za-z0-9_-]{20,}|IG[A-Z0-9_-]{20,}|[A-Za-z0-9_-]{48,})\b/g, '[REDACTED]')
    .replace(/\b\d{9,}\b/g, '[ID]')
    .slice(0, 300);
};

const requestGraph = async (
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: string,
  params: Record<string, unknown> = {},
) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${graphBaseUrl()}${normalizedPath}`);
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, access_token: token })) {
    if (value !== undefined && value !== null) body.set(key, encodeValue(value));
  }

  if (method === 'GET' || method === 'DELETE') {
    for (const [key, value] of body.entries()) url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      body: method === 'POST' ? body : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.error) {
      const metaError = data?.error || {};
      const details = {
        metaCode: typeof metaError.code === 'number' ? metaError.code : undefined,
        metaSubcode: typeof metaError.error_subcode === 'number' ? metaError.error_subcode : undefined,
        metaType: typeof metaError.type === 'string' ? metaError.type : undefined,
        fbtraceId: typeof metaError.fbtrace_id === 'string' ? metaError.fbtrace_id : undefined,
        metaMessage: normalizedPath.endsWith('/subscribed_apps') ? safeMetaDiagnostic(metaError.message) : undefined,
      };
      console.warn('Meta Graph API rejected a request:', {
        endpoint: normalizedPath.replace(/^\/\d+(?=\/|$)/, '/:id'),
        status: response.status,
        ...details,
        // This endpoint's generic code 3 is otherwise ambiguous. Keep the
        // provider's short reason in private server logs, with tokens and
        // long account identifiers stripped, so we can diagnose access gates.
        ...(details.metaMessage ? { metaMessage: details.metaMessage } : {}),
      });
      throw new InstagramApiError(
        'Meta Graph API request was rejected.',
        response.ok ? 502 : response.status,
        details,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof InstagramApiError) throw error;
    throw new InstagramApiError(error instanceof Error ? error.message : 'Unknown Graph API error');
  }
};

export const graphGet = (path: string, token: string, params: Record<string, unknown> = {}) =>
  requestGraph('GET', path, token, params);

export const graphPost = (path: string, token: string, data: Record<string, unknown> = {}) =>
  requestGraph('POST', path, token, data);

export const graphDelete = (path: string, token: string) =>
  requestGraph('DELETE', path, token);

export type GraphCollection<T> = {
  items: T[];
  complete: boolean;
  pagesFetched: number;
};

export const graphGetAllWithStatus = async <T = any>(
  path: string,
  token: string,
  params: Record<string, unknown> = {},
  maxPages = 20,
): Promise<GraphCollection<T>> => {
  const items: T[] = [];
  let nextPath: string | null = path;
  let page = 0;
  let pageParams = params;
  let validPages = true;

  while (nextPath && page < maxPages) {
    const response = await graphGet(nextPath, token, pageParams);
    if (Array.isArray(response.data)) items.push(...response.data as T[]);
    else validPages = false;
    nextPath = response.paging?.next ? normalizeGraphPagePath(String(response.paging.next)) : null;
    pageParams = {};
    page += 1;
  }

  return { items, complete: validPages && !nextPath, pagesFetched: page };
};

export const graphGetAll = async <T = any>(
  path: string,
  token: string,
  params: Record<string, unknown> = {},
  maxPages = 20,
): Promise<T[]> => (await graphGetAllWithStatus<T>(path, token, params, maxPages)).items;
