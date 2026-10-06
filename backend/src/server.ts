import { env } from './config/env';
import { createApp } from './app';

// Workers
import { setupPublishPostWorker } from './jobs/publishPost.job';
import { setupCollectInsightsWorker } from './jobs/collectInsights.job';
import { setupCollectCompetitorsWorker } from './jobs/collectCompetitors.job';
import { setupInstagramAutomationWorker } from './jobs/instagramAutomation.job';
import { setupThreadsAutomationWorker } from './jobs/threadsAutomation.job';
import { setupRecurringJobs } from './services/scheduler.service';

const app = createApp();

// Start server
const startServer = async () => {
  try {
    // Initialize workers
    setupPublishPostWorker();
    setupCollectInsightsWorker();
    setupCollectCompetitorsWorker();
    setupInstagramAutomationWorker();
    await setupThreadsAutomationWorker();

    // Setup cron jobs
    await setupRecurringJobs();

    app.listen(Number(env.BACKEND_PORT), '0.0.0.0', () => {
      console.log(`Server is running on port ${env.BACKEND_PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
