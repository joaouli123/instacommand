import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const publishQueue = new Queue('publish-post', { connection: redisConnection });
export const insightsQueue = new Queue('collect-insights', { connection: redisConnection });
export const competitorsQueue = new Queue('collect-competitors', { connection: redisConnection });

export const schedulePost = async (scheduledPostId: string, publishAt: Date) => {
  const delay = publishAt.getTime() - Date.now();
  await publishQueue.add('publish', { scheduledPostId }, { 
    jobId: scheduledPostId,
    delay: Math.max(0, delay)
  });
};

export const cancelScheduledPost = async (scheduledPostId: string) => {
  const job = await publishQueue.getJob(scheduledPostId);
  if (job) {
    await job.remove();
  }
};

export const reschedulePost = async (scheduledPostId: string, newPublishAt: Date) => {
  await cancelScheduledPost(scheduledPostId);
  await schedulePost(scheduledPostId, newPublishAt);
};

export const setupRecurringJobs = async () => {
  // Insights: every 6 hours
  await insightsQueue.add(
    'collect-insights-recurring', 
    {}, 
    { 
      repeat: { pattern: '0 */6 * * *' } 
    }
  );

  // Competitors: daily at 3 AM
  await competitorsQueue.add(
    'collect-competitors-recurring', 
    {}, 
    { 
      repeat: { pattern: '0 3 * * *' } 
    }
  );
};
