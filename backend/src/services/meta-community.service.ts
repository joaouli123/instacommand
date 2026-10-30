import { getPrisma } from '../lib/prisma';
import { AppError, ValidationError } from '../utils/errors';
import { graphGet, graphPost } from '../utils/instagram-api';
import { classifyIntent, summarizeComments } from '../utils/community-insights';
import { getDecryptedThreadsToken, getDecryptedToken } from './instagram/auth.service';
import { threadsAutomationRequest, ThreadsAutomationError, waitForThreadsReplyContainer } from './automation-platform';

// Community for the Facebook Page and the Threads profile of the company chosen at the top,
// in the same shape as the Instagram and YouTube lists. Never mixes companies.

const prisma = getPrisma();
const POSTS = 15;
const ID = /^[\w.-]{1,120}$/;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

async function company(userId: string, companyId: string) {
  const account = await prisma.instagramAccount.findFirst({ where: { id: companyId, userId, isActive: true }, select: { id: true, pageId: true, pageName: true, igUsername: true } });
  if (!account) throw new AppError('Empresa não encontrada.', 404);
  return account;
}

const checkId = (id: string, label: string) => { if (!ID.test(id)) throw new ValidationError(`${label} inválido.`); };

// ---------- Facebook Page ----------

async function companyPage(userId: string, companyId: string) {
  const account = await company(userId, companyId);
  if (!account.pageId) throw new ValidationError('Esta empresa não tem uma Página do Facebook vinculada.');
  return { ...account, pageId: account.pageId, token: await getDecryptedToken(account.id) };
}

/** A Page comment as a Community comment; "answered" means the Page itself replied. */
export function facebookComment(comment: any, post: any, pageId: string) {
  const replies: any[] = Array.isArray(comment.comments?.data) ? comment.comments.data : [];
  const ownerReply = replies.filter((reply) => reply?.from?.id === pageId)
    .sort((a, b) => String(a.created_time).localeCompare(String(b.created_time)))[0];
  const text = String(comment.message || '');
  return {
    id: String(comment.id), text, username: comment.from?.name || 'usuário', avatarUrl: comment.from?.picture?.data?.url || null,
    timestamp: comment.created_time, like_count: finite(comment.like_count),
    mediaId: String(post.id), mediaCaption: post.message || null, mediaUrl: post.full_picture || null, permalink: comment.permalink_url || post.permalink_url || null,
    mediaTimestamp: post.created_time || null, mediaLikeCount: finite(post.reactions?.summary?.total_count), mediaCommentsCount: finite(post.comments?.summary?.total_count),
    replyCount: finite(comment.comment_count) ?? replies.length, answered: Boolean(ownerReply), firstReplyAt: ownerReply?.created_time || null,
    hidden: comment.is_hidden === true, intent: classifyIntent(text),
  };
}

export async function listFacebookComments(userId: string, companyId: string, limit = 100) {
  const page = await companyPage(userId, companyId);
  const posts = await graphGet(`/${page.pageId}/published_posts`, page.token, {
    fields: 'id,message,full_picture,permalink_url,created_time,comments.summary(true).limit(0),reactions.summary(true).limit(0)', limit: POSTS,
  });
  const comments: ReturnType<typeof facebookComment>[] = [];
  for (const post of Array.isArray(posts.data) ? posts.data : []) {
    if (!post.comments?.summary?.total_count) continue;
    const result = await graphGet(`/${post.id}/comments`, page.token, {
      fields: 'id,message,from{id,name,picture},created_time,like_count,comment_count,is_hidden,permalink_url,comments.limit(25){from{id},created_time}',
      filter: 'toplevel', order: 'reverse_chronological', limit: 50,
    });
    for (const comment of Array.isArray(result.data) ? result.data : []) {
      if (comment.from?.id !== page.pageId) comments.push(facebookComment(comment, post, page.pageId));
    }
  }
  const latest = comments.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, limit);
  return { available: true, network: 'FACEBOOK', page: { id: page.pageId, name: page.pageName }, canModerate: true, comments: latest, summary: summarizeComments(latest) };
}

export async function replyToFacebookComment(userId: string, companyId: string, commentId: string, message: string) {
  checkId(commentId, 'Comentário do Facebook');
  const page = await companyPage(userId, companyId);
  const result = await graphPost(`/${commentId}/comments`, page.token, { message });
  if (!result.id) throw new AppError('O Facebook não confirmou a resposta. Confira o comentário na Página antes de tentar de novo.', 502);
  return { id: String(result.id) };
}

