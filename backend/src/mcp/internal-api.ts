import { env } from '../config/env';
import { MCP_PROXY_HEADER, mcpProxySecret } from './proxy-trust';

/** Tests point this at their ephemeral server; production uses this process's own port. */
export const internalApiConfig = { baseUrl: '' };
const baseUrl = () => (internalApiConfig.baseUrl || `http://127.0.0.1:${env.BACKEND_PORT}`).replace(/\/+$/, '');

export class ApiCallError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;
type RequestOptions = { query?: Query; body?: unknown; timeoutMs?: number };
export type UploadFile = { data: Buffer; filename: string; mimeType: string };

export type InternalApi = {
  request<T = any>(method: string, path: string, options?: RequestOptions): Promise<T>;
  get<T = any>(path: string, query?: Query): Promise<T>;
  post<T = any>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  patch<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body?: unknown): Promise<T>;
  delete<T = any>(path: string, query?: Query): Promise<T>;
  upload(files: UploadFile[]): Promise<{ urls: string[] }>;
};

export const encodePathSegment = (value: string) => encodeURIComponent(value);

const errorMessage = (status: number, payload: any) => {
  const base = typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : `A API respondeu com status ${status}.`;
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const details = payload.errors.slice(0, 5).map((issue: any) => `${Array.isArray(issue?.path) && issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue?.message || 'inválido'}`).join('; ');
    return `${base} (${details})`;
  }
  return base;
};

async function parseResponse(response: Response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 500) }; }
}

/** REST client bound to the caller's token. Every tool runs through the same routes as the web app. */
export function createInternalApi(token: string): InternalApi {
  const headers = () => ({ Authorization: `Bearer ${token}`, [MCP_PROXY_HEADER]: mcpProxySecret, Accept: 'application/json' });

  const send = async (method: string, path: string, init: { body?: BodyInit; contentType?: string; query?: Query; timeoutMs?: number }) => {
    const url = new URL(`${baseUrl()}/api${path}`);
    for (const [key, value] of Object.entries(init.query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      method,
      headers: { ...headers(), ...(init.contentType ? { 'Content-Type': init.contentType } : {}) },
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
    });
    const payload = await parseResponse(response);
    if (!response.ok) throw new ApiCallError(response.status, errorMessage(response.status, payload), payload);
    return payload;
  };

  const api: InternalApi = {
    request: (method, path, options = {}) => send(method, path, {
      query: options.query,
      timeoutMs: options.timeoutMs,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body), contentType: 'application/json' }),
    }),
    get: (path, query) => api.request('GET', path, { query }),
    post: (path, body, options) => api.request('POST', path, { ...options, body: body ?? {} }),
    patch: (path, body) => api.request('PATCH', path, { body: body ?? {} }),
    put: (path, body) => api.request('PUT', path, { body: body ?? {} }),
    delete: (path, query) => api.request('DELETE', path, { query }),
    upload: async (files) => {
      const form = new FormData();
      for (const file of files) form.append('files', new Blob([new Uint8Array(file.data)], { type: file.mimeType }), file.filename);
      return send('POST', '/posts/upload', { body: form, timeoutMs: 300_000 });
    },
  };
  return api;
}
