import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { automationDb as prisma } from '../services/automation-platform';
import { syncXAutomation } from '../services/x-automation.service';

/** Every 2 minutes, reads new X mentions for accounts with an active rule. */
export async function setupXAutomationWorker() {
  const queue = new Queue('x-public-replies', { connection: redisConnection });
  const worker = new Worker('x-public-replies', async () => {
    const accounts = await prisma.xAccount.findMany({ where: { isActive: true, socialAutomations: { some: { enabled: true, platform: 'X' } } }, select: { id: true, userId: true } });
    for (const account of accounts) {
      // Failures are stored on the account and shown in its workspace; no content or token is logged.
      await syncXAutomation(account.userId, account.id).catch(() => undefined);
    }
  }, { connection: redisConnection, concurrency: 1 });
  await queue.add('collect', {}, { jobId: 'x-public-replies', repeat: { pattern: '*/2 * * * *' }, removeOnComplete: 20, removeOnFail: 20 });
  return worker;
}
