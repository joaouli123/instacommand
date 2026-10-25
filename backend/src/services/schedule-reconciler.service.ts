import { getPrisma } from '../lib/prisma';

import { publishQueue, schedulePost } from './scheduler.service';
import { notifyPublishFailure } from './notifications.service';
import { LATE_PUBLISH_WINDOW_MS, MISSED_SCHEDULE_MESSAGE } from '../utils/publish-timing';

export { LATE_PUBLISH_WINDOW_MS } from '../utils/publish-timing';

const prisma = getPrisma();

// A publication still "PROCESSING" after this long was interrupted (e.g. the
// container restarted mid-send). Video processing at Meta can take minutes.
export const STALE_PROCESSING_MS = 20 * 60_000;

const INTERRUPTED = 'A publicação foi interrompida durante o envio (o servidor reiniciou). Confira nas redes se ela foi ao ar antes de tentar novamente.';
const MISSED = MISSED_SCHEDULE_MESSAGE;

async function failOnce(post: { id: string; userId: string; status: string; updatedAt: Date }, message: string) {
  // Conditional on the state we saw, so it never overwrites a concurrent change.
  const changed = await prisma.scheduledPost.updateMany({
    where: { id: post.id, status: post.status as any, updatedAt: post.updatedAt },
    data: { status: 'FAILED', errorMessage: message },
  });
  if (changed.count) await notifyPublishFailure(post.userId, post.id, message).catch(() => undefined);
  return changed.count > 0;
}

/**
 * Keeps the database and the publish queue consistent across deploys and
 * Redis restarts. Safe to run concurrently from two containers during a
 * rolling update: every write is conditional and re-enqueueing is idempotent.
 * It never re-sends a publication whose outcome is uncertain.
 */
export async function reconcileScheduledPosts(now = new Date()) {
  const summary = { interrupted: 0, requeued: 0, missed: 0, failedInQueue: 0 };

  const stale = await prisma.scheduledPost.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
    select: { id: true, userId: true, status: true, updatedAt: true },
  });
  for (const post of stale) if (await failOnce(post, INTERRUPTED)) summary.interrupted++;

  const scheduled = await prisma.scheduledPost.findMany({
    where: { status: 'SCHEDULED' },
    select: { id: true, userId: true, status: true, updatedAt: true, scheduledFor: true },
  });
  for (const post of scheduled) {
    // Existing delayed/waiting entries can also be old after Redis recovery.
    // The conditional write cannot overwrite a worker that already claimed it.
    const overdue = now.getTime() - post.scheduledFor.getTime();
    if (overdue > LATE_PUBLISH_WINDOW_MS) {
      if (await failOnce(post, MISSED)) summary.missed++;
      continue;
    }
    const job = await publishQueue.getJob(post.id);
    const state = job ? await job.getState() : null;
    if (state && ['delayed', 'waiting', 'active', 'waiting-children', 'prioritized'].includes(state)) continue;

    if (state === 'failed') {
      // The job ran and threw before the post could record it (e.g. validation).
      if (await failOnce(post, job?.failedReason ? `A publicação não pôde ser enviada: ${job.failedReason}` : MISSED)) summary.failedInQueue++;
      continue;
    }
    // Missing (lost queue) or finished without effect: queue it again.
    await schedulePost(post.id, post.scheduledFor);
    summary.requeued++;
  }

  if (summary.interrupted || summary.requeued || summary.missed || summary.failedInQueue) {
    console.info('Scheduled posts reconciled:', summary);
  }
  return summary;
}