/** Hides the comment from the public; the author and their friends still see it. */
export async function hideFacebookComment(userId: string, companyId: string, commentId: string) {
  checkId(commentId, 'Comentário do Facebook');
  const page = await companyPage(userId, companyId);
  await graphPost(`/${commentId}`, page.token, { is_hidden: true });
  return { hidden: true };
}

// ---------- Threads ----------

async function companyThreads(userId: string, companyId: string) {
  const account = await company(userId, companyId);
  const profile = await prisma.threadsAccount.findFirst({ where: { workspaceAccountId: account.id, userId, isActive: true }, orderBy: { connectedAt: 'asc' } });
  if (!profile) throw new ValidationError('Esta empresa não tem perfil do Threads. Conecte ou vincule o perfil em Contas.');
  return { profile, token: await getDecryptedThreadsToken(profile.id) };
}

/** Direct replies of other people to a post; "answered" means the profile replied to them. */
export function threadsComments(conversation: any[], post: any, username: string) {
  const own = (item: any) => item?.is_reply_owned_by_me === true || String(item?.username || '').toLowerCase() === username.toLowerCase();
  return conversation.filter((item) => item?.id && item.replied_to?.id === post.id && !own(item)).map((reply) => {
    const ownerReply = conversation.filter((item) => item.replied_to?.id === reply.id && own(item))
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))[0];
    const children = conversation.filter((item) => item.replied_to?.id === reply.id).length;
    const text = String(reply.text || '');
    return {
      id: String(reply.id), text, username: reply.username || 'usuário', avatarUrl: null, timestamp: reply.timestamp, like_count: null,
      mediaId: String(post.id), mediaCaption: post.text || null, mediaUrl: post.media_type === 'VIDEO' ? post.thumbnail_url || null : post.media_url || null,
      permalink: reply.permalink || post.permalink || null, mediaTimestamp: post.timestamp || null, mediaLikeCount: null, mediaCommentsCount: null,
      replyCount: children, answered: Boolean(ownerReply), firstReplyAt: ownerReply?.timestamp || null,
      hidden: reply.hide_status === 'HIDDEN', intent: classifyIntent(text),
    };
  });
}

export async function listThreadsComments(userId: string, companyId: string, limit = 100) {
  const { profile, token } = await companyThreads(userId, companyId);
  const posts = await threadsAutomationRequest(`/${profile.threadsUserId}/threads`, token, {
    fields: 'id,text,permalink,timestamp,media_type,media_url,thumbnail_url,is_reply,has_replies,username', limit: String(POSTS),
  });
  const comments: ReturnType<typeof threadsComments> = [];
  for (const post of Array.isArray(posts.data) ? posts.data : []) {
    if (!post.id || post.is_reply || post.has_replies === false) continue;
    const result = await threadsAutomationRequest(`/${post.id}/conversation`, token, {
      fields: 'id,text,username,permalink,timestamp,is_reply_owned_by_me,replied_to,hide_status', reverse: 'true', limit: '100',
    });
    comments.push(...threadsComments(Array.isArray(result.data) ? result.data : [], post, profile.username));
  }
  const latest = comments.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, limit);
  return { available: true, network: 'THREADS', profile: { id: profile.id, username: profile.username }, canModerate: true, comments: latest, summary: summarizeComments(latest) };
}

/** Public reply (threads_manage_replies): a reply container, then its publication. Never retried. */
export async function replyToThreadsComment(userId: string, companyId: string, replyId: string, text: string) {
  checkId(replyId, 'Resposta do Threads');
  if ([...text].length > 500) throw new ValidationError('A resposta do Threads deve ter até 500 caracteres.');
  const { profile, token } = await companyThreads(userId, companyId);
  const container = await threadsAutomationRequest(`/${profile.threadsUserId}/threads`, token, { media_type: 'TEXT', text, reply_to_id: replyId }, 'POST');
  if (typeof container.id !== 'string' || !/^[\w-]+$/.test(container.id)) throw new ThreadsAutomationError('O Threads não confirmou a criação da resposta.');
  await waitForThreadsReplyContainer(container.id, token);
  const published = await threadsAutomationRequest(`/${profile.threadsUserId}/threads_publish`, token, { creation_id: container.id }, 'POST');
  if (!published.id) throw new ThreadsAutomationError('O Threads não confirmou a publicação da resposta.');
  return { id: String(published.id) };
}

/** Hides a reply on the company's post; Threads has no delete for other people's replies. */
export async function hideThreadsComment(userId: string, companyId: string, replyId: string) {
  checkId(replyId, 'Resposta do Threads');
  const { token } = await companyThreads(userId, companyId);
  await threadsAutomationRequest(`/${replyId}/manage_reply`, token, { hide: 'true' }, 'POST');
  return { hidden: true };
}
