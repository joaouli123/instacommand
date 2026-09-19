import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { publishQueue, reschedulePost, cancelScheduledPost } from '../services/scheduler.service';

const router = Router();

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
    const { newPublishAt } = req.body;
    await reschedulePost(req.params.postId, new Date(newPublishAt));
    res.json({ message: 'Post rescheduled successfully' });
  } catch (error) { next(error); }
});

router.delete('/:postId', async (req, res, next) => {
  try {
    await cancelScheduledPost(req.params.postId);
    res.json({ message: 'Scheduled post cancelled' });
  } catch (error) { next(error); }
});

export default router;
