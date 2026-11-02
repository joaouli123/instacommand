import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { publishPost, resumeInstagramPublish } from '../services/instagram/publish.service';

export const setupPublishPostWorker = () => {
  const worker = new Worker('publish-post', async job => {
    const { scheduledPostId, scheduledFor } = job.data;
    // A queued check of an Instagram video still processing: one Graph call, then done.
    if (job.name === 'instagram-check') {
      await resumeInstagramPublish(scheduledPostId, Number(job.data.attempt));
      return;
    }
    console.log(`Processing publish job for post ${scheduledPostId}`);
    
    try {
      const published = await publishPost(scheduledPostId, { scheduledFor });
      console.log(published ? `Successfully published post ${scheduledPostId}` : `Skipped stale publish job for post ${scheduledPostId}`);
    } catch (error) {
      console.error(`Failed to publish post ${scheduledPostId}:`, error);
      throw error;
    }
  }, {
    connection: redisConnection,
    concurrency: 5,
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed with error ${err.message}`);
  });

  return worker;
};
