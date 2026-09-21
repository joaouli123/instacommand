import { Prisma } from '@prisma/client';
import { metricValue, normalizedMetrics } from './metric-availability';

export const aiProfileSelect = {
  igUsername: true, igName: true, igBio: true,
  igFollowersCount: true, igFollowsCount: true, igMediaCount: true, lastSyncAt: true,
  profileInsights: { orderBy: { collectedAt: 'desc' }, take: 3, select: {
    followers: true, reach: true, impressions: true, profileViews: true,
    collectedAt: true, availableMetrics: true,
  } },
  publishedPosts: { where: { igMediaId: { not: null } }, orderBy: { publishedAt: 'desc' }, take: 8, select: {
    mediaType: true, caption: true, publishedAt: true,
    insights: { orderBy: { collectedAt: 'desc' }, take: 1, select: {
      likes: true, comments: true, shares: true, saves: true, reach: true,
      impressions: true, engagement: true, collectedAt: true, availableMetrics: true,
    } },
  } },
} satisfies Prisma.InstagramAccountSelect;

type Profile = Prisma.InstagramAccountGetPayload<{ select: typeof aiProfileSelect }>;
const historicalCount = (value: number) => Number.isFinite(value) && value > 0 ? value : null;

// Explicit allowlist: never forward tokens, workspace IDs or unrelated Page data.
export const buildAiProfileContext = (account: Profile) => ({
  sourceNetwork: 'Instagram',
  igUsername: account.igUsername, igName: account.igName, igBio: account.igBio,
  igFollowersCount: historicalCount(account.igFollowersCount),
  igFollowsCount: historicalCount(account.igFollowsCount),
  igMediaCount: historicalCount(account.igMediaCount),
  lastSyncAt: account.lastSyncAt,
  evidenceLimits: [
    'null significa indisponível ou zero histórico sem confirmação, nunca desempenho zero comprovado.',
    'Estes dados são apenas do Instagram; não representam resultados do Facebook ou Threads.',
    'Amostra de até 8 publicações importadas mais recentes, não o feed inteiro nem um período fixo.',
    'Contadores de publicações são acumulados até collectedAt, não interações ocorridas em um intervalo.',
    'Snapshots do perfil não devem ser somados; o período de alcance e impressões não está identificado.',
    'Datas indicam coleta/importação; não são garantia de dados atuais. Não inferir audiência nem melhor horário comprovado.',
  ],
  profileInsights: account.profileInsights.map(row => ({
    collectedAt: row.collectedAt,
    ...Object.fromEntries(['followers', 'reach', 'impressions', 'profileViews'].map(key => [key, metricValue(row, key)])),
  })),
  publishedPosts: account.publishedPosts.map(post => ({
    mediaType: post.mediaType, caption: post.caption, publishedAt: post.publishedAt,
    insights: post.insights.map(row => ({ collectedAt: row.collectedAt, ...normalizedMetrics(row) })),
  })),
});
