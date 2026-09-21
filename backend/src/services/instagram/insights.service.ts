import { PrismaClient } from '@prisma/client';
import { graphGet, graphGetAll } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';
import { MediaType } from '@prisma/client';
import { maybeNotifyEngagement } from '../notifications.service';

const prisma = new PrismaClient();

type InsightItem = {
  name?: string;
  values?: Array<{ value?: unknown }>;
  total_value?: { value?: unknown };
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
      'reach,impressions',
      'profile_views',
      'website_clicks',
      'email_contacts',
      'phone_call_clicks',
      'follows',
      'profile_activity',
    ],
    { period },
  );
};

export const getPostInsights = async (igMediaId: string, token: string) => {
  return bestEffortInsights(
    igMediaId,
    token,
    [
      // These are the current high-value media metrics. Keeping them in
      // separate groups prevents one unsupported metric from hiding the rest.
      'impressions,reach,saved',
      'total_interactions,likes,comments,shares',
      // Video accounts may expose one of these names depending on media type.
      'plays,video_views',
    ],
    {},
  );
};

export const getAudienceDemographics = async (igUserId: string, token: string) => {
  return bestEffortInsights(
    igUserId,
    token,
    ['audience_city', 'audience_country', 'audience_gender_age'],
    { period: 'lifetime' },
  );
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
  let reach = 0, impressions = 0, profileViews = 0;
  
  insights.forEach((insight) => {
    const value = readInsightValue(insight);
    if (insight.name === 'reach') reach = value;
    if (insight.name === 'impressions') impressions = value;
    if (insight.name === 'profile_views' || insight.name === 'profile_visits') profileViews = value;
  });

  await prisma.profileInsight.create({
    data: {
      accountId,
      followers: Number(profileData.followers_count || 0),
      following: Number(profileData.follows_count || 0),
      mediaCount: Number(profileData.media_count || 0),
      reach,
      impressions,
      profileViews,
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

  // When Insights is not available, importing the media should still finish
  // quickly. Calling the Insights endpoint once per post can otherwise leave
  // the account stuck in "Sincronizando" for a long time.
  const mediaSync = await syncAccountMedia(accountId, { fetchInsights: insights.length > 0 });
  return {
    profileInsightsAvailable: insights.length > 0,
    importedMedia: mediaSync.importedMedia,
    mediaInsightsAvailable: mediaSync.mediaInsightsAvailable,
  };
};

const toPublishedMediaType = (mediaType: string): MediaType => {
  if (mediaType === 'VIDEO') return MediaType.REEL;
  if (mediaType === 'CAROUSEL_ALBUM') return MediaType.CAROUSEL;
  return MediaType.IMAGE;
};

export const syncAccountMedia = async (accountId: string, options: { fetchInsights?: boolean } = {}) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) return { importedMedia: 0, mediaInsightsAvailable: false };

  const token = await getDecryptedToken(accountId);
  const fetchInsights = options.fetchInsights ?? true;
  const media = await graphGetAll<any>(`/${account.igUserId}/media`, token, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: 50,
  }, 20);
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

    const insightLikes = postInsightItems.find((insight) => insight.name === 'likes');
    const insightComments = postInsightItems.find((insight) => insight.name === 'comments');
    const insightShares = postInsightItems.find((insight) => insight.name === 'shares');
    const likes = Number(item.like_count || readInsightValue(insightLikes || {}) || 0);
    const comments = Number(item.comments_count || readInsightValue(insightComments || {}) || 0);
    const shares = Number(readInsightValue(insightShares || {}) || 0);
    const engagement = reach > 0 ? ((likes + comments + saves + shares) / reach) * 100 : 0;
    await prisma.postInsight.create({
      data: {
        postId: post.id,
        likes,
        comments,
        shares,
        saves,
        reach,
        impressions,
        engagement,
      },
    });
  }

  return { importedMedia: media.length, mediaInsightsAvailable };
};

export const savePostInsights = async (accountId: string) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId }, include: { user: true } });
  if (!account) return;

  const token = await getDecryptedToken(accountId);
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null } },
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
      
      let reach = 0, impressions = 0, saves = 0, shares = 0;
      let insightLikes = 0, insightComments = 0;
      insights.forEach((i: InsightItem) => {
        const val = readInsightValue(i);
        if (i.name === 'reach') reach = val;
        if (i.name === 'impressions') impressions = val;
        if (i.name === 'saved') saves = val;
        if (i.name === 'shares') shares = val;
        if (i.name === 'likes') insightLikes = val;
        if (i.name === 'comments') insightComments = val;
      });

      const likes = Number(mediaData.like_count || insightLikes || 0);
      const comments = Number(mediaData.comments_count || insightComments || 0);
      const engagement = reach > 0 ? ((likes + comments + saves + shares) / reach) * 100 : 0;

      await prisma.postInsight.create({
        data: {
          postId: post.id,
          likes,
          comments,
          shares,
          saves,
          reach,
          impressions,
          engagement,
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
    where: { accountId, igMediaId: { not: null } },
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
    take: 50,
    orderBy: { publishedAt: 'desc' },
  });
  const metrics = posts.map((post) => post.insights[0]).filter(Boolean);
  if (!metrics.length) return 0;
  return Number((metrics.reduce((total, insight) => total + Number(insight?.engagement || 0), 0) / metrics.length).toFixed(2));
};

export const getBestTimeToPost = async (accountId: string) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null } },
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
    const interactions = (insight?.likes || 0) + (insight?.comments || 0) + (insight?.saves || 0) + (insight?.shares || 0);
    const current = groups.get(key) || { day: dayNames[dayIndex] || weekday, hour, posts: 0, score: 0, interactions: 0 };
    current.posts += 1;
    current.interactions += interactions;
    current.score += insight?.reach ? insight.engagement : interactions;
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((item) => ({ ...item, score: Number((item.score / item.posts).toFixed(2)), averageInteractions: Math.round(item.interactions / item.posts) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};

export const getContentTypeAnalysis = async (accountId: string) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId, igMediaId: { not: null } },
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
  });
  const groups = new Map<string, { type: string; posts: number; likes: number; comments: number; saves: number; shares: number; reach: number; impressions: number; engagement: number }>();
  for (const post of posts) {
    const insight = post.insights[0];
    const current = groups.get(post.mediaType) || { type: post.mediaType, posts: 0, likes: 0, comments: 0, saves: 0, shares: 0, reach: 0, impressions: 0, engagement: 0 };
    current.posts += 1;
    current.likes += insight?.likes || 0;
    current.comments += insight?.comments || 0;
    current.saves += insight?.saves || 0;
    current.shares += insight?.shares || 0;
    current.reach += insight?.reach || 0;
    current.impressions += insight?.impressions || 0;
    current.engagement += insight?.engagement || 0;
    groups.set(post.mediaType, current);
  }
  return Array.from(groups.values()).map((item) => ({
    ...item,
    engagement: item.posts ? Number((item.engagement / item.posts).toFixed(2)) : 0,
  })).sort((a, b) => b.likes + b.comments - (a.likes + a.comments));
};
