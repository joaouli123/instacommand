import { getPrisma } from '../lib/prisma';
import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis';

import { collectCompetitorData } from '../services/instagram/discovery.service';

const prisma = getPrisma();

export const setupCollectCompetitorsWorker = () => {
  const worker = new Worker('collect-competitors', async job => {
    console.log('Running daily competitor data collection...');
    
    const competitors = await prisma.competitor.findMany({
      where: { isActive: true },
      include: { account: { select: { userId: true } } },
    });

    for (const competitor of competitors) {
      try {
        await collectCompetitorData(competitor.id, competitor.account.userId);
        console.log(`Successfully collected data for competitor ${competitor.id}`);
      } catch (error) {
        console.error(`Failed to collect data for competitor ${competitor.id}:`, error);
      }
    }
  }, {
    connection: redisConnection,
  });

  return worker;
};
