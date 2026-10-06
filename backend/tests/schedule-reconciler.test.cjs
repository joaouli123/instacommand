const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let posts, jobs, notified, added, removed;
const NOW = new Date('2026-10-07T12:00:00Z');
const minutes = (n) => new Date(NOW.getTime() + n * 60_000);

require.cache[require.resolve('../dist/config/redis')] = { exports: { redisConnection: {} } };
require.cache[require.resolve('bullmq')] = { exports: { Worker: class {}, Queue: class {
  async getJob(id) {
    const job = jobs[id];
    return job ? { ...job, getState: async () => job.state, remove: async () => { removed.push(id); delete jobs[id]; } } : null;
  }
  async add(name, data, opts) { added.push({ id: opts.jobId, delay: opts.delay }); jobs[opts.jobId] = { state: 'delayed' }; }
} } };
require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: class {
  scheduledPost = {
    findMany: async ({ where }) => posts.filter((post) => post.status === where.status
      && (!where.updatedAt || post.updatedAt < where.updatedAt.lt)),
    updateMany: async ({ where, data }) => {
      const post = posts.find((item) => item.id === where.id && item.status === where.status && +item.updatedAt === +where.updatedAt);
      if (!post) return { count: 0 };
      Object.assign(post, data);
      return { count: 1 };
    },
  };
} } };
require.cache[require.resolve('../dist/services/notifications.service')] = { exports: { notifyPublishFailure: async (userId, id, message) => { notified.push({ id, message }); } } };
const { reconcileScheduledPosts } = require('../dist/services/schedule-reconciler.service');
const { schedulePost } = require('../dist/services/scheduler.service');

beforeEach(() => { posts = []; jobs = {}; notified = []; added = []; removed = []; });
const post = (id, status, extra = {}) => ({ id, userId: 'u', status, updatedAt: minutes(-1), scheduledFor: minutes(60), ...extra });

test('a publication interrupted by a restart becomes a visible failure, never a re-send', async () => {
  posts = [post('stuck', 'PROCESSING', { updatedAt: minutes(-30) }), post('sending', 'PROCESSING', { updatedAt: minutes(-2) })];
  const summary = await reconcileScheduledPosts(NOW);
  assert.equal(summary.interrupted, 1);
  assert.equal(posts[0].status, 'FAILED');
  assert.match(posts[0].errorMessage, /interrompida/);
  assert.equal(posts[1].status, 'PROCESSING');
  assert.deepEqual(added, []);
  assert.equal(notified.length, 1);
});

test('scheduled posts with a live queue entry are left alone', async () => {
  posts = [post('a', 'SCHEDULED'), post('b', 'SCHEDULED')];
  jobs = { a: { state: 'delayed' }, b: { state: 'active' } };
  await reconcileScheduledPosts(NOW);
  assert.deepEqual(added, []);
  assert.equal(posts.every((item) => item.status === 'SCHEDULED'), true);
});

test('a lost queue entry is restored; recently missed posts go out now, old ones are flagged', async () => {
  posts = [post('future', 'SCHEDULED'), post('late', 'SCHEDULED', { scheduledFor: minutes(-30) }), post('old', 'SCHEDULED', { scheduledFor: minutes(-60 * 24) })];
  const summary = await reconcileScheduledPosts(NOW);
  assert.equal(summary.requeued, 2);
  assert.deepEqual(added.map((job) => job.id).sort(), ['future', 'late']);
  assert.equal(posts[2].status, 'FAILED');
  assert.match(posts[2].errorMessage, /horário agendado passou/);
});

test('a job that failed before the post recorded it surfaces the reason', async () => {
  posts = [post('broken', 'SCHEDULED', { scheduledFor: minutes(-5) })];
  jobs = { broken: { state: 'failed', failedReason: 'O carrossel precisa de 2 a 10 mídias.' } };
  await reconcileScheduledPosts(NOW);
  assert.equal(posts[0].status, 'FAILED');
  assert.match(posts[0].errorMessage, /carrossel/);
});

test('re-scheduling replaces a finished job instead of being silently ignored', async () => {
  jobs = { retry: { state: 'failed' } };
  await schedulePost('retry', new Date(Date.now() + 60_000));
  assert.deepEqual(removed, ['retry']);
  assert.equal(added[0].id, 'retry');
  jobs = { busy: { state: 'active' } };
  added = [];
  await schedulePost('busy', new Date(Date.now() + 60_000));
  assert.deepEqual(added, []);
});
