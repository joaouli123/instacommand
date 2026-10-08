import { getPrisma } from '../lib/prisma';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';
import { API_SCOPES, normalizeScopes, type ApiScope } from './api-scopes';
import { NotFoundError, ValidationError } from '../utils/errors';

const prisma = getPrisma();

const PREFIXES = { personal: 'ic_pat_', oauthAccess: 'ic_oat_', oauthRefresh: 'ic_ort_', oauthCode: 'ic_oac_' } as const;
type SecretKind = keyof typeof PREFIXES;

// 32 random bytes encoded as base64url are exactly 43 characters.
const BEARER_FORMAT = /^ic_(pat|oat)_[A-Za-z0-9_-]{43}$/;
export const MAX_PERSONAL_TOKENS = 50;
export const PERSONAL_TOKEN_DURATIONS = [7, 30, 90, 180, 365] as const;

export const generateSecret = (kind: SecretKind) => `${PREFIXES[kind]}${randomBytes(32).toString('base64url')}`;
export const hashSecret = (secret: string) => createHash('sha256').update(secret, 'utf8').digest('hex');
export const isApiTokenFormat = (value: unknown): value is string => typeof value === 'string' && BEARER_FORMAT.test(value);
export const tokenDisplayPrefix = (secret: string) => `${secret.slice(0, 11)}…`;

export const safeEqualHex = (left: string, right: string) => {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
};

export type VerifiedApiToken = {
  tokenId: string;
  userId: string;
  email: string;
  kind: 'PERSONAL' | 'OAUTH';
  scopes: ApiScope[];
  resource: string | null;
  name: string;
  clientName: string | null;
};

const LAST_USED_RESOLUTION_MS = 60_000;

export async function verifyApiToken(secret: string, now = new Date()): Promise<VerifiedApiToken | null> {
  if (!isApiTokenFormat(secret)) return null;
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashSecret(secret) },
    include: { user: { select: { id: true, email: true } }, oauthClient: { select: { clientName: true } } },
  });
  if (!token || token.revokedAt || (token.expiresAt && token.expiresAt <= now)) return null;

  // Recording use must never block or fail the request it describes.
  if (!token.lastUsedAt || now.getTime() - token.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    prisma.apiToken.updateMany({
      where: { id: token.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_RESOLUTION_MS) } }] },
      data: { lastUsedAt: now },
    }).catch(() => undefined);
  }

  return {
    tokenId: token.id,
    userId: token.user.id,
    email: token.user.email,
    kind: token.kind,
    scopes: normalizeScopes(token.scopes),
    resource: token.resource,
    name: token.name,
    clientName: token.oauthClient?.clientName ?? null,
  };
}

const createPersonalTokenSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao token.').max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'Escolha ao menos uma permissão.').max(API_SCOPES.length),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365), z.null()]).default(90),
});

const publicTokenSelect = {
  id: true, kind: true, name: true, tokenPrefix: true, scopes: true, expiresAt: true,
  lastUsedAt: true, revokedAt: true, createdAt: true, refreshExpiresAt: true,
  oauthClient: { select: { clientName: true, clientUri: true, registrationType: true } },
} as const;

export async function createPersonalToken(userId: string, raw: unknown, now = new Date()) {
  const input = createPersonalTokenSchema.parse(raw);
  const active = await prisma.apiToken.count({
    where: { userId, kind: 'PERSONAL', revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
  if (active >= MAX_PERSONAL_TOKENS) throw new ValidationError(`Revogue tokens antigos antes de criar outro (limite de ${MAX_PERSONAL_TOKENS}).`);

  const secret = generateSecret('personal');
  const token = await prisma.apiToken.create({
    data: {
      userId,
      kind: 'PERSONAL',
      name: input.name,
      tokenPrefix: tokenDisplayPrefix(secret),
      tokenHash: hashSecret(secret),
      scopes: normalizeScopes(input.scopes),
      expiresAt: input.expiresInDays === null ? null : new Date(now.getTime() + input.expiresInDays * 86_400_000),
    },
    select: publicTokenSelect,
  });
  // The plaintext secret leaves the server exactly once, in this response.
  return { token, secret };
}

export async function listApiTokens(userId: string, now = new Date()) {
  const [personal, oauth] = await Promise.all([
    prisma.apiToken.findMany({
      where: { userId, kind: 'PERSONAL', revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: publicTokenSelect,
    }),
    prisma.apiToken.findMany({
      where: { userId, kind: 'OAUTH', revokedAt: null, refreshExpiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: publicTokenSelect,
    }),
  ]);
  return {
    personal: personal.map((token) => ({ ...token, expired: Boolean(token.expiresAt && token.expiresAt <= now) })),
    oauth: oauth.map(({ tokenPrefix: _prefix, ...grant }) => grant),
  };
}

export async function revokeApiToken(userId: string, tokenId: string, now = new Date()) {
  const result = await prisma.apiToken.updateMany({ where: { id: tokenId, userId, revokedAt: null }, data: { revokedAt: now } });
  if (!result.count) throw new NotFoundError('Token não encontrado ou já revogado.');
}
