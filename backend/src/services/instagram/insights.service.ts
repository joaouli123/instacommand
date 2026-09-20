import { PrismaClient } from '@prisma/client';
import { graphGet } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';
import { MediaType } from '@prisma/client';

const prisma = new PrismaClient();

export const getProfileInsights = async (igUserId: string, token: string, period = 'day') => {
  const metrics = 'impressions,reach,profile_views,website_clicks';
  const response = await graphGet(`/${igUserId}/insights`, token, { metric: metrics, period });
  return response.data;
};

export const getPostInsights = async (igMediaId: string, token: string) => {
  const metrics = 'impressions,reach,engagement,saved,video_views';
  const response = await graphGet(`/${igMediaId}/insights`, token, { metric: metrics });
  return response.data;
};

export const getAudienceDemographics = async (igUserId: string, token: string) => {
  const metrics = 'audience_city,audience_country,audience_gender_age';
  const response = await graphGet(`/${igUserId}/insights`, token, { metric: metrics, period: 'lifetime' });
  return response.data;
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
  
  insights.forEach((insight: any) => {
    const value = insight.values[0]?.value || 0;
    if (insight.name === 'reach') reach = value;
    if (insight.name === 'impressions') impressions = value;
    if (insight.name === 'profile_views') profileViews = value;
  });

  await prisma.profileInsight.create({
    data: {
      accountId,
      followers: profileData.followers_count,
      following: profileData.follows_count,
      mediaCount: profileData.media_count,
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
  const response = await graphGet(`/${account.igUserId}/media`, token, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: 50,
  });
  const media = Array.isArray(response.data) ? response.data : [];
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
    if (fetchInsights) {
      try {
        const insights = await getPostInsights(item.id, token);
        mediaInsightsAvailable = true;
        for (const insight of insights) {
          const value = Number(insight.values?.[0]?.value || 0);
          if (insight.name === 'reach') reach = value;
          if (insight.name === 'impressions') impressions = value;
          if (insight.name === 'saved') saves = value;
        }
      } catch (error) {
        console.error(`Media insights unavailable for ${item.id}:`, error);
      }
    }

    const likes = Number(item.like_count || 0);
    const comments = Number(item.comments_count || 0);
    const engagement = reach > 0 ? ((likes + comments + saves) / reach) * 100 : 0;
    await prisma.postInsight.create({
      data: {
        postId: post.id,
        likes,
        comments,
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
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const token = await getDecryptedToken(accountId);
  const posts = await prisma.publishedPost.findMany({
    where: { accountId },
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
      
      let reach = 0, impressions = 0, saves = 0;
      insights.forEach((i: any) => {
        const val = i.values[0]?.value || 0;
        if (i.name === 'reach') reach = val;
        if (i.name === 'impressions') impressions = val;
        if (i.name === 'saved') saves = val;
      });

      const likes = mediaData.like_count || 0;
      const comments = mediaData.comments_count || 0;
      const engagement = reach > 0 ? ((likes + comments + saves) / reach) * 100 : 0;

      await prisma.postInsight.create({
        data: {
          postId: post.id,
          likes,
          comments,
          saves,
          reach,
          impressions,
          engagement,
        },
      });
    } catch (e) {
      console.error(`Failed to fetch insights for post ${post.igMediaId}`, e);
    }
  }
};

export const calculateEngagementRate = async (accountId: string) => {
  // Logic to calculate overall engagement rate based on recent posts
  return 0; // Placeholder
};

export const getBestTimeToPost = async (accountId: string) => {
  const posts = await prisma.publishedPost.findMany({
    where: { accountId },
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
    const interactions = (insight?.likes || 0) + (insight?.comments || 0) + (insight?.saves || 0);
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
    where: { accountId },
    include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
  });
  const groups = new Map<string, { type: string; posts: number; likes: number; comments: number; saves: number; reach: number; impressions: number; engagement: number }>();
  for (const post of posts) {
    const insight = post.insights[0];
    const current = groups.get(post.mediaType) || { type: post.mediaType, posts: 0, likes: 0, comments: 0, saves: 0, reach: 0, impressions: 0, engagement: 0 };
    current.posts += 1;
    current.likes += insight?.likes || 0;
    current.comments += insight?.comments || 0;
    current.saves += insight?.saves || 0;
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
