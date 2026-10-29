import { getPrisma } from '../lib/prisma';
import { AppError, ValidationError } from '../utils/errors';
import { classifyIntent, summarizeComments } from '../utils/community-insights';
import { getYouTubeAccessToken, hasYouTubeScope, YOUTUBE_API, YOUTUBE_COMMENTS_SCOPE, youtubeRequest } from './youtube.service';
import { accountScope, automationDb, ownedAutomationAccount } from './automation-platform';
import { processInstagramAutomationEvent, type InstagramAutomationEvent } from './automation.service';
import { withConversationLock } from './automation-lock';

// Comments on the channel of the company chosen at the top: the Community list, replies,
// moderation and the polling that feeds YouTube comment automations.

const prisma = getPrisma();
const RECONNECT = 'Reconecte o canal do YouTube em Contas e aceite a permissão de gerenciar comentários para responder ou moderar por aqui.';
const RECONNECT_TO_LIST = 'Para ver os comentários do YouTube aqui, reconecte o canal em Contas e, na tela do Google, marque todas as caixas de permissão (inclusive a de gerenciar seus vídeos e comentários).';

type ApiComment = { id: string; snippet?: { textOriginal?: string; textDisplay?: string; authorDisplayName?: string; authorProfileImageUrl?: string; authorChannelId?: { value?: string }; likeCount?: number; publishedAt?: string; parentId?: string } };
export type ApiThread = { id: string; snippet?: { videoId?: string; totalReplyCount?: number; topLevelComment?: ApiComment }; replies?: { comments?: ApiComment[] } };
type VideoInfo = { title: string; thumbnail: string | null; publishedAt: string | null; likes: number | null; comments: number | null };

/** The company's own channel; never another company's. */
async function companyChannel(userId: string, companyId: string) {
  const company = await prisma.instagramAccount.findFirst({ where: { id: companyId, userId, isActive: true }, select: { id: true } });
  if (!company) throw new AppError('Empresa não encontrada.', 404);
  const channel = await prisma.youTubeAccount.findFirst({ where: { workspaceAccountId: company.id, userId, isActive: true }, orderBy: { connectedAt: 'asc' } });
  if (!channel) throw new AppError('Esta empresa não tem canal do YouTube. Conecte ou vincule o canal em Contas.', 400);
  return channel;
}

/** A thread as a Community comment; "answered" means the channel itself replied. */
export function threadToComment(thread: ApiThread, channelId: string, videos: Map<string, VideoInfo>) {
  const top = thread.snippet?.topLevelComment;
  const videoId = thread.snippet?.videoId || '';
  const video = videos.get(videoId);
  const ownerReply = (thread.replies?.comments || [])
    .filter((reply) => reply.snippet?.authorChannelId?.value === channelId)
    .sort((a, b) => String(a.snippet?.publishedAt).localeCompare(String(b.snippet?.publishedAt)))[0];
  const text = top?.snippet?.textOriginal || top?.snippet?.textDisplay || '';
  return {
    // YouTube returns the author as "@handle"; the screen adds the @ itself.
    id: top?.id || thread.id, text, username: (top?.snippet?.authorDisplayName || 'usuário').replace(/^@/, ''), avatarUrl: top?.snippet?.authorProfileImageUrl || null,
    authorChannelId: top?.snippet?.authorChannelId?.value || null,
    timestamp: top?.snippet?.publishedAt, like_count: typeof top?.snippet?.likeCount === 'number' ? top.snippet.likeCount : null,
    mediaId: videoId, mediaCaption: video?.title || null, mediaUrl: video?.thumbnail || null, permalink: videoId ? `https://www.youtube.com/watch?v=${videoId}&lc=${top?.id || thread.id}` : null,
    mediaTimestamp: video?.publishedAt || null, mediaLikeCount: video?.likes ?? null, mediaCommentsCount: video?.comments ?? null,
    replyCount: thread.snippet?.totalReplyCount ?? 0, answered: Boolean(ownerReply), firstReplyAt: ownerReply?.snippet?.publishedAt || null,
    intent: classifyIntent(text),
  };
}

