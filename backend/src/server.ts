import type { Server } from 'node:http';
import { env } from './config/env';
import { createApp } from './app';

// Workers
import { setupPublishPostWorker } from './jobs/publishPost.job';
import { setupCollectInsightsWorker } from './jobs/collectInsights.job';
import { setupCollectCompetitorsWorker } from './jobs/collectCompetitors.job';
import { setupInstagramAutomationWorker } from './jobs/instagramAutomation.job';
import { setupThreadsAutomationWorker } from './jobs/threadsAutomation.job';
import { setupRecurringJobs } from './services/scheduler.service';
import { reconcileScheduledPosts } from './services/schedule-reconciler.service';

const app = createApp();
const RECONCILE_INTERVAL_MS = 10 * 60_000;
// Docker sends SIGTERM and kills the container shortly after; finish what we can.
const SHUTDOWN_GRACE_MS = 25_000;

type Closable = { close: () => Promise<void> };

// Start server
const startServer = async () => {
  try {
    // Initialize workers
    const workers: Closable[] = [
      setupPublishPostWorker(),
      setupCollectInsightsWorker(),
      setupCollectCompetitorsWorker(),
      setupInstagramAutomationWorker(),
      await setupThreadsAutomationWorker(),
    ];

    // Setup cron jobs
    await setupRecurringJobs();

    // Repair anything a previous restart interrupted, then keep checking:
    // interrupted sends become visible failures, lost queue entries return.
    const reconcile = () => reconcileScheduledPosts().catch((error) => console.error('Scheduled post reconciliation failed:', error));
    void reconcile();
    const reconcileTimer = setInterval(reconcile, RECONCILE_INTERVAL_MS);
    reconcileTimer.unref();

    const server: Server = app.listen(Number(env.BACKEND_PORT), '0.0.0.0', () => {
      console.log(`Server is running on port ${env.BACKEND_PORT}`);
    });

    // On deploy, stop taking new jobs and let in-flight publications finish
    // instead of being cut mid-send.
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal} received: finishing active jobs before exit.`);
      clearInterval(reconcileTimer);
      const force = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
      force.unref();
      server.close();
      await Promise.allSettled(workers.map((worker) => worker.close()));
      process.exit(0);
    };
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
