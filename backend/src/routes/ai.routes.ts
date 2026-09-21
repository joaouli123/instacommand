import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateAiContent } from '../services/ai.service';
import { getAiCredentials } from '../services/instagram/auth.service';

const router = Router();
const prisma = new PrismaClient();

const requestSchema = z.object({
  mode: z.enum(['caption', 'plan', 'audit', 'reply']),
  accountId: z.string().uuid().optional(),
  topic: z.string().trim().max(500).optional(),
  audience: z.string().trim().max(300).optional(),
  tone: z.string().trim().max(100).optional(),
  objective: z.string().trim().max(200).optional(),
  mediaType: z.string().trim().max(50).optional(),
  platforms: z.array(z.string().max(30)).max(5).optional(),
  caption: z.string().max(2200).optional(),
  comment: z.string().max(1000).optional(),
});

router.use(authenticate);

router.post('/generate', async (req: AuthRequest, res, next) => {
  try {
    const input = requestSchema.parse(req.body);
    let context: Record<string, unknown> = {};

    if (input.accountId) {
      const account = await prisma.instagramAccount.findFirst({
        where: { id: input.accountId, userId: req.user!.id, isActive: true },
        select: {
          igUsername: true,
          igName: true,
          igBio: true,
          igFollowersCount: true,
          igFollowsCount: true,
          igMediaCount: true,
          pageName: true,
          profileInsights: { orderBy: { collectedAt: 'desc' }, take: 3, select: { followers: true, reach: true, impressions: true, profileViews: true, collectedAt: true } },
          publishedPosts: { where: { igMediaId: { not: null } }, orderBy: { publishedAt: 'desc' }, take: 8, select: { mediaType: true, caption: true, publishedAt: true, insights: { orderBy: { collectedAt: 'desc' }, take: 1, select: { likes: true, comments: true, shares: true, saves: true, reach: true, engagement: true } } } },
        },
      });

      if (!account) return res.status(404).json({ error: 'Conta do Instagram não encontrada.' });
      context = account as unknown as Record<string, unknown>;
    }

    const result = await generateAiContent({ ...input, context }, await getAiCredentials(req.user!.id));
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

export default router;
