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

const normalizeUsername = (value: string) => value.trim().replace(/^@/, '').toLowerCase();

export const addCompetitor = async (accountId: string, userId: string, igUsername: string) => {
  const username = normalizeUsername(igUsername);
  const account = await prisma.instagramAccount.findFirst({ where: { id: accountId, userId, isActive: true } });
  if (!account) throw new Error('Account not found');

  if (!/^[a-z0-9._]{1,30}$/.test(username)) {
    throw new Error('Informe um @username válido do Instagram.');
  }

  const token = await getDecryptedToken(accountId);
  const profile = await getCompetitorProfile(account.igUserId, username, token);

  if (!profile) throw new Error('Competitor not found');

  const existing = await prisma.competitor.findUnique({
    where: { accountId_igUsername: { accountId, igUsername: profile.username } },
  });
  if (existing) throw new Error('Este concorrente já está sendo monitorado.');

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

export const removeCompetitor = async (competitorId: string, userId: string) => {
  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, account: { userId } },
    select: { id: true },
  });
  if (!competitor) throw new Error('Competitor not found');
  return prisma.competitor.delete({ where: { id: competitor.id } });
};

export const collectCompetitorData = async (competitorId: string, userId: string) => {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { account: true },
  });
  if (!competitor || competitor.account.userId !== userId || !competitor.account.isActive) throw new Error('Competitor not found');

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
