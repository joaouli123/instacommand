import { Router, Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { Queue } from 'bullmq';
import { env } from '../config/env';
import { redisConnection } from '../config/redis';
import type { InstagramAutomationEvent } from '../services/automation.service';
import { parseInstagramWebhookEvents } from '../services/instagram-webhook-parser';

const router = Router();
const queue = new Queue<InstagramAutomationEvent>('instagram-webhooks', { connection: redisConnection });
type RawRequest = Request & { rawBody?: Buffer };

router.get('/instagram', (req, res) => {
  if (!env.WEBHOOK_VERIFY_TOKEN) return res.status(503).send('Webhook Meta não configurado.');
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.WEBHOOK_VERIFY_TOKEN && typeof challenge === 'string') return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post('/instagram', async (req: RawRequest, res) => {
  if (!env.FB_APP_SECRET) return res.status(503).json({ error: 'Webhook Meta indisponível: falta configurar o segredo do app.' });
  const signature = req.header('x-hub-signature-256') || '';
  const rawBody = req.rawBody;
  if (!rawBody || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return res.sendStatus(401);
  const expected = Buffer.from(`sha256=${createHmac('sha256', env.FB_APP_SECRET).update(rawBody).digest('hex')}`);
  const received = Buffer.from(signature.toLowerCase());
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return res.sendStatus(401);

  try {
    const events = parseInstagramWebhookEvents(req.body);
    await Promise.all(events.map((event) => queue.add('process', event, {
      jobId: event.eventKey.replace(/[^a-zA-Z0-9_-]/g, '_'),
      attempts: 5, backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 2_000 }, removeOnFail: { count: 5_000 },
    })));
    // Only counts from signature-verified requests; never log message content,
    // participant identifiers, access tokens, or the verification secret.
    console.info('Instagram webhook accepted', {
      instagramObject: req.body?.object === 'instagram',
      entries: Array.isArray(req.body?.entry) ? req.body.entry.length : 0,
      queuedEvents: events.length,
    });
    return res.sendStatus(200);
  } catch (error) {
    console.error('Could not queue Instagram webhook:', error);
    return res.sendStatus(500);
  }
});

export default router;