async function readThreads(token: string, channelId: string, pages: number, stopBefore = 0) {
  const threads: ApiThread[] = [];
  let pageToken = '';
  for (let page = 0; page < pages; page++) {
    const result = await youtubeRequest<{ items?: ApiThread[]; nextPageToken?: string }>(`${YOUTUBE_API}/commentThreads?${new URLSearchParams({
      part: 'snippet,replies', allThreadsRelatedToChannelId: channelId, order: 'time', maxResults: '100', textFormat: 'plainText', ...(pageToken ? { pageToken } : {}),
    })}`, token);
    const items = result.items || [];
    threads.push(...items);
    const oldest = Date.parse(items.at(-1)?.snippet?.topLevelComment?.snippet?.publishedAt || '');
    if (!result.nextPageToken || !items.length || (stopBefore && Number.isFinite(oldest) && oldest < stopBefore)) break;
    pageToken = result.nextPageToken;
  }
  return threads;
}

async function videoInfo(token: string, ids: string[]) {
  const videos = new Map<string, VideoInfo>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let index = 0; index < unique.length; index += 50) {
    const result = await youtubeRequest<{ items?: Array<{ id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: Record<string, string> }> }>(
      `${YOUTUBE_API}/videos?${new URLSearchParams({ part: 'snippet,statistics', id: unique.slice(index, index + 50).join(',') })}`, token);
    for (const item of result.items || []) {
      const thumbs = item.snippet?.thumbnails || {};
      videos.set(item.id, { title: item.snippet?.title || 'Vídeo', thumbnail: thumbs.medium?.url || thumbs.default?.url || null, publishedAt: item.snippet?.publishedAt || null,
        likes: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null, comments: item.statistics?.commentCount ? Number(item.statistics.commentCount) : null });
    }
  }
  return videos;
}

/** Latest comments on the company channel's videos, in the same shape as the Instagram Community. */
export async function listYouTubeComments(userId: string, companyId: string, limit = 100) {
  const channel = await companyChannel(userId, companyId);
  // Google only lists a channel's comment threads with the manage permission (youtube.force-ssl).
  if (!hasYouTubeScope(channel.scopes, YOUTUBE_COMMENTS_SCOPE)) throw new ValidationError(RECONNECT_TO_LIST);
  const token = await getYouTubeAccessToken(channel.id);
  const threads = (await readThreads(token, channel.channelId, Math.ceil(limit / 100)))
    .filter((thread) => thread.snippet?.topLevelComment?.snippet?.authorChannelId?.value !== channel.channelId).slice(0, limit);
  const videos = await videoInfo(token, threads.map((thread) => thread.snippet?.videoId || ''));
  const comments = threads.map((thread) => threadToComment(thread, channel.channelId, videos));
  return {
    available: true, network: 'YOUTUBE', channel: { id: channel.id, title: channel.title },
    canModerate: hasYouTubeScope(channel.scopes, YOUTUBE_COMMENTS_SCOPE), comments, summary: summarizeComments(comments),
  };
}

async function commentsToken(youtubeAccountId: string) {
  const channel = await prisma.youTubeAccount.findUnique({ where: { id: youtubeAccountId }, select: { scopes: true } });
  if (!hasYouTubeScope(channel?.scopes, YOUTUBE_COMMENTS_SCOPE)) throw new ValidationError(RECONNECT);
  return getYouTubeAccessToken(youtubeAccountId);
}

/** Public reply on a top-level comment; returns the new comment id. */
export async function replyToYouTubeComment(youtubeAccountId: string, parentId: string, text: string) {
  if (!/^[\w-]{10,100}$/.test(parentId)) throw new ValidationError('Comentário do YouTube inválido.');
  const token = await commentsToken(youtubeAccountId);
  const result = await youtubeRequest<{ id?: string }>(`${YOUTUBE_API}/comments?part=snippet`, token, { method: 'POST', body: JSON.stringify({ snippet: { parentId, textOriginal: text } }) });
  if (!result.id) throw new AppError('O YouTube não confirmou a resposta. Confira o comentário no YouTube antes de tentar de novo.', 502);
  return result.id;
}

