import { PrismaClient } from '@prisma/client';
import { graphGet, graphGetAllWithStatus } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';
import { MediaType } from '@prisma/client';
import { maybeNotifyEngagement } from '../notifications.service';
import { publicationPeriod } from '../analytics-period';
import { receivedMetrics, aggregateMetrics } from '../metric-availability';

const prisma = new PrismaClient();

type InsightItem = {
  name?: string;
  values?: Array<{ value?: unknown }>;
  total_value?: { value?: unknown; breakdowns?: Array<{ results?: Array<{ dimension_values?: unknown[]; value?: unknown }> }> };
};

const readInsightValue = (item: InsightItem) => {
  const value = item.values?.[0]?.value ?? item.total_value?.value ?? 0;
  return typeof value === 'number' ? value : Number(value) || 0;
};

/**
 * Meta removes and adds individual insight metrics between Graph API versions.
 * Requesting one obsolete metric together with valid ones makes the whole
 * request fail, which used to hide even likes/reach that were available. Try
 * small groups and keep the metrics that the current app/token actually
 * exposes.
 */
const bestEffortInsights = async (
  objectId: string,
  token: string,
  groups: string[],
  params: Record<string, unknown>,
) => {
  const responses = await Promise.all(groups.map(async (metrics) => {
    try {
      const response = await graphGet(`/${objectId}/insights`, token, { ...params, metric: metrics });
      return Array.isArray(response.data) ? response.data as InsightItem[] : [];
    } catch (error) {
      // A missing permission/metric is expected for some Meta apps. Keep the
      // other groups useful and avoid turning a partial sync into a failure.
      console.warn(`Insights unavailable for ${objectId} (${metrics}):`, error instanceof Error ? error.message : error);
      return [];
    }
  }));

  const unique = new Map<string, InsightItem>();
  responses.flat().forEach((item) => {
    if (item.name) unique.set(item.name, item);
  });
  return Array.from(unique.values());
};

export const getProfileInsights = async (igUserId: string, token: string, period = 'day') => {
  return bestEffortInsights(
    igUserId,
    token,
    [
      'views,reach,accounts_engaged,total_interactions',
      'likes,comments,shares,saves,replies,reposts',
      'follows_and_unfollows',
      'profile_links_taps',
    ],
    { period, metric_type: 'total_value' },
  );
};

export const getPostInsights = async (igMediaId: string, token: string) => {
  return bestEffortInsights(
    igMediaId,
    token,
    [
      // These are the current high-value media metrics. Keeping them in
      // separate groups prevents one unsupported metric from hiding the rest.
      'reach,views',
      'likes,comments,shares',
      'saved,replies',
      'total_interactions',
    ],
    {},
  );
};

