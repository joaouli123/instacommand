import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { automationDb as prisma } from '../services/automation-platform';
import { syncThreadsAutomation } from '../services/threads-automation.service';

export async function setupThreadsAutomationWorker() {
  const queue = new Queue('threads-public-replies', { connection: redisConnection });
  const worker = new Worker('threads-public-replies', async () => {
    const accounts = await prisma.threadsAccount.findMany({ where: { isActive: true, socialAutomations: { some: { enabled: true, platform: 'THREADS' } } }, select: { id: true, userId: true } });
    for (const account of accounts) {
      // Each account failure is displayed in its own workspace, without logging content or tokens.
      await syncThreadsAutomation(account.userId, account.id).catch(() => undefined);
    }
  }, { connection: redisConnection, concurrency: 1 });
  await queue.add('collect', {}, { jobId: 'threads-public-replies', repeat: { pattern: '*/2 * * * *' }, removeOnComplete: 20, removeOnFail: 20 });
  return worker;
}
