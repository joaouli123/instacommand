import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { publishQueue, reschedulePost, cancelScheduledPost } from '../services/scheduler.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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

router.get('/upcoming', async (req, res, next) => {
  try {
    const jobs = await publishQueue.getDelayed();
    res.json(jobs.map(j => ({ id: j.id, name: j.name, data: j.data, delay: j.delay })));
  } catch (error) { next(error); }
});

router.post('/:postId/reschedule', async (req: any, res, next) => {
  try {
    const post = await prisma.scheduledPost.findFirst({ where: { id: req.params.postId, userId: req.user.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const { newPublishAt } = req.body;
    const newDate = new Date(newPublishAt);
    if (Number.isNaN(newDate.getTime()) || newDate <= new Date()) return res.status(400).json({ error: 'Informe uma data futura válida' });
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { scheduledFor: newDate, status: 'SCHEDULED' } });
    await reschedulePost(req.params.postId, newDate);
    res.json({ message: 'Post rescheduled successfully' });
  } catch (error) { next(error); }
});

router.delete('/:postId', async (req, res, next) => {
  try {
    const post = await prisma.scheduledPost.findFirst({ where: { id: req.params.postId, userId: (req as any).user.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await cancelScheduledPost(req.params.postId);
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'DRAFT' } });
    res.json({ message: 'Scheduled post cancelled' });
  } catch (error) { next(error); }
});

export default router;
