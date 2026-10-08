import { getPrisma } from '../lib/prisma';
import { MediaType } from '@prisma/client';
import { analyticsDays, publicationPeriod } from './analytics-period';
import { metricValue, aggregateMetrics, normalizedMetrics } from './metric-availability';

const prisma = getPrisma();

export const getDashboardStats = async (accountId: string, days = 30, now = new Date()) => {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
    include: {
      profileInsights: {
        orderBy: { collectedAt: 'desc' },
        take: 2,
      },
      publishedPosts: {
        where: { igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days, now) },
        include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
        orderBy: { publishedAt: 'desc' },
      },
    }
  });

  if (!account) throw new Error('Account not found');

  // Independent reads run together instead of one after another.
  const [pendingPostsCount, previousPosts, followerComparison] = await Promise.all([
    prisma.scheduledPost.count({ where: { accountId, status: 'SCHEDULED' } }),
    // Posts published in the same-length window right before, already stored (no Meta call).
    days <= 90 ? prisma.publishedPost.findMany({
      where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days, new Date(now.getTime() - days * 86_400_000)) },
      include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
    }) : Promise.resolve(null),
    getFollowerComparison(accountId, days, now).catch(() => null),
  ]);

  const latestInsight = account.profileInsights[0];
  const previousInsight = account.profileInsights[1];

  const followerGrowth = previousInsight && latestInsight
    ? latestInsight.followers - previousInsight.followers
    : null;
  const totals = aggregateMetrics(account.publishedPosts.map(post => post.insights[0] || {}));
  const previousTotals = previousPosts ? aggregateMetrics(previousPosts.map(post => post.insights[0] || {})) : null;

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
    followerPeriod: followerComparison?.current ?? null,
    previous: previousTotals ? {
      interactions: previousPosts!.length ? previousTotals.interactions : null,
      engagementRate: previousTotals.engagement == null ? null : Number(previousTotals.engagement.toFixed(2)),
      followers: followerComparison?.previous ?? null,
    } : null,
  };
};

export type GrowthPoint = {
  date: string;
  followers: number | null;
  // True when the total was reconstructed from Meta's daily follows/unfollows,
  // not observed by a sync on that day.
  followersEstimated: boolean;
  followsGained: number | null;
  followsLost: number | null;
  reach: number | null;
  views: number | null;
  accountsEngaged: number | null;
  interactions: number | null;
};

const saoPauloDay = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(date);
const previousDay = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
};

export const getGrowthData = async (accountId: string, days = 30, now = new Date()): Promise<GrowthPoint[]> =>
  loadGrowth(accountId, publicationPeriod(days, now), now);

export type FollowerWindow = { since: string; until: string; start: number | null; end: number | null; net: number | null; gained: number | null; lost: number | null };

const sumKnown = (values: Array<number | null>) => { const known = values.filter((v): v is number => v !== null); return known.length ? known.reduce((a, b) => a + b, 0) : null; };

/** Net change and daily follows/unfollows of one window, from stored points only (null when there is no history). */
export const summarizeFollowerWindow = (points: GrowthPoint[], since: string, until: string): FollowerWindow => {
  const inside = points.filter((p) => p.date >= since && p.date <= until);
  const totals = inside.filter((p) => p.followers !== null);
  const start = totals[0]?.followers ?? null;
  const end = totals.at(-1)?.followers ?? null;
  return { since, until, start, end, net: totals.length > 1 ? end! - start! : null,
    gained: sumKnown(inside.map((p) => p.followsGained)), lost: sumKnown(inside.map((p) => p.followsLost)) };
};

const shiftDay = (day: string, delta: number) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10); };

/**
 * Follower growth in the period and in the same-length period right before it,
 * read from one stored series (snapshots + Meta daily rows), so no Meta call.
 * Long ranges (over 90 days) are not compared, like the other reports.
 */
export const getFollowerComparison = async (accountId: string, days = 30, now = new Date()) => {
  analyticsDays(days);
  const until = saoPauloDay(now);
  const since = saoPauloDay(new Date(now.getTime() - days * 86_400_000));
  if (days > 90) {
    return { current: summarizeFollowerWindow(await getGrowthData(accountId, days, now), since, until), previous: null };
  }
  const points = await loadGrowth(accountId, { gte: new Date(now.getTime() - 2 * days * 86_400_000), lte: now }, now);
  const previousUntil = shiftDay(since, -1);
  const previousSince = saoPauloDay(new Date(now.getTime() - 2 * days * 86_400_000));
  const previous = summarizeFollowerWindow(points, previousSince, previousUntil);
  const current = summarizeFollowerWindow(points, since, until);
  return { current, previous };
};