export async function replyToCompanyYouTubeComment(userId: string, companyId: string, commentId: string, text: string) {
  const channel = await companyChannel(userId, companyId);
  return { id: await replyToYouTubeComment(channel.id, commentId, text) };
}

/** Hides a comment from the public (moderation "rejected"); YouTube has no delete for other people's comments. */
export async function hideCompanyYouTubeComment(userId: string, companyId: string, commentId: string) {
  if (!/^[\w-]{10,100}$/.test(commentId)) throw new ValidationError('Comentário do YouTube inválido.');
  const channel = await companyChannel(userId, companyId);
  const token = await commentsToken(channel.id);
  await youtubeRequest(`${YOUTUBE_API}/comments/setModerationStatus?${new URLSearchParams({ id: commentId, moderationStatus: 'rejected' })}`, token, { method: 'POST' });
  return { hidden: true };
}

/** New comments by other people, after the rules were enabled, as automation events. */
export function youtubeCommentEvents(threads: ApiThread[], channelId: string, since: number): InstagramAutomationEvent[] {
  return threads.flatMap((thread) => {
    const top = thread.snippet?.topLevelComment;
    const author = top?.snippet?.authorChannelId?.value;
    const at = Date.parse(top?.snippet?.publishedAt || '');
    if (!top?.id || !author || author === channelId || !Number.isFinite(at) || at < since || at > Date.now() + 60_000) return [];
    return [{
      platform: 'YOUTUBE' as const, accountIgId: channelId, eventKey: `youtube:${channelId}:comment:${top.id}`, type: 'COMMENT_ANY' as const,
      senderId: author, senderUsername: top.snippet?.authorDisplayName, text: top.snippet?.textOriginal || top.snippet?.textDisplay || '',
      mediaId: thread.snippet?.videoId, commentId: top.id, timestamp: at,
    }];
  });
}

/**
 * Reads new comments of a channel with an active rule and runs the automations. Only comments
 * newer than the last one read (and than the first active rule) are considered.
 */
export async function syncYouTubeAutomation(userId: string, accountId: string) {
  const account = await ownedAutomationAccount(userId, accountId, 'YOUTUBE');
  return withConversationLock(`youtube-collection:${accountId}`, async (assertLease) => {
    const rules = await automationDb.socialAutomation.findMany({ where: { ...accountScope(accountId, 'YOUTUBE'), enabled: true, enabledAt: { not: null } } });
    if (!rules.length) return { processed: 0, note: 'Nenhuma regra ativa. Não lemos nem respondemos comentários antigos.' };
    const stored = await prisma.youTubeAccount.findUnique({ where: { id: accountId }, select: { automationLastCommentAt: true, scopes: true } });
    try {
      if (!hasYouTubeScope(stored?.scopes, YOUTUBE_COMMENTS_SCOPE)) throw new ValidationError(RECONNECT);
      const since = Math.max(Math.min(...rules.map((rule) => rule.enabledAt!.getTime())), (stored?.automationLastCommentAt?.getTime() ?? 0) + 1);
      const token = await getYouTubeAccessToken(accountId);
      const threads = await readThreads(token, account.externalId, 3, since);
      const events = youtubeCommentEvents(threads, account.externalId, since).sort((a, b) => a.timestamp! - b.timestamp!);
      for (const event of events) { await assertLease(); await processInstagramAutomationEvent(event); }
      const newest = events.at(-1)?.timestamp;
      await prisma.youTubeAccount.update({ where: { id: accountId }, data: { automationSyncAt: new Date(), automationSyncError: null, ...(newest ? { automationLastCommentAt: new Date(newest) } : {}) } });
      return { processed: events.length };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Falha ao consultar o YouTube. Tente novamente mais tarde.';
      await prisma.youTubeAccount.update({ where: { id: accountId }, data: { automationSyncError: message.slice(0, 500) } });
      throw new ValidationError(message);
    }
  });
}
