import { PrismaClient } from '@prisma/client';
import { graphGet } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';

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

  // Insights
  const insights = await getProfileInsights(account.igUserId, token);
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
  return []; // Placeholder
};

export const getContentTypeAnalysis = async (accountId: string) => {
  return {}; // Placeholder
};
