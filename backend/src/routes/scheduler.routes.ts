import { getPrisma } from '../lib/prisma';
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { publishQueue, reschedulePost, cancelScheduledPost } from '../services/scheduler.service';


const router = Router();
const prisma = getPrisma();

router.use(authenticate);

router.get('/queue', async (req, res, next) => {
  try {
    const active = await publishQueue.getActiveCount();
    const waiting = await publishQueue.getWaitingCount();
    const delayed = await publishQueue.getDelayedCount();
    const failed = await publishQueue.getFailedCount();

    res.json({ active, waiting, delayed, failed });
  } catch (error) { next(error); }
});

router.get('/upcoming', async (req: any, res, next) => {
  try {
    const jobs = await publishQueue.getDelayed();
    // The queue is shared by every workspace; only expose this user's posts.
    const postIds = jobs.map(j => String(j.data?.scheduledPostId || j.id || '')).filter(Boolean);
    const owned = new Set((await prisma.scheduledPost.findMany({
      where: { id: { in: postIds }, userId: req.user.id },
      select: { id: true },
    })).map(post => post.id));
    res.json(jobs
      .filter(j => owned.has(String(j.data?.scheduledPostId || j.id || '')))
      .map(j => ({ id: j.id, name: j.name, data: j.data, delay: j.delay })));
  } catch (error) { next(error); }
});

router.post('/:postId/reschedule', async (req: any, res, next) => {
  try {
    const post = await prisma.scheduledPost.findFirst({ where: { id: req.params.postId, userId: req.user.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    // Rescheduling a published or in-flight post would queue it a second time.
    if (post.status !== 'SCHEDULED') return res.status(409).json({ error: 'Somente publicações agendadas podem ser reagendadas.' });
    const { newPublishAt } = req.body;
    const newDate = new Date(newPublishAt);
    if (Number.isNaN(newDate.getTime()) || newDate <= new Date()) return res.status(400).json({ error: 'Informe uma data futura válida' });
    const moved = await prisma.scheduledPost.updateMany({ where: { id: post.id, status: 'SCHEDULED' }, data: { scheduledFor: newDate } });
    if (!moved.count) return res.status(409).json({ error: 'Esta publicação mudou de estado. Atualize e confira antes de tentar novamente.' });
    await reschedulePost(req.params.postId, newDate);
    res.json({ message: 'Post rescheduled successfully' });
  } catch (error) { next(error); }
});

router.delete('/:postId', async (req, res, next) => {
  try {
    const post = await prisma.scheduledPost.findFirst({ where: { id: req.params.postId, userId: (req as any).user.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    // Only a pending schedule can return to draft; a published or in-flight
    // post must keep its real state.
    if (post.status !== 'SCHEDULED') return res.status(409).json({ error: 'Somente publicações agendadas podem voltar para rascunho.' });
    await cancelScheduledPost(req.params.postId);
    const reverted = await prisma.scheduledPost.updateMany({ where: { id: post.id, status: 'SCHEDULED' }, data: { status: 'DRAFT' } });
    if (!reverted.count) return res.status(409).json({ error: 'Esta publicação mudou de estado. Atualize e confira antes de tentar novamente.' });
    res.json({ message: 'Scheduled post cancelled' });
  } catch (error) { next(error); }
});

export default router;
