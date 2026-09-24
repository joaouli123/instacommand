import { MediaType, PrismaClient } from '@prisma/client';
import { publicationPeriod } from './analytics-period';
import { metricValue, aggregateMetrics, normalizedMetrics } from './metric-availability';

const prisma = new PrismaClient();

export const getDashboardStats = async (accountId: string, days = 30) => {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
    include: {
      profileInsights: {
        orderBy: { collectedAt: 'desc' },
        take: 2,
      },
      publishedPosts: {
        where: { igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days) },
        include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
        orderBy: { publishedAt: 'desc' },
      },
    }
  });

  if (!account) throw new Error('Account not found');

  const pendingPostsCount = await prisma.scheduledPost.count({
    where: { accountId, status: 'SCHEDULED' }
  });

  const latestInsight = account.profileInsights[0];
  const previousInsight = account.profileInsights[1];

  const followerGrowth = previousInsight && latestInsight
    ? latestInsight.followers - previousInsight.followers
    : null;
  const totals = aggregateMetrics(account.publishedPosts.map(post => post.insights[0] || {}));

  return {
    followers: latestInsight?.followers ?? account.igFollowersCount,
    followerGrowth,
    hasFollowerHistory: Boolean(previousInsight && latestInsight),
    reach: metricValue(latestInsight, 'reach'),
    views: metricValue(latestInsight, 'views'),
    impressions: metricValue(latestInsight, 'impressions'),
    accountsEngaged: metricValue(latestInsight, 'accountsEngaged'),
    profileLinkTaps: metricValue(latestInsight, 'profileLinkTaps'),
    interactions: totals.interactions,
    interactionsPartial: totals.partial,
    metricScope: 'latest-profile-snapshot; lifetime-counters-of-posts-published-in-period',
    profileCollectedAt: latestInsight?.collectedAt ?? null,
    pendingPosts: pendingPostsCount,
    engagementRate: totals.engagement === null ? null : Number(totals.engagement?.toFixed(2)),
  };
};

export const getGrowthData = async (accountId: string, days = 30) => {
  const insights = await prisma.profileInsight.findMany({
    where: { accountId, collectedAt: publicationPeriod(days) },
    orderBy: { collectedAt: 'asc' },
  });

  // The worker may collect several snapshots in one day. Keep the latest
  // real snapshot per calendar day so the chart does not repeat dates.
  const byDay = new Map<string, { date: string; followers: number; reach: number | null; views: number | null; interactions: number | null }>();
  for (const insight of insights) {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(insight.collectedAt);
    byDay.set(day, {
      date: day,
      followers: insight.followers,
      reach: metricValue(insight, 'reach'),
      views: metricValue(insight, 'views'),
      interactions: metricValue(insight, 'totalInteractions'),
    });
  }
  return Array.from(byDay.values());
};

export const getEngagementTimeSeries = async (accountId: string, days = 30) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days) },
    orderBy: { publishedAt: 'asc' },
    include: {
      insights: { orderBy: { collectedAt: 'desc' }, take: 1 },
    },
  });

  const grouped = new Map<string, typeof posts>();
  for (const post of posts) {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(post.publishedAt);
    grouped.set(date, [...(grouped.get(date) || []), post]);
  }
  return Array.from(grouped.entries()).map(([date, items]) => ({
    date, posts: items.length,
    ...aggregateMetrics(items.map(post => post.insights[0] || {})),
  }));
};

export const getTopPosts = async (accountId: string, limit = 20, sortBy = 'interactions', days = 30, mediaType?: MediaType | MediaType[]) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days), ...(mediaType ? { mediaType: Array.isArray(mediaType) ? { in: mediaType } : mediaType } : {}) },
    include: {
      insights: {
        orderBy: { collectedAt: 'desc' },
        take: 1,
      }
    }
  });

  const processed = posts.map(p => {
    const insight = p.insights[0];
    const latestInsight = normalizedMetrics(insight);
    const interactions = aggregateMetrics([insight || {}]);
    const storyReplies = p.mediaType === MediaType.STORY ? metricValue(insight, 'replies') : null;
    const interactionScore = interactions.interactions === null && storyReplies === null
      ? null
      : (interactions.interactions || 0) + (storyReplies || 0);
    return {
      ...p,
      metrics: { ...latestInsight, interactions: interactionScore, interactionsPartial: interactions.partial || (p.mediaType === MediaType.STORY && storyReplies !== null), replies: storyReplies, coverage: interactions.coverage },
    };
  });

  const ranked = processed.map((post) => ({
    post,
    score: post.metrics[sortBy as keyof typeof post.metrics] as number | null,
  })).filter((row): row is { post: typeof processed[number]; score: number } => row.score !== null && typeof row.score === 'number');
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map((row) => ({ ...row.post, score: row.score }));
};

export const getPostPerformanceTable = async (accountId: string, page = 1, limit = 10, days = 30) => {
  const skip = (page - 1) * limit;
  const where = { accountId, igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days) };
  const posts = await prisma.publishedPost.findMany({
    where,
    skip,
    take: limit,
    orderBy: { publishedAt: 'desc' },
    include: {
      insights: {
        orderBy: { collectedAt: 'desc' },
        take: 1,
      }
    }
  });

  const total = await prisma.publishedPost.count({ where });

  return {
    data: posts.map(post => ({ ...post, insights: post.insights.map(insight => ({ ...insight, ...normalizedMetrics(insight) })) })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

export const getRecommendations = async (accountId: string, days = 30) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days) },
    orderBy: { publishedAt: 'desc' },
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
  });

  if (!posts.length) return [];

  const recommendations: Array<{ type: string; message: string; basedOn: number }> = [];
  const withReach = posts.filter((post) => (post.insights[0]?.reach || 0) > 0);
  if (!withReach.length) {
    recommendations.push({
      type: 'DATA',
      message: 'Não há alcance positivo registrado nas publicações deste período. Isso, por si só, não confirma uma restrição de permissão.',
      basedOn: posts.length,
    });
  }

  const byType = new Map<string, { posts: number; interactions: number }>();
  for (const post of posts) {
    const interactions = aggregateMetrics([post.insights[0] || {}]).interactions;
    if (interactions === null) continue;
    const current = byType.get(post.mediaType) || { posts: 0, interactions: 0 };
    current.posts += 1;
    current.interactions += interactions;
    byType.set(post.mediaType, current);
  }
  const bestType = Array.from(byType.entries()).sort(([, a], [, b]) => {
    const scoreA = a.posts ? a.interactions / a.posts : 0;
    const scoreB = b.posts ? b.interactions / b.posts : 0;
    return scoreB - scoreA;
  })[0];
  if (bestType) {
    recommendations.push({
      type: 'FORMAT',
      message: `${bestType[0]} tem mais interações médias registradas nas publicações dos últimos ${days} dias (${Math.round(bestType[1].interactions / bestType[1].posts).toLocaleString('pt-BR')} por publicação). A amostra não garante resultados futuros.`,
      basedOn: bestType[1].posts,
    });
  }

  return recommendations;
};
