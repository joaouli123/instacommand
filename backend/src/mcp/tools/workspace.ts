import { env } from '../../config/env';
import { integrationsPageUrl, mcpResourceUrl } from '../../config/mcp';
import { API_SCOPES, API_SCOPE_DETAILS } from '../../services/api-scopes';
import { compactAccount, compactThreadsAccount, DEFAULT_TIMEZONE, defineTool, POST_STATUSES, postSummary, READ } from '../tool-kit';
import { PUBLISHING_GUIDE } from '../guide';

export const workspaceTools = [
  defineTool({
    name: 'get_profile',
    title: 'Perfil conectado',
    category: 'workspace',
    description: 'Retorna o usuário do InstaCommand dono desta conexão (id estável, nome e e-mail).',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    // ChatGPT uses this tool to recognize which workspace profile is connected.
    meta: { 'openai/profile': true },
    handler: async (_args, { api }) => {
      const me = await api.get('/auth/me');
      return { id: me.id, name: me.name, email: me.email, nickname: me.name };
    },
  }),

  defineTool({
    name: 'get_workspace_overview',
    title: 'Visão geral do workspace',
    category: 'workspace',
    description: 'COMECE POR AQUI. Mostra o usuário, as permissões deste token, contas do Instagram (com a Página do Facebook vinculada) e do Threads com seus IDs, contas aguardando seleção, contagem de publicações por status, próximos agendamentos, status da IA e o fuso horário padrão.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    handler: async (_args, { api, auth }) => {
      const [me, accounts, threads, pending, posts, ai] = await Promise.all([
        api.get('/auth/me'),
        api.get<any[]>('/accounts'),
        api.get<any[]>('/accounts/threads'),
        api.get<any[]>('/accounts/pending'),
        api.get<any[]>('/posts'),
        api.get('/settings/ai').catch(() => null),
      ]);
      const now = Date.now();
      const byStatus = Object.fromEntries(POST_STATUSES.map((status) => [status, posts.filter((post) => post.status === status).length]));
      const nextScheduled = posts
        .filter((post) => post.status === 'SCHEDULED' && new Date(post.scheduledFor).getTime() >= now)
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
        .slice(0, 10)
        .map(postSummary);
      return {
        user: { id: me.id, name: me.name, email: me.email },
        connection: {
          kind: auth.tokenKind === 'OAUTH' ? 'oauth' : 'personal_token',
          name: auth.clientName || auth.tokenName,
          scopes: auth.scopes,
          missingScopes: API_SCOPES.filter((scope) => !auth.scopes.includes(scope)).map((scope) => ({ scope, ...API_SCOPE_DETAILS[scope] })),
        },
        instagramAccounts: accounts.map(compactAccount),
        threadsAccounts: threads.map(compactThreadsAccount),
        pendingAccountSelections: pending.length,
        posts: { total: posts.length, byStatus, nextScheduled },
        ai: ai ? { configured: Boolean(ai.apiKeyConfigured), model: ai.model, source: ai.source } : null,
        timezone: DEFAULT_TIMEZONE,
        serverTime: new Date().toISOString(),
        links: { app: env.FRONTEND_URL, integrations: integrationsPageUrl(), mcp: mcpResourceUrl() },
        hints: [
          'Facebook: cada conta do Instagram publica na Página vinculada em facebookPage. Use platforms ["FACEBOOK"].',
          accounts.length ? null : 'Nenhuma conta do Instagram conectada. Use start_account_connection (escopo admin) e peça ao usuário para abrir o link.',
          pending.length ? 'Há contas de uma conexão antiga aguardando seleção: confirme com o usuário e use list_pending_accounts e select_accounts.' : null,
        ].filter(Boolean),
      };
    },
  }),

  defineTool({
    name: 'get_publishing_guide',
    title: 'Guia de publicação',
    category: 'workspace',
    description: 'Regras completas de formatos, limites, mídias, agendamento, hashtags e opções avançadas por rede. Consulte antes de criar ou agendar publicações.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: {},
    handler: async () => PUBLISHING_GUIDE,
  }),
];
