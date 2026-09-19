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
    }
  });

  if (!account) throw new Error('Account not found');

  const pendingPostsCount = await prisma.scheduledPost.count({
    where: { accountId, status: 'SCHEDULED' }
  });

  const latestInsight = account.profileInsights[0];
  const previousInsight = account.profileInsights[1];

  const followerGrowth = previousInsight ? (latestInsight?.followers || 0) - previousInsight.followers : 0;

  return {
    followers: latestInsight?.followers || account.igFollowersCount,
    followerGrowth,
    reach: latestInsight?.reach || 0,
    impressions: latestInsight?.impressions || 0,
    pendingPosts: pendingPostsCount,
  };
};

export const getGrowthData = async (accountId: string, days = 30) => {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const insights = await prisma.profileInsight.findMany({
    where: { accountId, collectedAt: { gte: dateFrom } },
    orderBy: { collectedAt: 'asc' },
  });

  return insights.map(i => ({
    date: i.collectedAt,
    followers: i.followers,
  }));
};

export const getEngagementTimeSeries = async (accountId: string, days = 30) => {
  // Mock logic - would aggregate post insights by day
  return [];
};

export const getTopPosts = async (accountId: string, limit = 5, sortBy = 'engagement') => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId },
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
    where: { accountId },
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

  const total = await prisma.publishedPost.count({ where: { accountId } });

  return {
    data: posts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

export const getRecommendations = async (accountId: string) => {
  return [
    { type: 'TIME', message: 'Posting at 6 PM gives you 20% more engagement.' },
    { type: 'FORMAT', message: 'Reels are performing 3x better than carousels.' }
  ];
};