export const getAudienceDemographics = async (igUserId: string, token: string, audience: 'followers' | 'engaged' = 'followers') => {
  const metric = audience === 'engaged' ? 'engaged_audience_demographics' : 'follower_demographics';
  const breakdowns = ['gender', 'age', 'country', 'city'];
  const responses = await Promise.all(breakdowns.map(async (breakdown) => {
    try {
      const response = await graphGet(`/${igUserId}/insights`, token, {
        metric,
        period: 'lifetime',
        metric_type: 'total_value',
        timeframe: 'last_30_days',
        breakdown,
      });
      const item = Array.isArray(response.data) ? response.data.find((entry: InsightItem) => entry.name === metric) : null;
      const results = item?.total_value?.breakdowns?.flatMap((group: any) => Array.isArray(group.results) ? group.results : []) || [];
      const values: Record<string, number> = {};
      results.forEach((result: any) => {
        const label = Array.isArray(result.dimension_values) ? result.dimension_values[result.dimension_values.length - 1] : undefined;
        const value = result.value;
        if (typeof label === 'string' && typeof value === 'number' && Number.isFinite(value)) values[label] = (values[label] || 0) + value;
      });
      return Object.keys(values).length ? { name: `${metric}_${breakdown}`, values: [{ value: values }] } : null;
    } catch (error) {
      console.warn(`Audience ${breakdown} unavailable for ${igUserId}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }));
  return responses.filter((item): item is NonNullable<typeof item> => Boolean(item));
};

export const saveProfileSnapshot = async (accountId: string) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const token = await getDecryptedToken(accountId);
  
  // Basic profile data
  const profileData = await graphGet(`/${account.igUserId}`, token, {
    fields: 'followers_count,follows_count,media_count',
  });

  // Insights require the advanced instagram_manage_insights permission. Keep
  // the profile sync useful when that optional permission is not available yet.
  let insights: any[] = [];
  try {
    insights = await getProfileInsights(account.igUserId, token);
  } catch (error) {
    console.error(`Profile insights unavailable for ${account.igUsername}:`, error);
  }
  let reach = 0, views = 0, profileViews = 0;
  
  insights.forEach((insight) => {
    const value = readInsightValue(insight);
    if (insight.name === 'reach') reach = value;
    if (insight.name === 'views') views = value;
    if (insight.name === 'profile_views' || insight.name === 'profile_visits') profileViews = value;
  });

  // When Insights is not available, importing the media should still finish
  // quickly. Calling the Insights endpoint once per post can otherwise leave
  // the account stuck in "Sincronizando" for a long time.
  const mediaSync = await syncAccountMedia(accountId, { fetchInsights: insights.length > 0 });
  const storySync = await syncAccountStories(accountId, { fetchInsights: insights.length > 0, token });
  await prisma.profileInsight.create({
    data: {
      accountId,
      followers: Number(profileData.followers_count || 0),
      following: Number(profileData.follows_count || 0),
      mediaCount: Number(profileData.media_count || 0),
      reach,
      views,
      accountsEngaged: insights.some((insight) => insight.name === 'accounts_engaged') ? readInsightValue(insights.find((insight) => insight.name === 'accounts_engaged') || {}) : null,
      totalInteractions: insights.some((insight) => insight.name === 'total_interactions') ? readInsightValue(insights.find((insight) => insight.name === 'total_interactions') || {}) : null,
      profileLinkTaps: insights.some((insight) => insight.name === 'profile_links_taps') ? readInsightValue(insights.find((insight) => insight.name === 'profile_links_taps') || {}) : null,
      profileViews,
      availableMetrics: receivedMetrics(insights),
    },
  });
  await prisma.instagramAccount.update({
    where: { id: accountId },
    data: {
      igFollowersCount: profileData.followers_count,
      igFollowsCount: profileData.follows_count,
      igMediaCount: profileData.media_count,
      lastSyncAt: new Date(),
    },
  });
  return {
    profileInsightsAvailable: insights.length > 0,
    importedMedia: mediaSync.importedMedia,
    mediaInsightsAvailable: mediaSync.mediaInsightsAvailable,
    removedMedia: mediaSync.removedMedia,
    mediaSnapshotComplete: mediaSync.snapshotComplete,
    storiesAvailable: storySync.available,
    importedStories: storySync.importedStories,
  };
};

const toPublishedMediaType = (mediaType: string): MediaType => {
  if (mediaType === 'VIDEO') return MediaType.REEL;
  if (mediaType === 'CAROUSEL_ALBUM') return MediaType.CAROUSEL;
  return MediaType.IMAGE;
};

export const syncAccountMedia = async (accountId: string, options: { fetchInsights?: boolean } = {}) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) return { importedMedia: 0, mediaInsightsAvailable: false, removedMedia: 0, snapshotComplete: false };

  const token = await getDecryptedToken(accountId);
  const fetchInsights = options.fetchInsights ?? true;
  const snapshot = await graphGetAllWithStatus<any>(`/${account.igUserId}/media`, token, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: 50,
  }, 20);
  const media = snapshot.items;
  let mediaInsightsAvailable = false;

  for (const item of media) {
    const mediaType = toPublishedMediaType(item.media_type);
    const publishedAt = item.timestamp && !Number.isNaN(new Date(item.timestamp).getTime())
      ? new Date(item.timestamp)
      : new Date();
    const post = await prisma.publishedPost.upsert({
      where: { igMediaId: item.id },
      update: {
        accountId,
        instagramDeletedAt: null,
        mediaType,
        caption: item.caption || null,
        igMediaUrl: item.media_url || item.thumbnail_url || null,
        igPermalink: item.permalink || null,
        publishedAt,
      },
      create: {
        accountId,
        igMediaId: item.id,
        mediaType,
        caption: item.caption || null,
        igMediaUrl: item.media_url || item.thumbnail_url || null,
        igPermalink: item.permalink || null,
        publishedAt,
      },
    });

    let reach = 0;
    let impressions = 0;
    let saves = 0;
    let postInsightItems: InsightItem[] = [];
    if (fetchInsights) {
      try {
        postInsightItems = await getPostInsights(item.id, token);
        if (postInsightItems.length) mediaInsightsAvailable = true;
        for (const insight of postInsightItems) {
          const value = readInsightValue(insight);
          if (insight.name === 'reach') reach = value;
          if (insight.name === 'impressions') impressions = value;
          if (insight.name === 'saved') saves = value;
        }
      } catch (error) {
        console.error(`Media insights unavailable for ${item.id}:`, error);
      }
    }

    const viewInsight = postInsightItems.find((insight) => insight.name === 'views');
    const views = viewInsight ? readInsightValue(viewInsight) : null;

    const insightLikes = postInsightItems.find((insight) => insight.name === 'likes');
    const insightComments = postInsightItems.find((insight) => insight.name === 'comments');
    const insightShares = postInsightItems.find((insight) => insight.name === 'shares');
    const likes = Number(item.like_count ?? readInsightValue(insightLikes || {}));
    const comments = Number(item.comments_count ?? readInsightValue(insightComments || {}));
    const shares = Number(readInsightValue(insightShares || {}) || 0);
    const engagement = reach > 0 ? ((likes + comments + saves + shares) / reach) * 100 : 0;
    const availableMetrics = receivedMetrics(postInsightItems);
    if (typeof item.like_count === 'number') availableMetrics.push('likes');
    if (typeof item.comments_count === 'number') availableMetrics.push('comments');
    if (reach > 0 && ['likes', 'comments', 'saves', 'shares'].every(key => availableMetrics.includes(key))) availableMetrics.push('engagement');
    await prisma.postInsight.create({
      data: {
        postId: post.id,
        likes,
        comments,
        shares,
        saves,
        reach,
        impressions,
        views,
        engagement,
        availableMetrics: [...new Set(availableMetrics)],
      },
    });
  }

  // Absence only means deletion when Meta returned every page successfully.
  // Keep recently published posts for 24 hours to avoid hiding content while
  // Meta's media edge is still catching up after publication.
  let removedMedia = 0;
  if (snapshot.complete) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await prisma.publishedPost.updateMany({
      where: {
        accountId,
        mediaType: { not: MediaType.STORY },
        igMediaId: { not: null, notIn: media.map((item) => item.id) },
        instagramDeletedAt: null,
        publishedAt: { lt: cutoff },
      },
      data: { instagramDeletedAt: new Date() },
    });
    removedMedia = result.count;
  }

  return {
    importedMedia: media.length,
    mediaInsightsAvailable,
    removedMedia,
    snapshotComplete: snapshot.complete,
  };
};

export const syncAccountStories = async (accountId: string, options: { fetchInsights?: boolean; token?: string } = {}) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) return { available: false, importedStories: 0 };
  const token = options.token || await getDecryptedToken(accountId);
  let snapshot;
  try {
    snapshot = await graphGetAllWithStatus<any>(`/${account.igUserId}/stories`, token, {
      fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp',
      limit: 50,
    }, 10);
  } catch (error) {
    console.warn(`Active Stories unavailable for ${account.igUsername}:`, error instanceof Error ? error.message : error);
    return { available: false, importedStories: 0 };
  }

  for (const item of snapshot.items) {
    if (typeof item.id !== 'string' || !item.id) continue;
    const publishedAt = item.timestamp && !Number.isNaN(new Date(item.timestamp).getTime()) ? new Date(item.timestamp) : new Date();
    const post = await prisma.publishedPost.upsert({
      where: { igMediaId: item.id },
      update: { accountId, mediaType: MediaType.STORY, caption: null, igMediaUrl: item.media_url || item.thumbnail_url || null, igPermalink: item.permalink || null, publishedAt },
      create: { accountId, igMediaId: item.id, mediaType: MediaType.STORY, caption: null, igMediaUrl: item.media_url || item.thumbnail_url || null, igPermalink: item.permalink || null, publishedAt },
    });

    let insightItems: InsightItem[] = [];
    if (options.fetchInsights !== false) {
      try { insightItems = await getPostInsights(item.id, token); }
      catch (error) { console.warn(`Story insights unavailable for ${item.id}:`, error instanceof Error ? error.message : error); }
    }
    const valueFor = (names: string[]) => {
      const insight = insightItems.find((candidate) => names.includes(candidate.name || ''));
      return insight ? readInsightValue(insight) : null;
    };
    const availableMetrics = receivedMetrics(insightItems);
    const views = valueFor(['views']);
    const reach = valueFor(['reach']);
    await prisma.postInsight.create({
      data: {
        postId: post.id,
        views,
        reach: reach ?? 0,
        likes: valueFor(['likes']) ?? 0,
        comments: valueFor(['comments']) ?? 0,
        replies: valueFor(['replies']),
        shares: valueFor(['shares']) ?? 0,
        saves: valueFor(['saved']) ?? 0,
        impressions: 0,
        engagement: 0,
        availableMetrics,
      },
    });
  }
  return { available: true, importedStories: snapshot.items.length };
};

export const savePostInsights = async (accountId: string) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId }, include: { user: true } });
  if (!account) return;

  const token = await getDecryptedToken(accountId);
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null },
    take: 20,
    orderBy: { publishedAt: 'desc' },
  });

  for (const post of posts) {
    if (!post.igMediaId) continue;
    try {
      const mediaData = await graphGet(`/${post.igMediaId}`, token, {
        fields: 'like_count,comments_count',
      });
      const insights = await getPostInsights(post.igMediaId, token);
      
      let reach = 0, impressions = 0, saves = 0, shares = 0, views: number | null = null, replies: number | null = null;
      let insightLikes = 0, insightComments = 0;
      insights.forEach((i: InsightItem) => {
        const val = readInsightValue(i);
        if (i.name === 'reach') reach = val;
        if (i.name === 'impressions') impressions = val;
        if (i.name === 'saved') saves = val;
        if (i.name === 'shares') shares = val;
        if (i.name === 'likes') insightLikes = val;
        if (i.name === 'comments') insightComments = val;
        if (i.name === 'views') views = val;
        if (i.name === 'replies') replies = val;
      });

      const likes = Number(mediaData.like_count ?? insightLikes);
      const comments = Number(mediaData.comments_count ?? insightComments);
      const engagement = reach > 0 ? ((likes + comments + saves + shares) / reach) * 100 : 0;
      const availableMetrics = receivedMetrics(insights);
      if (typeof mediaData.like_count === 'number') availableMetrics.push('likes');
      if (typeof mediaData.comments_count === 'number') availableMetrics.push('comments');
      if (reach > 0 && ['likes', 'comments', 'saves', 'shares'].every(key => availableMetrics.includes(key))) availableMetrics.push('engagement');

      await prisma.postInsight.create({
        data: {
          postId: post.id,
          likes,
          comments,
          shares,
          saves,
          reach,
          impressions,
          views,
          replies,
          engagement,
          availableMetrics: [...new Set(availableMetrics)],
        },
      });

      await maybeNotifyEngagement({
        userId: account.userId,
        accountId,
        accountUsername: account.igUsername,
        postId: post.id,
        interactions: likes + comments + saves,
      }).catch((notificationError) => {
        console.error(`Could not create engagement notification for ${post.igMediaId}:`, notificationError);
      });
    } catch (e) {
      console.error(`Failed to fetch insights for post ${post.igMediaId}`, e);
    }
  }
};

export const calculateEngagementRate = async (accountId: string) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null },
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
    take: 50,
    orderBy: { publishedAt: 'desc' },
  });
  const metrics = posts.map((post) => post.insights[0]).filter(Boolean);
  if (!metrics.length) return 0;
  return Number((metrics.reduce((total, insight) => total + Number(insight?.engagement || 0), 0) / metrics.length).toFixed(2));
};

export const getBestTimeToPost = async (accountId: string, days = 30) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days) },
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
  });
  const groups = new Map<string, { day: string; hour: number; posts: number; score: number; interactions: number }>();
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (const post of posts) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hour12: false,
    }).formatToParts(post.publishedAt);
    const weekday = parts.find((part) => part.type === 'weekday')?.value || 'Sun';
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 24;
    const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    const key = `${dayIndex}-${hour}`;
    const insight = post.insights[0];
    const interactions = aggregateMetrics([insight || {}]).interactions;
    if (interactions === null) continue;
    const current = groups.get(key) || { day: dayNames[dayIndex] || weekday, hour, posts: 0, score: 0, interactions: 0 };
    current.posts += 1;
    current.interactions += interactions;
    current.score += interactions;
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((item) => ({ ...item, score: Number((item.score / item.posts).toFixed(2)), averageInteractions: Math.round(item.interactions / item.posts) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};

export const getContentTypeAnalysis = async (accountId: string, days = 30) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null }, instagramDeletedAt: null, publishedAt: publicationPeriod(days) },
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
  });
  const groups = new Map<string, typeof posts>();
  for (const post of posts) groups.set(post.mediaType, [...(groups.get(post.mediaType) || []), post]);
  return Array.from(groups.entries()).map(([type, items]) => ({
    type, posts: items.length, ...aggregateMetrics(items.map(post => post.insights[0] || {})),
  })).sort((a, b) => (b.interactions ?? -1) - (a.interactions ?? -1));
};
