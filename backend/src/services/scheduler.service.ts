import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const publishQueue = new Queue('publish-post', { connection: redisConnection });
export const insightsQueue = new Queue('collect-insights', { connection: redisConnection });
export const competitorsQueue = new Queue('collect-competitors', { connection: redisConnection });

export const schedulePost = async (scheduledPostId: string, publishAt: Date) => {
  const delay = publishAt.getTime() - Date.now();
  await publishQueue.add('publish', { scheduledPostId, scheduledFor: publishAt.toISOString() }, {
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
  // Run the worker every 15 minutes. Each user's preference decides whether
  // their own accounts are due, so the UI frequency is operational.
  await insightsQueue.add(
    'collect-insights-recurring', 
    {}, 
    { 
      jobId: 'collect-insights-recurring',
      repeat: { pattern: '*/15 * * * *' } 
    }
  );

  // Competitors: daily at 3 AM
  await competitorsQueue.add(
    'collect-competitors-recurring', 
    {}, 
    { 
      jobId: 'collect-competitors-recurring',
      repeat: { pattern: '0 3 * * *' } 
    }
  );
};
