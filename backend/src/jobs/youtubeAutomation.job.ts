import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { automationDb as prisma } from '../services/automation-platform';
import { syncYouTubeAutomation } from '../services/youtube-community.service';

/** Every 5 minutes, reads new comments of YouTube channels with an active rule (1 quota unit per page). */
export async function setupYouTubeAutomationWorker() {
  const queue = new Queue('youtube-comment-replies', { connection: redisConnection });
  const worker = new Worker('youtube-comment-replies', async () => {
    const channels = await prisma.youTubeAccount.findMany({ where: { isActive: true, socialAutomations: { some: { enabled: true, platform: 'YOUTUBE' } } }, select: { id: true, userId: true } });
    for (const channel of channels) {
      // Failures are stored on the channel and shown in its automations workspace; no content or token is logged.
      await syncYouTubeAutomation(channel.userId, channel.id).catch(() => undefined);
    }
  }, { connection: redisConnection, concurrency: 1 });
  await queue.add('collect', {}, { jobId: 'youtube-comment-replies', repeat: { pattern: '*/5 * * * *' }, removeOnComplete: 20, removeOnFail: 20 });
  return worker;
}
