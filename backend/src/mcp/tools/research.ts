import { z } from 'zod';
import { encodePathSegment } from '../internal-api';
import { accountIdSchema, defineTool, DESTRUCTIVE, normalizeUsername, READ, READ_LIVE, WRITE } from '../tool-kit';

const competitorIdSchema = z.string().uuid().describe('ID do concorrente (campo id de list_competitors).');

export const researchTools = [
  defineTool({
    name: 'list_competitors',
    title: 'Listar concorrentes',
    category: 'research',
    description: 'Lista os perfis concorrentes monitorados pela conta, com a última coleta (seguidores, médias de curtidas/comentários e engajamento).',
    scopes: ['read'],
    annotations: READ,
    inputSchema: { accountId: accountIdSchema },
    handler: async ({ accountId }, { api }) => ({ competitors: await api.get(`/competitors/${encodePathSegment(accountId)}`) }),
  }),

  defineTool({
    name: 'add_competitor',
    title: 'Monitorar concorrente',
    category: 'research',
    description: 'Passa a monitorar um perfil profissional público do Instagram (via Business Discovery da Meta).',
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { accountId: accountIdSchema, username: z.string().trim().min(1).max(31).describe('@usuário do concorrente.') },
    handler: async ({ accountId, username }, { api }) => api.post(`/competitors/${encodePathSegment(accountId)}`, { igUsername: normalizeUsername(username) }),
  }),

  defineTool({
    name: 'refresh_competitor',
    title: 'Atualizar concorrente',
    category: 'research',
    description: 'Coleta agora os dados mais recentes de um concorrente monitorado.',
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { competitorId: competitorIdSchema },
    handler: async ({ competitorId }, { api }) => api.post(`/competitors/${encodePathSegment(competitorId)}/refresh`),
  }),

  defineTool({
    name: 'get_competitor_history',
    title: 'Histórico do concorrente',
    category: 'research',
    description: 'Até 30 coletas mais recentes de um concorrente (evolução de seguidores e engajamento, posts recentes).',
    scopes: ['read'],
    annotations: READ,
    inputSchema: { competitorId: competitorIdSchema },
    handler: async ({ competitorId }, { api }) => ({ history: await api.get(`/competitors/${encodePathSegment(competitorId)}/insights`) }),
  }),

  defineTool({
    name: 'remove_competitor',
    title: 'Parar de monitorar concorrente',
    category: 'research',
    description: 'Remove um concorrente e seu histórico de coletas.',
    scopes: ['write'],
    annotations: { ...DESTRUCTIVE, openWorldHint: false },
    inputSchema: { competitorId: competitorIdSchema },
    handler: async ({ competitorId }, { api }) => api.delete(`/competitors/${encodePathSegment(competitorId)}`),
  }),

  defineTool({
    name: 'search_hashtag',
    title: 'Pesquisar hashtag',
    category: 'research',
    description: 'Pesquisa uma hashtag no Instagram e retorna publicações em alta e recentes. Depende do recurso de busca de hashtags liberado pela Meta para o app; a Meta limita a 30 hashtags distintas por conta a cada 7 dias.',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: { accountId: accountIdSchema, hashtag: z.string().trim().min(1).max(100).describe('Hashtag, com ou sem #.') },
    handler: async ({ accountId, hashtag }, { api }) => api.get(`/trends/${encodePathSegment(accountId)}/hashtags`, { q: hashtag.replace(/^#+/, '') }),
  }),

  defineTool({
    name: 'list_tracked_hashtags',
    title: 'Hashtags acompanhadas',
    category: 'research',
    description: 'Lista as hashtags salvas para acompanhamento nesta conta.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: { accountId: accountIdSchema },
    handler: async ({ accountId }, { api }) => ({ hashtags: await api.get(`/trends/${encodePathSegment(accountId)}/saved`) }),
  }),

  defineTool({
    name: 'track_hashtag',
    title: 'Acompanhar hashtag',
    category: 'research',
    description: 'Pesquisa a hashtag e salva o resultado para acompanhamento.',
    scopes: ['read', 'write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { accountId: accountIdSchema, hashtag: z.string().trim().min(1).max(100) },
    handler: async ({ accountId, hashtag }, { api }) => {
      const clean = hashtag.replace(/^#+/, '');
      const data = await api.get(`/trends/${encodePathSegment(accountId)}/hashtags`, { q: clean });
      return api.post(`/trends/${encodePathSegment(accountId)}/hashtags/track`, {
        hashtag: clean,
        data: { igHashtagId: data.igHashtagId, topMediaCount: data.topMediaCount, recentMediaCount: data.recentMediaCount },
      });
    },
  }),

  defineTool({
    name: 'untrack_hashtag',
    title: 'Parar de acompanhar hashtag',
    category: 'research',
    description: 'Remove uma hashtag acompanhada.',
    scopes: ['write'],
    annotations: { ...DESTRUCTIVE, openWorldHint: false },
    inputSchema: { accountId: accountIdSchema, trackedHashtagId: z.string().uuid().describe('Campo id de list_tracked_hashtags.') },
    handler: async ({ accountId, trackedHashtagId }, { api }) => api.delete(`/trends/${encodePathSegment(accountId)}/hashtags/${encodePathSegment(trackedHashtagId)}`),
  }),
];
