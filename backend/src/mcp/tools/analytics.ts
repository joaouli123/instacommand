import { z } from 'zod';
import { encodePathSegment } from '../internal-api';
import { ValidationError } from '../../utils/errors';
import { accountIdSchema, daysSchema, defineTool, READ_LIVE } from '../tool-kit';

const REPORTS = {
  dashboard: 'Resumo do período: seguidores, alcance, engajamento e variações.',
  profile_report: 'Relatório completo do perfil com métricas verificadas da Meta.',
  growth: 'Série de crescimento de seguidores.',
  engagement: 'Série de engajamento por dia.',
  top_posts: 'Melhores publicações (ordene por sortBy e filtre por mediaType).',
  posts: 'Tabela de desempenho das publicações (paginada).',
  audience: 'Demografia do público (seguidores ou engajados).',
  best_times: 'Melhores dias e horários para publicar.',
  content_types: 'Desempenho por formato (imagem, carrossel, Reels, Stories).',
  recommendations: 'Recomendações com base nos dados do período.',
  access: 'Quais permissões de métricas a Meta liberou para a conta.',
} as const;
type Report = keyof typeof REPORTS;

const PATHS: Record<Report, string> = {
  dashboard: 'dashboard', profile_report: 'profile-report', growth: 'growth', engagement: 'engagement', top_posts: 'top-posts',
  posts: 'posts', audience: 'audience', best_times: 'best-times', content_types: 'content-types', recommendations: 'recommendations', access: 'access',
};

export const analyticsTools = [
  defineTool({
    name: 'get_instagram_analytics',
    title: 'Relatórios do Instagram',
    category: 'analytics',
    description: `Relatórios do Instagram com dados reais da Meta. report: ${Object.entries(REPORTS).map(([key, value]) => `${key} (${value})`).join('; ')}. Métricas que a Meta não liberou vêm indicadas como indisponíveis — não invente números.`,
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: {
      accountId: accountIdSchema,
      report: z.enum(Object.keys(REPORTS) as [Report, ...Report[]]),
      days: daysSchema,
      mediaType: z.enum(['IMAGE', 'CAROUSEL', 'REEL', 'STORY', 'FEED']).optional().describe('Somente top_posts. FEED = imagens + carrosséis.'),
      sortBy: z.enum(['interactions', 'views', 'reach', 'engagement', 'likes']).optional().describe('Somente top_posts.'),
      page: z.number().int().min(1).optional().describe('Somente posts.'),
      limit: z.number().int().min(1).max(100).optional().describe('Somente posts.'),
      audience: z.enum(['followers', 'engaged']).optional().describe('Somente audience.'),
    },
    handler: async ({ accountId, report, days, mediaType, sortBy, page, limit, audience }, { api }) => {
      const query: Record<string, string | number | undefined> = {};
      if (!['audience', 'access'].includes(report)) query.days = days;
      if (report === 'top_posts') Object.assign(query, { mediaType, sortBy });
      if (report === 'posts') Object.assign(query, { page, limit });
      if (report === 'audience') query.audience = audience;
      return api.get(`/analytics/${encodePathSegment(accountId)}/${PATHS[report as Report]}`, query);
    },
  }),

  defineTool({
    name: 'get_network_report',
    title: 'Relatório do Facebook ou Threads',
    category: 'analytics',
    description: 'Relatório da Página do Facebook (vinculada à conta do Instagram) ou de uma conta do Threads. Facebook aceita 7, 30, 90, 365 ou 730 dias; Threads aceita 7, 30 ou 90.',
    scopes: ['read'],
    annotations: READ_LIVE,
    inputSchema: {
      network: z.enum(['facebook', 'threads']),
      accountId: z.string().uuid().describe('facebook: id da conta do Instagram dona da Página. threads: id da conta do Threads.'),
      days: daysSchema,
    },
    handler: async ({ network, accountId, days }, { api }) => {
      if (network === 'threads' && ![7, 30, 90].includes(days)) throw new ValidationError('O relatório do Threads aceita 7, 30 ou 90 dias.');
      return api.get(`/analytics/networks/${network}/${encodePathSegment(accountId)}`, { days });
    },
  }),
];
