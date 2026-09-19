import { Worker } from 'bullmq';
import { env } from '../config/env';
import { publishPost } from '../services/instagram/publish.service';

export const setupPublishPostWorker = () => {
  const worker = new Worker('publish-post', async job => {
    const { scheduledPostId } = job.data;
    console.log(`Processing publish job for post ${scheduledPostId}`);
    
    try {
      await publishPost(scheduledPostId);
      console.log(`Successfully published post ${scheduledPostId}`);
    } catch (error) {
      console.error(`Failed to publish post ${scheduledPostId}:`, error);
      throw error;
    }
  }, {
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed with error ${err.message}`);
  });

  return worker;
};
