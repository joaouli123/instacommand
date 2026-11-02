import { DelayedError, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { publishPost, resumeInstagramPublish, sweepPendingChecks } from '../services/instagram/publish.service';
import { getPrisma } from '../lib/prisma';
import { jitter } from '../utils/graph-health';

const prisma = getPrisma();
// Publishing is network-bound; each replica runs this many jobs at once.
const CONCURRENCY = Math.max(1, Number(process.env.PUBLISH_CONCURRENCY) || 20);
// One account (one customer) may use only a few slots, so a big batch never starves the others.
const PER_ACCOUNT = Math.max(1, Number(process.env.PUBLISH_PER_ACCOUNT) || 3);
const SLOT_TTL_SECONDS = 15 * 60;

/** Takes one of the account's slots in Redis (shared by all replicas); false when they are all busy. */
async function takeAccountSlot(accountId: string) {
  const key = `publish:inflight:${accountId}`;
  const used = await redisConnection.incr(key);
  await redisConnection.expire(key, SLOT_TTL_SECONDS);
  if (used <= PER_ACCOUNT) return key;
  await redisConnection.decr(key);
  return null;
}

export const setupPublishPostWorker = () => {
  const worker = new Worker('publish-post', async (job, token) => {
    const { scheduledPostId, scheduledFor } = job.data;
    if (job.name === 'instagram-sweep') {
      const requeued = await sweepPendingChecks();
      if (requeued) console.info(`Re-queued ${requeued} pending media checks.`);
      return;
    }
    const post = await prisma.scheduledPost.findUnique({ where: { id: scheduledPostId }, select: { accountId: true } });
    if (!post) return;
    const slot = await takeAccountSlot(post.accountId);
    if (!slot) {
      // Busy account: try again in a few seconds without failing or blocking other customers.
      await job.moveToDelayed(Date.now() + 5_000 + jitter(10_000), token);
      throw new DelayedError();
    }
    try {
      // A queued check of media still processing: one status call per network, then done.
      if (job.name === 'instagram-check') {
        await resumeInstagramPublish(scheduledPostId, Number(job.data.attempt));
        return;
      }
      console.log(`Processing publish job for post ${scheduledPostId}`);
      const published = await publishPost(scheduledPostId, { scheduledFor });
      console.log(published ? `Successfully published post ${scheduledPostId}` : `Post ${scheduledPostId} skipped or waiting for media processing`);
    } catch (error) {
      console.error(`Failed to publish post ${scheduledPostId}:`, error);
      throw error;
    } finally {
      await redisConnection.decr(slot);
    }
  }, {
    connection: redisConnection,
    concurrency: CONCURRENCY,
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed with error ${err.message}`);
  });

  return worker;
};
