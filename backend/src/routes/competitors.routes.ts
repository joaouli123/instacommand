import { getPrisma } from '../lib/prisma';
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { addCompetitor, removeCompetitor, collectCompetitorData, normalizeCompetitorInsight } from '../services/instagram/discovery.service';

import { calculateCompetitorMetrics } from '../services/instagram/discovery.service';
import { formatBreakdown, normalizePost, postingFrequency, rankPosts } from '../services/instagram/content-ranking';

const router = Router();
const prisma = getPrisma();

router.use(authenticate);

router.get('/:accountId', async (req: any, res, next) => {
  try {
    const account = await prisma.instagramAccount.findFirst({ where: { id: req.params.accountId, userId: req.user.id, isActive: true } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const competitors = await prisma.competitor.findMany({
      where: { accountId: req.params.accountId, account: { userId: req.user.id } }
      , include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } }
    });
    res.json(competitors.map((competitor) => ({
      ...competitor,
      insights: competitor.insights.map(normalizeCompetitorInsight),
    })));
  } catch (error) { next(error); }
});

// Benchmark payload for the competitors page: own account vs. each competitor,
// follower history from stored snapshots and top posts ranked by engagement.
// Reads only the database (no Graph API calls), so it is cheap to reload.
router.get('/:accountId/overview', async (req: any, res, next) => {
  try {
    const account = await prisma.instagramAccount.findFirst({ where: { id: req.params.accountId, userId: req.user.id, isActive: true } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const [competitors, ownPosts] = await Promise.all([
      prisma.competitor.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: 'asc' },
        include: { insights: { orderBy: { collectedAt: 'desc' }, take: 60 } },
      }),
      prisma.publishedPost.findMany({
        where: { accountId: account.id, instagramDeletedAt: null, igMediaId: { not: null }, mediaType: { in: ['IMAGE', 'CAROUSEL', 'REEL'] } },
        orderBy: { publishedAt: 'desc' },
        take: 25,
        include: { insights: { orderBy: { collectedAt: 'desc' }, take: 1 } },
      }),
    ]);

    const ownSample = ownPosts.map((post) => {
      const insight = post.insights[0];
      return {
        id: post.igMediaId || post.id,
        permalink: post.igPermalink,
        caption: post.caption,
        media_type: post.mediaType === 'REEL' ? 'VIDEO' : post.mediaType === 'CAROUSEL' ? 'CAROUSEL_ALBUM' : 'IMAGE',
        media_product_type: post.mediaType === 'REEL' ? 'REELS' : undefined,
        media_url: post.igMediaUrl,
        timestamp: post.publishedAt.toISOString(),
        like_count: insight ? insight.likes : undefined,
        comments_count: insight ? insight.comments : undefined,
        view_count: insight?.views ?? undefined,
      };
    });
    const ownMetrics = calculateCompetitorMetrics(ownSample, account.igFollowersCount);
    const ownSource = { type: 'competitor' as const, label: account.igUsername, followers: account.igFollowersCount };

    res.json({
      own: {
        igUsername: account.igUsername,
        igName: account.igName,
        igProfilePicUrl: account.igProfilePicUrl,
        followers: account.igFollowersCount,
        mediaCount: account.igMediaCount,
        ...ownMetrics,
        postsPerWeek: postingFrequency(ownSample),
        formats: formatBreakdown(ownSample),
        topPosts: rankPosts(ownSample.map((post) => normalizePost(post, ownSource)).filter((post): post is NonNullable<typeof post> => !!post), { limit: 6 }),
      },
      competitors: competitors.map((competitor) => {
        const latest = competitor.insights[0];
        const posts = Array.isArray(latest?.recentPostsData) ? latest.recentPostsData as any[] : [];
        const metrics = calculateCompetitorMetrics(posts, latest?.followers ?? competitor.igFollowersCount);
        const source = { type: 'competitor' as const, label: competitor.igUsername, followers: latest?.followers ?? competitor.igFollowersCount };
        return {
          id: competitor.id,
          igUsername: competitor.igUsername,
          igName: competitor.igName,
          igProfilePicUrl: competitor.igProfilePicUrl,
          igBio: competitor.igBio,
          followers: competitor.igFollowersCount,
          mediaCount: competitor.igMediaCount,
          createdAt: competitor.createdAt,
          lastCollectedAt: latest?.collectedAt ?? null,
          ...metrics,
          postsPerWeek: postingFrequency(posts),
          formats: formatBreakdown(posts),
          topPosts: rankPosts(posts.map((post) => normalizePost(post, source)).filter((post): post is NonNullable<typeof post> => !!post), { limit: 12 }),
          history: [...competitor.insights].reverse().map((insight) => ({
            collectedAt: insight.collectedAt,
            followers: insight.followers,
            mediaCount: insight.mediaCount,
            engagementRate: insight.engagementRate,
          })),
        };
      }),
    });
  } catch (error) { next(error); }
});

router.post('/:accountId', async (req: any, res, next) => {
  try {
    const { igUsername } = req.body;
    if (typeof igUsername !== 'string' || !igUsername.trim()) return res.status(400).json({ error: 'Informe o @username do concorrente.' });
    const total = await prisma.competitor.count({ where: { accountId: req.params.accountId, account: { userId: req.user.id } } });
    if (total >= 20) return res.status(400).json({ error: 'Limite de 20 concorrentes por conta. Remova um para adicionar outro.' });
    const competitor = await addCompetitor(req.params.accountId, req.user.id, igUsername);
    res.status(201).json(competitor);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    await removeCompetitor(req.params.id, req.user.id);
    res.json({ message: 'Competitor removed' });
  } catch (error) { next(error); }
});

router.get('/:id/insights', async (req: any, res, next) => {
  try {
    const competitor = await prisma.competitor.findFirst({ where: { id: req.params.id, account: { userId: req.user.id } }, select: { id: true } });
    if (!competitor) return res.status(404).json({ error: 'Competitor not found' });
    const insights = await prisma.competitorInsight.findMany({
      where: { competitorId: req.params.id },
      orderBy: { collectedAt: 'desc' },
      take: 30
    });
    res.json(insights.map(normalizeCompetitorInsight));
  } catch (error) { next(error); }
});

router.post('/:id/refresh', async (req: any, res, next) => {
  try {
    await collectCompetitorData(req.params.id, req.user.id);
    res.json({ message: 'Competitor data refreshed' });
  } catch (error) { next(error); }
});

export default router;
