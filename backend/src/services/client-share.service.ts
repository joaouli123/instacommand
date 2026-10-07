import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { NotFoundError, ValidationError } from '../utils/errors';

// Prisma is loaded lazily so tests can replace it through require.cache.
let prismaClient: PrismaClient | null = null;
const db = (): PrismaClient => {
  if (!prismaClient) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient: Client } = require('@prisma/client');
    prismaClient = new Client();
  }
  return prismaClient!;
};

export const SHARE_TOKEN_PREFIX = 'shr_';
export const COMMENT_MAX_LENGTH = 1000;
export const AUTHOR_MAX_LENGTH = 60;
export const LINK_NAME_MAX_LENGTH = 80;
const SHARE_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'THREADS', 'X'];
const SHARE_RANGE_MAX_DAYS = 400;

/** 32 random bytes, url-safe. Returned once; only its hash is stored. */
export const generateShareToken = () => `${SHARE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
export const hashShareToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
export const isShareTokenFormat = (value: unknown): value is string => typeof value === 'string' && /^shr_[A-Za-z0-9_-]{43}$/.test(value);
export const tokenPrefixOf = (token: string) => token.slice(0, SHARE_TOKEN_PREFIX.length + 6);

/** Constant-time comparison of a presented token against a stored hash. */
export const tokenMatchesHash = (token: string, hash: string) => {
  const a = Buffer.from(hashShareToken(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};

export type LinkState = { revokedAt: Date | null; expiresAt: Date | null };
export const isLinkActive = (link: LinkState | null | undefined, now = new Date()) =>
  Boolean(link && !link.revokedAt && (!link.expiresAt || link.expiresAt.getTime() > now.getTime()));

export const shareUrlFor = (token: string) => `${env.FRONTEND_URL.replace(/\/$/, '')}/share/${token}`;

const cleanText = (value: unknown, max: number) => {
  if (typeof value !== 'string') return '';
  // Drop control characters except line breaks and tabs.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max + 1);
};

const coordinate = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new ValidationError('Posição do marcador inválida.');
  return Math.round(number * 100) / 100;
};

export type CommentInput = { authorName: string; body: string; mediaIndex: number | null; x: number | null; y: number | null };

/** Validates a public comment. Throws ValidationError with a Portuguese message. */
export function validateCommentInput(input: any): CommentInput {
  const authorName = cleanText(input?.authorName, AUTHOR_MAX_LENGTH).replace(/\s+/g, ' ');
  const body = cleanText(input?.body, COMMENT_MAX_LENGTH);
  if (authorName.length < 2) throw new ValidationError('Informe seu nome (mínimo 2 caracteres).');
  if (authorName.length > AUTHOR_MAX_LENGTH) throw new ValidationError(`O nome pode ter até ${AUTHOR_MAX_LENGTH} caracteres.`);
  if (!body) throw new ValidationError('Escreva sua observação.');
  if (body.length > COMMENT_MAX_LENGTH) throw new ValidationError(`A observação pode ter até ${COMMENT_MAX_LENGTH} caracteres.`);
  if ((body.match(/https?:\/\//gi) || []).length > 3) throw new ValidationError('Muitos links na observação.');
  const x = coordinate(input?.x);
  const y = coordinate(input?.y);
  if ((x === null) !== (y === null)) throw new ValidationError('Posição do marcador incompleta.');
  let mediaIndex: number | null = null;
  if (x !== null) {
    const raw = input?.mediaIndex ?? 0;
    const index = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(index) || index < 0 || index > 19) throw new ValidationError('Mídia do marcador inválida.');
    mediaIndex = index;
  }
  return { authorName, body, mediaIndex, x, y };
}

export type ShareLinkInput = { name: string; includeDrafts: boolean; expiresAt: Date | null; accountIds: string[]; platforms: string[] };

export function validateShareLinkInput(input: any, now = new Date()): ShareLinkInput {
  const name = cleanText(input?.name, LINK_NAME_MAX_LENGTH);
  if (!name) throw new ValidationError('Dê um nome ao link (ex.: nome do cliente).');
  if (name.length > LINK_NAME_MAX_LENGTH) throw new ValidationError(`O nome pode ter até ${LINK_NAME_MAX_LENGTH} caracteres.`);
  let expiresAt: Date | null = null;
  if (input?.expiresInDays !== undefined && input?.expiresInDays !== null && input?.expiresInDays !== '') {
    const days = Number(input.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new ValidationError('Validade inválida (1 a 365 dias).');
    expiresAt = new Date(now.getTime() + days * 86_400_000);
  }
  const accountIds = Array.isArray(input?.accountIds) ? Array.from(new Set(input.accountIds.filter((id: unknown) => typeof id === 'string' && id.length <= 64))) as string[] : [];
  const platforms = Array.isArray(input?.platforms) ? SHARE_PLATFORMS.filter((platform) => input.platforms.includes(platform)) : [];
  return { name, includeDrafts: input?.includeDrafts === true, expiresAt, accountIds, platforms };
}

type LinkRow = { id: string; tokenPrefix: string; name: string; accountIds: string[]; platforms: string[]; includeDrafts: boolean; expiresAt: Date | null; revokedAt: Date | null; lastViewedAt?: Date | null; createdAt: Date; _count?: { comments: number } };

/** Owner-facing view of a link. Never contains the token or its hash. */
export const toOwnerLink = (link: LinkRow) => ({
  id: link.id,
  name: link.name,
  tokenPrefix: link.tokenPrefix,
  accountIds: link.accountIds,
  platforms: link.platforms,
  includeDrafts: link.includeDrafts,
  expiresAt: link.expiresAt,
  revokedAt: link.revokedAt,
  lastViewedAt: link.lastViewedAt ?? null,
  createdAt: link.createdAt,
  active: isLinkActive(link),
  commentCount: link._count?.comments ?? 0,
});

export async function createShareLink(userId: string, raw: unknown) {
  const input = validateShareLinkInput(raw);
  if (input.accountIds.length) {
    const owned = await db().instagramAccount.count({ where: { id: { in: input.accountIds }, userId } });
    if (owned !== input.accountIds.length) throw new ValidationError('Conta inválida para este link.');
  }
  const token = generateShareToken();
  const link = await db().clientShareLink.create({
    data: { userId, tokenHash: hashShareToken(token), tokenPrefix: tokenPrefixOf(token), ...input },
  });
  return { ...toOwnerLink(link), url: shareUrlFor(token) };
}

export async function listShareLinks(userId: string) {
  const links = await db().clientShareLink.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { comments: true } } },
  });
  return links.map(toOwnerLink);
}

export async function revokeShareLink(userId: string, id: string) {
  const link = await db().clientShareLink.findFirst({ where: { id, userId } });
  if (!link) throw new NotFoundError('Link não encontrado.');
  const updated = link.revokedAt ? link : await db().clientShareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  return toOwnerLink(updated);
}

type CommentRow = { id: string; postId: string; parentId: string | null; authorName: string; body: string; fromOwner: boolean; mediaIndex: number | null; x: number | null; y: number | null; resolvedAt: Date | null; createdAt: Date };

/** Comment as shown on the public page: no link/post ids beyond the post it belongs to. */
export const toPublicComment = (comment: CommentRow) => ({
  id: comment.id,
  postId: comment.postId,
  parentId: comment.parentId,
  authorName: comment.authorName,
  body: comment.body,
  fromOwner: comment.fromOwner,
  mediaIndex: comment.mediaIndex,
  x: comment.x,
  y: comment.y,
  resolved: Boolean(comment.resolvedAt),
  createdAt: comment.createdAt,
});

export async function listPostComments(userId: string, postId: string) {
  const post = await db().scheduledPost.findFirst({ where: { id: postId, userId }, select: { id: true } });
  if (!post) throw new NotFoundError('Publicação não encontrada.');
  const comments = await db().postClientComment.findMany({
    where: { postId, link: { userId } },
    orderBy: { createdAt: 'asc' },
    include: { link: { select: { id: true, name: true } } },
  });
  return comments.map((comment: any) => ({ ...toPublicComment(comment), resolvedAt: comment.resolvedAt, link: comment.link }));
}

async function ownedComment(userId: string, commentId: string) {
  const comment = await db().postClientComment.findFirst({ where: { id: commentId, link: { userId } } });
  if (!comment) throw new NotFoundError('Comentário não encontrado.');
  return comment;
}

export async function setCommentResolved(userId: string, commentId: string, resolved: boolean) {
  await ownedComment(userId, commentId);
  const updated = await db().postClientComment.update({ where: { id: commentId }, data: { resolvedAt: resolved ? new Date() : null } });
  return toPublicComment(updated);
}

export async function replyToComment(userId: string, commentId: string, raw: any) {
  const parent = await ownedComment(userId, commentId);
  const body = cleanText(raw?.body, COMMENT_MAX_LENGTH);
  if (!body) throw new ValidationError('Escreva a resposta.');
  if (body.length > COMMENT_MAX_LENGTH) throw new ValidationError(`A resposta pode ter até ${COMMENT_MAX_LENGTH} caracteres.`);
  const user = await db().user.findUnique({ where: { id: userId }, select: { name: true } });
  const reply = await db().postClientComment.create({
    data: { postId: parent.postId, linkId: parent.linkId, parentId: parent.parentId || parent.id, authorName: (user?.name || 'Equipe').slice(0, AUTHOR_MAX_LENGTH), body, fromOwner: true },
  });
  return toPublicComment(reply);
}

// ---------------------------------------------------------------- public side

/** Resolves an active link from a presented token, or throws a generic 404. */
export async function findActiveLink(token: unknown) {
  if (!isShareTokenFormat(token)) throw new NotFoundError('Link inválido ou expirado.');
  const link = await db().clientShareLink.findUnique({ where: { tokenHash: hashShareToken(token) } });
  if (!link || !tokenMatchesHash(token, link.tokenHash) || !isLinkActive(link)) throw new NotFoundError('Link inválido ou expirado.');
  return link;
}

type ShareLinkRecord = { id: string; userId: string; accountIds: string[]; platforms: string[]; includeDrafts: boolean };

export const publicStatuses = (link: Pick<ShareLinkRecord, 'includeDrafts'>) => (link.includeDrafts ? ['SCHEDULED', 'PROCESSING', 'PUBLISHED', 'DRAFT'] : ['SCHEDULED', 'PROCESSING', 'PUBLISHED']);

export function postWhereForLink(link: ShareLinkRecord) {
  return {
    userId: link.userId,
    status: { in: publicStatuses(link) as any },
    ...(link.accountIds.length ? { accountId: { in: link.accountIds } } : {}),
    ...(link.platforms.length ? { platforms: { hasSome: link.platforms } } : {}),
  };
}

const publicAccount = (account: { igUsername?: string; igName?: string | null; pageName?: string | null; igProfilePicUrl?: string | null } | null | undefined) => account ? {
  igUsername: account.igUsername || '',
  name: account.igName || account.pageName || account.igUsername || '',
  pageName: account.pageName || null,
  igProfilePicUrl: account.igProfilePicUrl || null,
} : null;

/** Whitelists exactly what a client may see of a post. */
export function toPublicPost(post: any, link: Pick<ShareLinkRecord, 'platforms'>, accountKey = 'a0') {
  const platforms: string[] = (post.platforms?.length ? post.platforms : ['INSTAGRAM']).filter((platform: string) => !link.platforms.length || link.platforms.includes(platform));
  const status = post.status === 'PROCESSING' ? 'SCHEDULED' : post.status;
  return {
    id: post.id,
    accountKey,
    mediaType: post.mediaType,
    mediaUrls: Array.isArray(post.mediaUrls) ? post.mediaUrls.filter((url: unknown) => typeof url === 'string' && /^https?:\/\//i.test(url)) : [],
    thumbnailUrl: typeof post.thumbnailUrl === 'string' && /^https?:\/\//i.test(post.thumbnailUrl) ? post.thumbnailUrl : null,
    caption: post.caption || '',
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    platforms,
    scheduledAt: post.publishedPost?.publishedAt || post.scheduledFor,
    status,
    threadsAccount: post.threadsAccount ? { username: post.threadsAccount.username } : null,
    xAccount: post.xAccount ? { username: post.xAccount.username, name: post.xAccount.name || null, profilePicUrl: post.xAccount.profilePicUrl || null } : null,
  };
}

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function getPublicSchedule(token: unknown, query: { from?: unknown; to?: unknown } = {}) {
  const link = await findActiveLink(token);
  const now = Date.now();
  let from = parseDate(query.from) || new Date(now - 60 * 86_400_000);
  let to = parseDate(query.to) || new Date(now + 180 * 86_400_000);
  if (to < from) [from, to] = [to, from];
  if (to.getTime() - from.getTime() > SHARE_RANGE_MAX_DAYS * 86_400_000) to = new Date(from.getTime() + SHARE_RANGE_MAX_DAYS * 86_400_000);

  const posts = await db().scheduledPost.findMany({
    where: { ...postWhereForLink(link), scheduledFor: { gte: from, lte: to } } as any,
    orderBy: { scheduledFor: 'asc' },
    take: 500,
    select: {
      id: true, accountId: true, mediaType: true, mediaUrls: true, thumbnailUrl: true, caption: true, hashtags: true,
      platforms: true, scheduledFor: true, status: true,
      account: { select: { igUsername: true, igName: true, pageName: true, igProfilePicUrl: true } },
      threadsAccount: { select: { username: true } },
      xAccount: { select: { username: true, name: true, profilePicUrl: true } },
      publishedPost: { select: { publishedAt: true } },
    },
  });
  const postIds = posts.map((post: any) => post.id);
  const comments = postIds.length ? await db().postClientComment.findMany({
    where: { linkId: link.id, postId: { in: postIds } },
    orderBy: { createdAt: 'asc' },
  }) : [];

  // Accounts are keyed by position so internal account ids never leave the server.
  const accounts = new Map<string, { key: string; account: ReturnType<typeof publicAccount> }>();
  posts.forEach((post: any) => { if (!accounts.has(post.accountId)) accounts.set(post.accountId, { key: `a${accounts.size}`, account: publicAccount(post.account) }); });
  void db().clientShareLink.update({ where: { id: link.id }, data: { lastViewedAt: new Date() } }).catch(() => undefined);

  return {
    link: { name: link.name, includeDrafts: link.includeDrafts, expiresAt: link.expiresAt },
    range: { from, to },
    accounts: Array.from(accounts.values()).map(({ key, account }) => ({ key, ...account })),
    posts: posts.map((post: any) => toPublicPost(post, link, accounts.get(post.accountId)?.key)),
    comments: comments.map(toPublicComment),
  };
}

// Basic spam brake: per link, a few comments per minute and a daily cap.
const commentBuckets = new Map<string, number[]>();
export function checkCommentBudget(key: string, now = Date.now()) {
  const recent = (commentBuckets.get(key) || []).filter((time) => now - time < 86_400_000);
  if (recent.filter((time) => now - time < 60_000).length >= 6 || recent.length >= 300) {
    commentBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  commentBuckets.set(key, recent);
  if (commentBuckets.size > 5000) commentBuckets.delete(commentBuckets.keys().next().value as string);
  return true;
}

export async function createPublicComment(token: unknown, postId: unknown, raw: any) {
  const link = await findActiveLink(token);
  const input = validateCommentInput(raw);
  if (typeof postId !== 'string' || postId.length > 64) throw new NotFoundError('Publicação não encontrada.');
  const post = await db().scheduledPost.findFirst({ where: { ...postWhereForLink(link), id: postId } as any, select: { id: true } });
  if (!post) throw new NotFoundError('Publicação não encontrada.');
  let parentId: string | null = null;
  if (typeof raw?.parentId === 'string' && raw.parentId) {
    const parent = await db().postClientComment.findFirst({ where: { id: raw.parentId, linkId: link.id, postId } });
    if (!parent) throw new ValidationError('Comentário respondido não existe.');
    parentId = parent.parentId || parent.id;
  }
  if (!checkCommentBudget(link.id)) throw new ValidationError('Muitas observações em pouco tempo. Aguarde um minuto.');
  const comment = await db().postClientComment.create({
    data: { postId, linkId: link.id, parentId, ...(parentId ? { ...input, mediaIndex: null, x: null, y: null } : input) },
  });
  return toPublicComment(comment);
}
