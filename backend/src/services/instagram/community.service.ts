import { PrismaClient } from '@prisma/client';
import { graphGet, graphPost, graphDelete } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';

const prisma = new PrismaClient();

type CommunityComment = {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
  mediaId: string;
  mediaCaption?: string | null;
  mediaUrl?: string | null;
  permalink?: string | null;
};

const normalizeComment = (comment: any, media: any): CommunityComment => ({
  id: String(comment.id),
  text: String(comment.text || ''),
  username: comment.username || comment.from?.username || 'usuário',
  timestamp: comment.timestamp,
  like_count: Number(comment.like_count || 0),
  mediaId: String(media.id),
  mediaCaption: media.caption || null,
  mediaUrl: media.media_url || media.thumbnail_url || null,
  permalink: media.permalink || null,
});

const getOwnedAccount = async (accountId: string, userId: string) => {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
    select: { id: true, igUserId: true },
  });
  if (!account) throw new Error('Account not found');
  return account;
};

export const listRecentComments = async (accountId: string, userId: string, limit = 50) => {
  const account = await getOwnedAccount(accountId, userId);
  const token = await getDecryptedToken(account.id);
  const mediaResponse = await graphGet(`/${account.igUserId}/media`, token, {
    fields: 'id,caption,media_url,thumbnail_url,permalink,timestamp',
    limit: Math.min(25, Math.max(1, Math.ceil(limit / 2))),
  });
  const media: any[] = Array.isArray(mediaResponse.data) ? mediaResponse.data : [];
  const comments: CommunityComment[] = [];
  let failures = 0;
  let lastFailure: unknown;

  // Fetch a small batch at a time. The old sequential loop made an account with
  // many posts wait one network round-trip per media item before showing anything.
  for (let index = 0; index < media.length && comments.length < limit; index += 5) {
    const batch = media.slice(index, index + 5);
    const results = await Promise.all(batch.map(async (item) => {
      try {
        return {
          item,
          response: await graphGet(`/${item.id}/comments`, token, {
            fields: 'id,text,username,timestamp,like_count,from',
            limit: Math.min(25, limit),
          }),
        };
      } catch (error) {
        // One media item can be unavailable while the rest of the account is readable.
        // Keep collecting the other posts; the route will still expose real results.
        console.error(`Could not load comments for media ${item.id}:`, error);
        failures += 1;
        lastFailure = error;
        return { item, response: null };
      }
    }));

    for (const { item, response } of results) {
      for (const comment of Array.isArray(response?.data) ? response.data : []) {
        if (comments.length >= limit) break;
        comments.push(normalizeComment(comment, item));
      }
    }
  }

  if (!comments.length && media.length > 0 && failures === media.length && lastFailure) throw lastFailure;
  comments.sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());
  return { available: true, comments };
};

const assertMediaBelongsToAccount = async (accountId: string, userId: string, mediaId: string) => {
  const account = await getOwnedAccount(accountId, userId);
  const localMedia = await prisma.publishedPost.findFirst({ where: { accountId: account.id, igMediaId: mediaId }, select: { id: true } });
  if (localMedia) return account;

  const token = await getDecryptedToken(account.id);
  const media = await graphGet(`/${mediaId}`, token, { fields: 'id,owner' });
  if (String(media.owner?.id || '') !== String(account.igUserId)) throw new Error('Essa publicação não pertence à conta selecionada.');
  return account;
};

export const replyToComment = async (accountId: string, userId: string, mediaId: string, commentId: string, message: string) => {
  if (!message.trim()) throw new Error('Escreva uma resposta antes de enviar.');
  if (message.trim().length > 1000) throw new Error('A resposta pode ter no máximo 1.000 caracteres.');
  const account = await assertMediaBelongsToAccount(accountId, userId, mediaId);
  const token = await getDecryptedToken(account.id);
  return graphPost(`/${commentId}/replies`, token, { message: message.trim() });
};

export const deleteComment = async (accountId: string, userId: string, mediaId: string, commentId: string) => {
  const account = await assertMediaBelongsToAccount(accountId, userId, mediaId);
  const token = await getDecryptedToken(account.id);
  return graphDelete(`/${commentId}`, token);
};
