export const API_SCOPES = ['read', 'write', 'publish', 'admin'] as const;
export type ApiScope = typeof API_SCOPES[number];

export const API_SCOPE_DETAILS: Record<ApiScope, { label: string; description: string }> = {
  read: {
    label: 'Leitura',
    description: 'Ler contas, publicações, calendário, relatórios, comentários, automações e configurações.',
  },
  write: {
    label: 'Edição',
    description: 'Criar e editar rascunhos, enviar mídias, gerar conteúdo com IA e gerenciar automações desativadas, concorrentes e preferências.',
  },
  publish: {
    label: 'Publicação',
    description: 'Publicar agora, agendar, responder ou excluir comentários, enviar respostas revisadas e ativar automações que respondem sozinhas.',
  },
  admin: {
    label: 'Administração',
    description: 'Conectar e desconectar contas, inscrever webhooks e alterar credenciais de aplicativos e da IA.',
  },
};

export const isApiScope = (value: unknown): value is ApiScope => typeof value === 'string' && (API_SCOPES as readonly string[]).includes(value);

/** Keeps known scopes once, in canonical order. */
export const normalizeScopes = (values: readonly unknown[]): ApiScope[] => API_SCOPES.filter((scope) => values.includes(scope));

// `session` marks routes that manage credentials. API tokens can never reach
// them, so a leaked token cannot mint, list or revoke other tokens.
export type ScopeRequirement =
  | { scope: ApiScope | 'session' }
  | { postId: string; method: 'PATCH' | 'DELETE'; requestedStatus?: unknown };

type Rule = { methods: string[]; pattern: RegExp; requirement: (match: RegExpMatchArray, body: any) => ScopeRequirement };

const fixed = (scope: ApiScope | 'session') => () => ({ scope });
const enabledRequiresPublish = (_match: RegExpMatchArray, body: any): ScopeRequirement => ({ scope: body?.enabled === true ? 'publish' : 'write' });

// Write routes are listed explicitly. Anything not listed requires `admin`, so
// a route added later is never silently writable by a narrower token.
const writeRules: Rule[] = [
  { methods: ['POST'], pattern: /^\/api\/posts$/, requirement: (_m, body) => ({ scope: body?.status === 'SCHEDULED' ? 'publish' : 'write' }) },
  { methods: ['POST'], pattern: /^\/api\/posts\/(upload|import-url)$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/posts\/[^/]+\/publish$/, requirement: fixed('publish') },
  { methods: ['PATCH'], pattern: /^\/api\/posts\/([^/]+)$/, requirement: (m, body) => ({ postId: m[1], method: 'PATCH', requestedStatus: body?.status }) },
  { methods: ['DELETE'], pattern: /^\/api\/posts\/([^/]+)$/, requirement: (m) => ({ postId: m[1], method: 'DELETE' }) },
  { methods: ['POST'], pattern: /^\/api\/scheduler\/[^/]+\/reschedule$/, requirement: fixed('publish') },
  { methods: ['DELETE'], pattern: /^\/api\/scheduler\/[^/]+$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/accounts\/[^/]+\/sync$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/ai\/(generate|daily-drafts|analyze-images)$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/community\/comments\/[^/]+\/reply$/, requirement: fixed('publish') },
  { methods: ['DELETE'], pattern: /^\/api\/community\/comments\/[^/]+$/, requirement: fixed('publish') },
  { methods: ['PUT'], pattern: /^\/api\/automations\/agent$/, requirement: (_m, body) => ({ scope: body?.enabled === true && body?.autoSend === true ? 'publish' : 'write' }) },
  { methods: ['POST'], pattern: /^\/api\/automations\/templates$/, requirement: fixed('write') },
  { methods: ['DELETE'], pattern: /^\/api\/automations\/templates\/[^/]+$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/automations\/subscribe$/, requirement: fixed('admin') },
  { methods: ['POST'], pattern: /^\/api\/automations\/executions\/[^/]+\/send$/, requirement: fixed('publish') },
  { methods: ['PUT'], pattern: /^\/api\/automations\/conversations\/[^/]+\/state$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/automations\/conversations\/[^/]+\/forget$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/automations\/(threads|x)\/sync$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/automations$/, requirement: enabledRequiresPublish },
  { methods: ['PUT'], pattern: /^\/api\/automations\/[^/]+$/, requirement: enabledRequiresPublish },
  { methods: ['DELETE'], pattern: /^\/api\/automations\/[^/]+$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/competitors\/[^/]+(\/refresh)?$/, requirement: fixed('write') },
  { methods: ['DELETE'], pattern: /^\/api\/competitors\/[^/]+$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/trends\/[^/]+\/hashtags\/track$/, requirement: fixed('write') },
  { methods: ['DELETE'], pattern: /^\/api\/trends\/[^/]+\/hashtags\/[^/]+$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/notifications\/(read-all|[^/]+\/read)$/, requirement: fixed('write') },
  { methods: ['PUT'], pattern: /^\/api\/settings\/preferences$/, requirement: fixed('write') },
  { methods: ['POST'], pattern: /^\/api\/auth\/logout$/, requirement: fixed('write') },
];

const adminReadPattern = /^\/api\/auth\/(facebook|threads|x)(\/url)?$/;
const sessionOnlyPattern = /^\/api\/(integrations|oauth)(\/|$)/;

/**
 * Normalizes the request path the same way Express matches it: case-insensitive,
 * no trailing slash, and each segment percent-decoded (Express decodes
 * `req.params`, so `%61bc` must classify exactly like `abc`). Returns null for
 * segments that cannot be decoded or that decode to a slash.
 */
export const normalizeApiPath = (originalUrl: string): string | null => {
  const raw = originalUrl.split('?')[0].split('#')[0].replace(/\/{2,}/g, '/');
  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { return null; }
    if (decoded.includes('/') || decoded.includes('\\')) return null;
    segments.push(decoded.toLowerCase());
  }
  const pathname = segments.join('/');
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
};

export function requiredScopeFor(method: string, originalUrl: string, body: unknown): ScopeRequirement {
  const verb = method.toUpperCase();
  const path = normalizeApiPath(originalUrl);
  // An undecodable path is refused for every token except one that may do anything.
  if (path === null) return { scope: 'admin' };
  if (sessionOnlyPattern.test(path)) return { scope: 'session' };
  if (['GET', 'HEAD', 'OPTIONS'].includes(verb)) return { scope: adminReadPattern.test(path) ? 'admin' : 'read' };
  for (const rule of writeRules) {
    if (!rule.methods.includes(verb)) continue;
    const match = path.match(rule.pattern);
    if (match) return rule.requirement(match, body);
  }
  return { scope: 'admin' };
}

const publicStates = new Set(['SCHEDULED', 'PROCESSING', 'PUBLISHED']);

/**
 * Resolves post-dependent requirements. Editing what will be published
 * automatically, or deleting something already public, is a publish action.
 */
export function resolvePostRequirement(
  requirement: { method: 'PATCH' | 'DELETE'; requestedStatus?: unknown },
  post: { status: string; publishedPostId: string | null } | null,
): ApiScope {
  // Fail closed: if the post cannot be found here, the route will answer 404
  // anyway, and a narrower token must never win a lookup mismatch.
  if (!post) return 'publish';
  if (requirement.method === 'PATCH') {
    // Returning to draft only removes a pending publication.
    if (requirement.requestedStatus === 'DRAFT') return 'write';
    return requirement.requestedStatus === 'SCHEDULED' || post.status === 'SCHEDULED' ? 'publish' : 'write';
  }
  return publicStates.has(post.status) || post.publishedPostId ? 'publish' : 'write';
}
