import { PrismaClient } from '@prisma/client';
import { graphGet } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';

const prisma = new PrismaClient();

export const getCompetitorProfile = async (igUserId: string, competitorUsername: string, token: string) => {
  const fields = 'business_discovery.username(' + competitorUsername + '){username,website,name,ig_id,id,profile_picture_url,biography,follows_count,followers_count,media_count}';
  const response = await graphGet(`/${igUserId}`, token, { fields });
  return response.business_discovery;
};

export const getCompetitorRecentPosts = async (igUserId: string, competitorUsername: string, token: string, limit = 10) => {
  const fields = `business_discovery.username(${competitorUsername}){media.limit(${limit}){id,caption,media_url,permalink,timestamp,media_type,comments_count,like_count}}`;
  const response = await graphGet(`/${igUserId}`, token, { fields });
  return response.business_discovery?.media?.data || [];
};

export const addCompetitor = async (accountId: string, igUsername: string) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Account not found');

  const token = await getDecryptedToken(accountId);
  const profile = await getCompetitorProfile(account.igUserId, igUsername, token);

  if (!profile) throw new Error('Competitor not found');

  return prisma.competitor.create({
    data: {
      accountId,
      igUsername: profile.username,
      igName: profile.name,
      igProfilePicUrl: profile.profile_picture_url,
      igBio: profile.biography,
      igFollowersCount: profile.followers_count,
      igMediaCount: profile.media_count,
    },
  });
};

export const removeCompetitor = async (competitorId: string) => {
  return prisma.competitor.delete({ where: { id: competitorId } });
};

export const collectCompetitorData = async (competitorId: string) => {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { account: true },
  });
  if (!competitor) return;

  const token = await getDecryptedToken(competitor.account.id);
  const profile = await getCompetitorProfile(competitor.account.igUserId, competitor.igUsername, token);
  const recentPosts = await getCompetitorRecentPosts(competitor.account.igUserId, competitor.igUsername, token);

  let totalLikes = 0;
  let totalComments = 0;
  
  recentPosts.forEach((post: any) => {
    totalLikes += post.like_count || 0;
    totalComments += post.comments_count || 0;
  });

  const avgLikes = recentPosts.length ? Math.round(totalLikes / recentPosts.length) : 0;
  const avgComments = recentPosts.length ? Math.round(totalComments / recentPosts.length) : 0;
  const engagementRate = profile.followers_count ? ((avgLikes + avgComments) / profile.followers_count) * 100 : 0;

  await prisma.competitor.update({
    where: { id: competitorId },
    data: {
      igFollowersCount: profile.followers_count,
      igMediaCount: profile.media_count,
    },
  });

  await prisma.competitorInsight.create({
    data: {
      competitorId,
      followers: profile.followers_count,
      mediaCount: profile.media_count,
      avgLikes,
      avgComments,
      engagementRate,
      recentPostsData: recentPosts,
    },
  });
};
