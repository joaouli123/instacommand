import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { PrismaClient } from '@prisma/client';
import { collectCompetitorData } from '../services/instagram/discovery.service';

const prisma = new PrismaClient();

export const setupCollectCompetitorsWorker = () => {
  const worker = new Worker('collect-competitors', async job => {
    console.log('Running daily competitor data collection...');
    
    const competitors = await prisma.competitor.findMany({
      where: { isActive: true },
    });

    for (const competitor of competitors) {
      try {
        await collectCompetitorData(competitor.id);
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
