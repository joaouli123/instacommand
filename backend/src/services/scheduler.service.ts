import { getPrisma } from '../lib/prisma';
import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';


const prisma = getPrisma();

export const publishQueue = new Queue('publish-post', { connection: redisConnection });
export const insightsQueue = new Queue('collect-insights', { connection: redisConnection });
export const competitorsQueue = new Queue('collect-competitors', { connection: redisConnection });

export const schedulePost = async (scheduledPostId: string, publishAt: Date) => {
  // The post id is the job id. BullMQ keeps finished jobs and silently ignores
  // add() while one with the same id exists, so re-scheduling a post whose
  // earlier job failed or completed would never run. Clear it first.
  const existing = await publishQueue.getJob(scheduledPostId);
  if (existing) {
    // An active job is being published right now; its claim decides the outcome.
    if (await existing.getState() === 'active') return;
    await existing.remove();
  }
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
