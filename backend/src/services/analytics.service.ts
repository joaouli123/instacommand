import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getDashboardStats = async (accountId: string) => {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
    include: {
      profileInsights: {
        orderBy: { collectedAt: 'desc' },
        take: 2,
      },
      publishedPosts: {
        where: { igMediaId: { not: null } },
        include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
        orderBy: { publishedAt: 'desc' },
        take: 30,
      },
    }
  });

  if (!account) throw new Error('Account not found');

  const pendingPostsCount = await prisma.scheduledPost.count({
    where: { accountId, status: 'SCHEDULED' }
  });

  const latestInsight = account.profileInsights[0];
  const previousInsight = account.profileInsights[1];

  const followerGrowth = previousInsight ? (latestInsight?.followers || 0) - previousInsight.followers : 0;
  const postsWithMetrics = account.publishedPosts.map((post) => post.insights[0]).filter(Boolean);
  const engagementRate = postsWithMetrics.length
    ? postsWithMetrics.reduce((total, insight) => total + Number(insight?.engagement || 0), 0) / postsWithMetrics.length
    : 0;

  return {
    followers: latestInsight?.followers || account.igFollowersCount,
    followerGrowth,
    reach: latestInsight?.reach || 0,
    impressions: latestInsight?.impressions || 0,
    pendingPosts: pendingPostsCount,
    engagementRate: Number(engagementRate.toFixed(2)),
  };
};

export const getGrowthData = async (accountId: string, days = 30) => {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const insights = await prisma.profileInsight.findMany({
    where: { accountId, collectedAt: { gte: dateFrom } },
    orderBy: { collectedAt: 'asc' },
  });

  // The worker may collect several snapshots in one day. Keep the latest
  // real snapshot per calendar day so the chart does not repeat dates.
  const byDay = new Map<string, { date: Date; followers: number }>();
  for (const insight of insights) {
    const day = insight.collectedAt.toISOString().slice(0, 10);
    byDay.set(day, { date: insight.collectedAt, followers: insight.followers });
  }
  return Array.from(byDay.values()).map((item) => ({
    date: item.date,
    followers: item.followers,
  }));
};

export const getEngagementTimeSeries = async (accountId: string, days = 30) => {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, publishedAt: { gte: dateFrom } },
    orderBy: { publishedAt: 'asc' },
    include: {
      insights: { orderBy: { collectedAt: 'desc' }, take: 1 },
    },
  });

  const grouped = new Map<string, {
    date: string;
    likes: number;
    comments: number;
    saves: number;
    reach: number;
    impressions: number;
    engagement: number;
    posts: number;
  }>();

  for (const post of posts) {
    const date = post.publishedAt.toISOString().slice(0, 10);
    const insight = post.insights[0];
    const current = grouped.get(date) || {
      date,
      likes: 0,
      comments: 0,
      saves: 0,
      reach: 0,
      impressions: 0,
      engagement: 0,
      posts: 0,
    };
    current.likes += insight?.likes || 0;
    current.comments += insight?.comments || 0;
    current.saves += insight?.saves || 0;
    current.reach += insight?.reach || 0;
    current.impressions += insight?.impressions || 0;
    current.engagement += insight?.engagement || 0;
    current.posts += 1;
    grouped.set(date, current);
  }

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    engagement: item.posts ? Number((item.engagement / item.posts).toFixed(2)) : 0,
  }));
};

export const getTopPosts = async (accountId: string, limit = 5, sortBy = 'engagement') => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null } },
    include: {
      insights: {
        orderBy: { collectedAt: 'desc' },
        take: 1,
      }
    }
  });

  const processed = posts.map(p => {
    const latestInsight = p.insights[0] || { engagement: 0, likes: 0, comments: 0 };
    return {
      ...p,
      metrics: latestInsight,
    };
  });

  processed.sort((a, b) => {
    const valA = Number(a.metrics[sortBy as keyof typeof a.metrics]) || 0;
    const valB = Number(b.metrics[sortBy as keyof typeof b.metrics]) || 0;
    return valB - valA;
  });
  return processed.slice(0, limit);
};

export const getPostPerformanceTable = async (accountId: string, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null } },
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

  const total = await prisma.publishedPost.count({ where: { accountId, igMediaId: { not: null } } });

  return {
    data: posts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

export const getRecommendations = async (accountId: string) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null } },
    orderBy: { publishedAt: 'desc' },
    take: 50,
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
  });

  if (!posts.length) return [];

  const recommendations: Array<{ type: string; message: string; basedOn: number }> = [];
  const withReach = posts.filter((post) => (post.insights[0]?.reach || 0) > 0);
  if (!withReach.length) {
    recommendations.push({
      type: 'DATA',
      message: 'A Meta ainda não liberou Alcance e Impressões para este token. Likes e comentários já estão sendo acompanhados.',
      basedOn: posts.length,
    });
  }

  const byType = new Map<string, { posts: number; interactions: number }>();
  for (const post of posts) {
    const current = byType.get(post.mediaType) || { posts: 0, interactions: 0 };
    current.posts += 1;
    current.interactions += (post.insights[0]?.likes || 0) + (post.insights[0]?.comments || 0) + (post.insights[0]?.saves || 0);
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
      message: `${bestType[0]} é o formato com mais interações médias no histórico importado (${Math.round(bestType[1].interactions / bestType[1].posts).toLocaleString('pt-BR')} por publicação).`,
      basedOn: bestType[1].posts,
    });
  }

  return recommendations;
};