const loadGrowth = async (accountId: string, period: { gte: Date; lte: Date }, now: Date): Promise<GrowthPoint[]> => {
  const startDay = saoPauloDay(period.gte);
  const today = saoPauloDay(now);
  const [insights, dailyRows, account] = await Promise.all([
    prisma.profileInsight.findMany({ where: { accountId, collectedAt: period }, orderBy: { collectedAt: 'asc' } }),
    prisma.accountDailyInsight.findMany({ where: { accountId, date: { gte: startDay, lte: today } }, orderBy: { date: 'asc' } }),
    prisma.instagramAccount.findUnique({ where: { id: accountId }, select: { igFollowersCount: true } }),
  ]);

  // The worker may collect several snapshots in one day. Keep the latest
  // real snapshot per calendar day so the chart does not repeat dates.
  const observed = new Map<string, { followers: number; reach: number | null; views: number | null; interactions: number | null }>();
  for (const insight of insights) {
    observed.set(saoPauloDay(insight.collectedAt), {
      followers: insight.followers,
      reach: metricValue(insight, 'reach'),
      views: metricValue(insight, 'views'),
      interactions: metricValue(insight, 'totalInteractions'),
    });
  }
  const daily = new Map(dailyRows.map((row) => [row.date, row]));

  // Before the first observation, walk back day by day: the total at the end
  // of the previous day is this day's total minus this day's net follows.
  // Stops at the first day Meta did not report follows for (no guessing).
  const estimated = new Map<string, number>();
  const firstObserved = [...observed.keys()].sort()[0];
  let anchorDay = firstObserved ?? today;
  let followers = firstObserved ? observed.get(firstObserved)!.followers : account?.igFollowersCount ?? null;
  if (followers !== null) {
    while (anchorDay > startDay) {
      const row = daily.get(anchorDay);
      if (!row || row.followsGained === null || row.followsLost === null) break;
      followers = Math.max(0, followers - (row.followsGained - row.followsLost));
      anchorDay = previousDay(anchorDay);
      if (!observed.has(anchorDay)) estimated.set(anchorDay, followers);
    }
  }

  const dates = [...new Set([...observed.keys(), ...daily.keys(), ...estimated.keys()])]
    .filter((date) => date >= startDay && date <= today)
    .sort();
  return dates.map((date) => {
    const seen = observed.get(date);
    const row = daily.get(date);
    return {
      date,
      followers: seen?.followers ?? estimated.get(date) ?? null,
      followersEstimated: !seen && estimated.has(date),
      followsGained: row?.followsGained ?? null,
      followsLost: row?.followsLost ?? null,
      // Meta's value for the whole day wins over a sync's rolling 24-hour reading.
      reach: row?.reach ?? seen?.reach ?? null,
      views: row?.views ?? seen?.views ?? null,
      accountsEngaged: row?.accountsEngaged ?? null,
      interactions: row?.totalInteractions ?? seen?.interactions ?? null,
    };
  });
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

  const recommendations: Array<{ type: string; message: string; basedOn: number; title?: string; highlight?: string }> = [];
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
  const formatName: Record<string, string> = { IMAGE: 'Imagens', CAROUSEL: 'Carrosséis', CAROUSEL_ALBUM: 'Carrosséis', REEL: 'Reels', VIDEO: 'Vídeos', STORY: 'Stories', TEXT: 'Posts de texto' };
  const ranked = Array.from(byType.entries())
    .map(([type, value]) => ({ type, posts: value.posts, average: value.posts ? value.interactions / value.posts : 0 }))
    .sort((a, b) => b.average - a.average);
  const [best, runnerUp] = ranked;
  if (best) {
    const name = formatName[best.type] || best.type;
    const average = Math.round(best.average).toLocaleString('pt-BR');
    // Only claim "X% more" against a real second format with interactions.
    const lift = runnerUp && runnerUp.average > 0 ? Math.round((best.average / runnerUp.average - 1) * 100) : null;
    recommendations.push({
      type: 'FORMAT',
      title: `${name} engajam mais`,
      highlight: lift !== null && lift > 0 ? `+${lift}%` : undefined,
      message: lift !== null && lift > 0
        ? `Nos últimos ${days} dias, ${name.toLowerCase()} tiveram em média ${average} interações por post, ${lift}% a mais que ${(formatName[runnerUp.type] || runnerUp.type).toLowerCase()}. Vale priorizar esse formato e acompanhar se o resultado se mantém.`
        : `Nos últimos ${days} dias, ${name.toLowerCase()} tiveram em média ${average} interações por post. Publique outros formatos também para ter com o que comparar.`,
      basedOn: best.posts,
    });
  }

  return recommendations;
};
