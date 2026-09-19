import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const redisOptions = {
  url: env.REDIS_URL,
};

export const publishQueue = new Queue('publish-post', { connection: redisOptions });
export const insightsQueue = new Queue('collect-insights', { connection: redisOptions });
export const competitorsQueue = new Queue('collect-competitors', { connection: redisOptions });

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
  await insightsQueue.add('collect-all-insights', {}, {
    repeat: {
      pattern: '0 2 * * *' // Run at 2 AM every day
    }
  });

  await competitorsQueue.add('collect-all-competitors', {}, {
    repeat: {
      pattern: '0 3 * * *' // Run at 3 AM every day
    }
  });
};
