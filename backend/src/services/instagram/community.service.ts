import { PrismaClient } from '@prisma/client';
import { graphGet, graphPost, graphDelete } from '../../utils/instagram-api';
import { getDecryptedToken } from './auth.service';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors';
import { mediaPreviewUrl } from '../../utils/meta-media';
import { classifyIntent, CommentIntent, findOwnerReply, summarizeComments } from '../../utils/community-insights';

const prisma = new PrismaClient();

type CommunityComment = {
  id: string;
  text: string;
  username?: string;
  timestamp?: string;
  like_count?: number | null;
  mediaId: string;
  mediaCaption?: string | null;
  mediaUrl?: string | null;
  permalink?: string | null;
  mediaTimestamp?: string | null;
  mediaLikeCount?: number | null;
  mediaCommentsCount?: number | null;
  replyCount: number;
  answered: boolean;
  firstReplyAt: string | null;
  intent: CommentIntent;
  avatarUrl?: string | null;
};

const finiteOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export const normalizeComment = (comment: any, media: any, ownerUsername?: string | null): CommunityComment => {
  const replies: any[] = Array.isArray(comment.replies?.data) ? comment.replies.data : [];
  const ownerReply = findOwnerReply(replies, ownerUsername);
  const text = String(comment.text || '');
  return {
    id: String(comment.id),
    text,
    username: comment.username || comment.from?.username || 'usuário',
    timestamp: comment.timestamp,
    like_count: finiteOrNull(comment.like_count),
    mediaId: String(media.id),
    mediaCaption: media.caption || null,
    mediaUrl: mediaPreviewUrl(media),
    permalink: media.permalink || null,
    mediaTimestamp: media.timestamp || null,
    mediaLikeCount: finiteOrNull(media.like_count),
    mediaCommentsCount: finiteOrNull(media.comments_count),
    replyCount: replies.length,
    answered: Boolean(ownerReply),
    firstReplyAt: ownerReply?.timestamp || null,
    intent: classifyIntent(text),
  };
};

const getOwnedAccount = async (accountId: string, userId: string) => {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
    select: { id: true, igUserId: true, igUsername: true },
  });
  if (!account) throw new NotFoundError('Conta do Instagram não encontrada.');
  return account;
};

// Instagram comments never include the commenter's photo. business_discovery can
// return it for professional accounts; personal accounts fail, so misses are
// cached too and every failure is ignored.
const AVATAR_TTL_MS = 24 * 60 * 60 * 1000;
const AVATAR_MISS_TTL_MS = 6 * 60 * 60 * 1000;
const AVATAR_LOOKUP_LIMIT = 20;
const AVATAR_CONCURRENCY = 4;
const avatarCache = new Map<string, { url: string | null; expiresAt: number }>();

export const clearAvatarCache = () => avatarCache.clear();

export const resolveCommenterAvatars = async (igUserId: string, token: string, usernames: string[]) => {
  const result = new Map<string, string | null>();
  const pending: string[] = [];
  const now = Date.now();
  for (const raw of usernames) {
    const username = String(raw || '').toLowerCase();
    if (!username || username === 'usu�rio' || !/^[a-z0-9._]+$/.test(username) || result.has(username) || pending.includes(username)) continue;
    const cached = avatarCache.get(username);
    if (cached && cached.expiresAt > now) result.set(username, cached.url);
    else if (pending.length < AVATAR_LOOKUP_LIMIT) pending.push(username);
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const username = pending[cursor++];
      let url: string | null = null;
      try {
        const response = await graphGet(`/${igUserId}`, token, { fields: `business_discovery.username(${username}){profile_picture_url}` });
        url = typeof response?.business_discovery?.profile_picture_url === 'string' ? response.business_discovery.profile_picture_url : null;
      } catch { url = null; }
      avatarCache.set(username, { url, expiresAt: Date.now() + (url ? AVATAR_TTL_MS : AVATAR_MISS_TTL_MS) });
      result.set(username, url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AVATAR_CONCURRENCY, pending.length) }, worker));
  return result;
};

export const listRecentComments = async (accountId: string, userId: string, limit = 50) => {
  const account = await getOwnedAccount(accountId, userId);
  const token = await getDecryptedToken(account.id);
  const mediaResponse = await graphGet(`/${account.igUserId}/media`, token, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
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
            fields: 'id,text,username,timestamp,like_count,from,replies{id,username,timestamp}',
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
        const normalized = normalizeComment(comment, item, account.igUsername);
        // The account's own comments on its posts are not community interactions.
        if (account.igUsername && normalized.username?.toLowerCase() === account.igUsername.toLowerCase()) continue;
        comments.push(normalized);
      }
    }
  }

  if (!comments.length && media.length > 0 && failures === media.length && lastFailure) throw lastFailure;
  comments.sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());
  const avatars = await resolveCommenterAvatars(account.igUserId, token, comments.map(comment => comment.username || ''));
  for (const comment of comments) comment.avatarUrl = avatars.get(String(comment.username || '').toLowerCase()) ?? null;
  const summary = summarizeComments(comments);
  const topCommenters = summary.topCommenters.map(fan => ({ ...fan, avatarUrl: avatars.get(fan.username.toLowerCase()) ?? null }));
  return { available: true, comments, summary: { ...summary, topCommenters } };
};

const assertMediaBelongsToAccount = async (accountId: string, userId: string, mediaId: string) => {
  const account = await getOwnedAccount(accountId, userId);
  const localMedia = await prisma.publishedPost.findFirst({ where: { accountId: account.id, igMediaId: mediaId, instagramDeletedAt: null }, select: { id: true } });
  if (localMedia) return account;

  const token = await getDecryptedToken(account.id);
  const media = await graphGet(`/${mediaId}`, token, { fields: 'id,owner' });
  if (String(media.id || '') !== mediaId || String(media.owner?.id || '') !== String(account.igUserId)) throw new AppError('Essa publicação não pertence à conta selecionada.', 403);
  return account;
};

const getVerifiedCommentToken = async (accountId: string, userId: string, mediaId: string, commentId: string) => {
  // IDs become Graph paths. Reject paths/query strings before any remote access.
  if (!/^\d{1,200}$/.test(mediaId) || !/^\d{1,200}$/.test(commentId)) throw new ValidationError('Identificador de publicação ou comentário inválido.');
  const account = await assertMediaBelongsToAccount(accountId, userId, mediaId);
  const token = await getDecryptedToken(account.id);
  const comment = await graphGet(`/${commentId}`, token, { fields: 'id,media' });
  const actualMediaId = typeof comment.media === 'string' ? comment.media : comment.media?.id;
  if (String(comment.id || '') !== commentId || String(actualMediaId || '') !== mediaId) {
    throw new AppError('Esse comentário não pertence à publicação selecionada. Atualize os comentários antes de tentar novamente.', 403);
  }
  return token;
};

export const replyToComment = async (accountId: string, userId: string, mediaId: string, commentId: string, message: string) => {
  if (!message.trim()) throw new Error('Escreva uma resposta antes de enviar.');
  if (message.trim().length > 1000) throw new Error('A resposta pode ter no máximo 1.000 caracteres.');
  const token = await getVerifiedCommentToken(accountId, userId, mediaId, commentId);
  return graphPost(`/${commentId}/replies`, token, { message: message.trim() });
};

export const deleteComment = async (accountId: string, userId: string, mediaId: string, commentId: string) => {
  const token = await getVerifiedCommentToken(accountId, userId, mediaId, commentId);
  return graphDelete(`/${commentId}`, token);
};
