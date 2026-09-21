import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { PrismaClient } from '@prisma/client';
import { saveProfileSnapshot, savePostInsights } from '../services/instagram/insights.service';

const prisma = new PrismaClient();

const refreshWindowMs: Record<string, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export const setupCollectInsightsWorker = () => {
  const worker = new Worker('collect-insights', async job => {
    console.log('Running daily insights collection...');
    
    const accounts = await prisma.instagramAccount.findMany({
      where: { isActive: true },
      include: { user: { include: { preferences: true } } },
    });

    for (const account of accounts) {
      const windowMs = refreshWindowMs[account.user.preferences?.dataRefreshFrequency || '1h'] || refreshWindowMs['1h'];
      if (account.lastSyncAt && Date.now() - account.lastSyncAt.getTime() < windowMs) continue;
      try {
        await saveProfileSnapshot(account.id);
        await savePostInsights(account.id);
        console.log(`Successfully collected insights for account ${account.id}`);
      } catch (error) {
        console.error(`Failed to collect insights for account ${account.id}:`, error);
      }
    }
  }, {
    connection: redisConnection,
  });

  return worker;
};
