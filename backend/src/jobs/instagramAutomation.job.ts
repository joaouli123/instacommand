import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { processInstagramAutomationEvent, type InstagramAutomationEvent } from '../services/automation.service';

export const setupInstagramAutomationWorker = () => new Worker<InstagramAutomationEvent>(
  'instagram-webhooks',
  async (job) => processInstagramAutomationEvent(job.data),
  { connection: redisConnection, concurrency: 5 },
);
