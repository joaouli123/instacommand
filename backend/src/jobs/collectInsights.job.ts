import { getPrisma } from '../lib/prisma';
import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis';

import { saveProfileSnapshot, savePostInsights } from '../services/instagram/insights.service';
import { createWeeklyReportNotification } from '../services/notifications.service';
import { insightsQueue } from '../services/scheduler.service';
import { jitter } from '../utils/graph-health';

const prisma = getPrisma();

const refreshWindowMs: Record<string, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};
// Each account is its own job, run in parallel up to this limit per replica, so thousands of
// accounts never queue behind one serial loop.
const CONCURRENCY = Math.max(1, Number(process.env.INSIGHTS_CONCURRENCY) || 10);
const PAGE = 500;

/** The recurring job: lists due accounts in pages and enqueues one job per account (spread out). */
async function dispatchDueAccounts() {
  let cursor: string | undefined;
  let queued = 0;
  const users = new Set<string>();
  for (;;) {
    const accounts = await prisma.instagramAccount.findMany({
      where: { isActive: true }, orderBy: { id: 'asc' }, take: PAGE, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, lastSyncAt: true, user: { select: { preferences: { select: { dataRefreshFrequency: true } } } } },
    });
    if (!accounts.length) break;
    cursor = accounts.at(-1)!.id;
    const jobs = accounts.filter((account) => {
      users.add(account.userId);
      const windowMs = refreshWindowMs[account.user.preferences?.dataRefreshFrequency || '1h'] || refreshWindowMs['1h'];
      return !account.lastSyncAt || Date.now() - account.lastSyncAt.getTime() >= windowMs;
    }).map((account) => ({
      // One job per account and 15-minute slot: a slow run never stacks duplicates.
      name: 'collect-account', data: { accountId: account.id },
      opts: { jobId: `insights-${account.id}-${Math.floor(Date.now() / (15 * 60_000))}`, delay: jitter(5 * 60_000), removeOnComplete: 1000, removeOnFail: 1000 },
    }));
    if (jobs.length) await insightsQueue.addBulk(jobs);
    queued += jobs.length;
  }
  for (const userId of users) {
    await createWeeklyReportNotification(userId).catch((error) => {
      console.error(`Failed to create weekly report notification for ${userId}:`, error);
    });
  }
  console.log(`Insights collection: ${queued} accounts queued.`);
}

export const setupCollectInsightsWorker = () => {
  const worker = new Worker('collect-insights', async job => {
    if (job.name !== 'collect-account') return dispatchDueAccounts();
    const { accountId } = job.data;
    try {
      await saveProfileSnapshot(accountId);
      await savePostInsights(accountId);
    } catch (error) {
      console.error(`Failed to collect insights for account ${accountId}:`, error);
    }
  }, {
    connection: redisConnection,
    concurrency: CONCURRENCY,
  });

  return worker;
};
