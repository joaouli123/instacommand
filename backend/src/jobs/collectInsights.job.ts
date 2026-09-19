import { Worker } from 'bullmq';
import { env } from '../config/env';
import { PrismaClient } from '@prisma/client';
import { saveProfileSnapshot, savePostInsights } from '../services/instagram/insights.service';

const prisma = new PrismaClient();

export const setupCollectInsightsWorker = () => {
  const worker = new Worker('collect-insights', async job => {
    console.log('Running daily insights collection...');
    
    const accounts = await prisma.instagramAccount.findMany({
      where: { isActive: true },
    });

    for (const account of accounts) {
      try {
        await saveProfileSnapshot(account.id);
        await savePostInsights(account.id);
        console.log(`Successfully collected insights for account ${account.id}`);
      } catch (error) {
        console.error(`Failed to collect insights for account ${account.id}:`, error);
      }
    }
  }, {
    connection: { url: env.REDIS_URL },
  });

  return worker;
};
