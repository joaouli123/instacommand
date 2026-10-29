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
  defineTool({
    name: 'list_youtube_competitors',
    title: 'Concorrentes no YouTube',
    category: 'research',
    description: 'Canal do YouTube da empresa ao lado dos canais concorrentes monitorados: inscritos, visualizações, médias dos últimos vídeos, engajamento, vídeos por semana e os vídeos mais vistos de cada um.',
    scopes: ['read'],
    annotations: READ,
    inputSchema: { accountId: accountIdSchema },
    handler: async ({ accountId }, { api }) => api.get(`/youtube-research/${encodePathSegment(accountId)}/competitors`),
  }),

  defineTool({
    name: 'add_youtube_competitor',
    title: 'Monitorar canal concorrente no YouTube',
    category: 'research',
    description: 'Passa a monitorar um canal público do YouTube para a empresa. Aceita @handle, link youtube.com/@canal ou ID UC…. Exige o canal do YouTube da empresa conectado (a consulta usa a cota dele).',
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { accountId: accountIdSchema, channel: z.string().trim().min(1).max(300).describe('@handle, link ou ID do canal.') },
    handler: async ({ accountId, channel }, { api }) => api.post(`/youtube-research/${encodePathSegment(accountId)}/competitors`, { channel }),
  }),

  defineTool({
    name: 'refresh_youtube_competitor',
    title: 'Atualizar canal concorrente',
    category: 'research',
    description: 'Lê de novo os números e os últimos vídeos de um canal concorrente do YouTube.',
    scopes: ['write'],
    annotations: { ...WRITE, openWorldHint: true },
    inputSchema: { competitorId: z.string().uuid().describe('Campo id de list_youtube_competitors.') },
    handler: async ({ competitorId }, { api }) => api.post(`/youtube-research/competitors/${encodePathSegment(competitorId)}/refresh`),
  }),

  defineTool({
    name: 'remove_youtube_competitor',
    title: 'Parar de monitorar canal',
    category: 'research',
    description: 'Remove um canal concorrente do YouTube e o histórico dele.',
    scopes: ['write'],
    annotations: { ...DESTRUCTIVE, openWorldHint: false },
    inputSchema: { competitorId: z.string().uuid().describe('Campo id de list_youtube_competitors.') },
    handler: async ({ competitorId }, { api }) => api.delete(`/youtube-research/competitors/${encodePathSegment(competitorId)}`),
  }),

  defineTool({
    name: 'get_youtube_trends',
    title: 'Em alta no YouTube',
    category: 'research',
    description: 'Vídeos em alta no YouTube Brasil (ranking oficial, por categoria) ou os mais vistos recentes para uma palavra-chave. Resultados ficam em cache por 1 hora; a busca por palavra-chave gasta mais cota.',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: {
      accountId: accountIdSchema,
      q: z.string().trim().max(100).optional().describe('Palavra-chave. Sem ela, traz o ranking oficial de em alta.'),
      category: z.string().optional().describe('ID da categoria do YouTube (ex.: 27 Educação, 28 Ciência e tecnologia, 22 Pessoas e blogs).'),
      days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7).describe('Busca por palavra-chave: vídeos publicados nos últimos N dias.'),
    },
    handler: async ({ accountId, q, category, days }, { api }) => api.get(`/youtube-research/${encodePathSegment(accountId)}/trends`, { ...(q ? { q } : {}), ...(category ? { category } : {}), days }),
  }),
];
