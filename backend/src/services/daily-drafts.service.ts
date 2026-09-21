import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { dailyPlanSchema } from './ai-output';
import { NotFoundError } from '../utils/errors';

const prisma = new PrismaClient();
export const dailyDraftRequestSchema = z.object({
  requestId: z.string().uuid(), accountId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), plan: dailyPlanSchema,
}).superRefine((input, ctx) => {
  const date = new Date(`${input.date}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Escolha uma data válida.' });
});

export async function saveDailyDrafts(userId: string, raw: unknown) {
  const input = dailyDraftRequestSchema.parse(raw);
  const account = await prisma.instagramAccount.findFirst({ where: { id: input.accountId, userId, isActive: true }, select: { id: true } });
  if (!account) throw new NotFoundError('Conta não encontrada.');
  // Deterministic IDs make retries of the same save idempotent. They also
  // bind the request to its workspace and profile. No queue or publish call.
  return prisma.$transaction(input.plan.posts.map((post, index) => {
    const hex = createHash('sha256').update(`${userId}:${input.accountId}:${input.requestId}:${index}`).digest('hex').slice(0, 32);
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return prisma.scheduledPost.upsert({ where: { id }, update: {}, create: {
      id, userId, accountId: account.id, mediaType: post.format, mediaUrls: [], caption: post.caption,
      hashtags: post.hashtags.map(tag => tag.replace(/^#/, '')), platforms: ['INSTAGRAM'], status: 'DRAFT',
      scheduledFor: new Date(`${input.date}T${post.suggestedTime}:00-03:00`),
      editorialBrief: { topic: post.topic, cta: post.cta, creativeBrief: post.creativeBrief, storyIdea: post.storyIdea,
        reason: post.reason, order: index + 1, summary: input.plan.summary, timingNote: input.plan.timingNote, timezone: 'America/Sao_Paulo' },
    } });
  }));
}
