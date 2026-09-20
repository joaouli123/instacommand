import { PrismaClient } from '@prisma/client';
import { graphGet } from '../utils/instagram-api';
import { getDecryptedToken } from './instagram/auth.service';

const prisma = new PrismaClient();

export const searchHashtag = async (hashtag: string, accountId: string) => {
  const account = await prisma.instagramAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Account not found');

  const token = await getDecryptedToken(accountId);
  
  // Clean hashtag (remove #)
  const cleanHashtag = hashtag.replace('#', '');

  // 1. Get hashtag ID
  const idSearch = await graphGet('/ig_hashtag_search', token, {
    user_id: account.igUserId,
    q: cleanHashtag,
  });

  const igHashtagId = idSearch.data[0]?.id;
  if (!igHashtagId) throw new Error('Hashtag not found');

  const mediaParams = {
    user_id: account.igUserId,
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: 25,
  };
  const [topResponse, recentResponse] = await Promise.all([
    graphGet(`/${igHashtagId}/top_media`, token, mediaParams),
    graphGet(`/${igHashtagId}/recent_media`, token, mediaParams),
  ]);
  const topMedia = Array.isArray(topResponse.data) ? topResponse.data : [];
  const recentMedia = Array.isArray(recentResponse.data) ? recentResponse.data : [];

  return {
    igHashtagId,
    topMediaCount: topMedia.length,
    recentMediaCount: recentMedia.length,
    topMedia,
    recentMedia,
    searchedAt: new Date().toISOString(),
  };
};

export const saveHashtagSearch = async (accountId: string, hashtag: string, data: any) => {
  return prisma.hashtagSearch.create({
    data: {
      accountId,
      hashtag: hashtag.replace('#', ''),
      igHashtagId: data.igHashtagId,
      topMediaCount: Number(data.topMediaCount || 0),
      recentMediaCount: Number(data.recentMediaCount || 0),
    },
  });
};

export const getHashtagInsights = async (hashtagId: string, accountId: string) => {
  return prisma.hashtagSearch.findUnique({ where: { id: hashtagId } });
};

export const getSavedHashtags = async (accountId: string) => {
  return prisma.hashtagSearch.findMany({
    where: { accountId },
    orderBy: { lastSearchedAt: 'desc' },
  });
};
