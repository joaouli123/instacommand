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

  // 2. We can't directly get media count, but we could fetch top/recent media and count, etc.
  // For now, we mock the counts or just save the reference.
  const data = {
    topMediaCount: Math.floor(Math.random() * 1000000), // mock
    recentMediaCount: Math.floor(Math.random() * 50000), // mock
  };

  return { igHashtagId, ...data };
};

export const saveHashtagSearch = async (accountId: string, hashtag: string, data: any) => {
  return prisma.hashtagSearch.create({
    data: {
      accountId,
      hashtag: hashtag.replace('#', ''),
      igHashtagId: data.igHashtagId,
      topMediaCount: data.topMediaCount,
      recentMediaCount: data.recentMediaCount,
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
