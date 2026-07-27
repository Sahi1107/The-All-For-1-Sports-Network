import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import { env } from '../config/env';
import { pushEnabled } from '../services/notifications/webpush';

const router = Router();

// GET /api/push/vapid — the public key the client needs to subscribe.
router.get('/vapid', (_req: Request, res: Response) => {
  if (!pushEnabled) { res.status(503).json({ error: 'Push not configured' }); return; }
  res.json({ publicKey: env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — store this browser's push subscription.
router.post('/subscribe', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  if (!pushEnabled) { res.status(503).json({ error: 'Push not configured' }); return; }
  const { endpoint, keys } = req.body ?? {};
  if (typeof endpoint !== 'string' || !keys?.p256dh || !keys?.auth) { res.status(400).json({ error: 'Invalid subscription' }); return; }
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user!.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: req.user!.userId, p256dh: keys.p256dh, auth: keys.auth },
    });
    res.json({ subscribed: true });
  } catch (e) { console.error('push.subscribe', e); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/push/unsubscribe — forget this browser's subscription.
router.post('/unsubscribe', authenticate, async (req: AuthRequest, res: Response) => {
  const { endpoint } = req.body ?? {};
  if (typeof endpoint === 'string') {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.userId } }).catch(() => {});
  }
  res.json({ unsubscribed: true });
});

export default router;
