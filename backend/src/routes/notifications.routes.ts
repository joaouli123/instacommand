import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications.service';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    res.json(await listNotifications(req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.post('/read-all', async (req: AuthRequest, res, next) => {
  try {
    await markAllNotificationsRead(req.user!.id);
    res.json({ message: 'Notificações marcadas como lidas' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    await markNotificationRead(req.params.id, req.user!.id);
    res.json({ message: 'Notificação marcada como lida' });
  } catch (error) {
    next(error);
  }
});

export default router;
