import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PushSubscriptionModel } from '../models/pushSubscription.model';
import { getPublicVapidKey } from '../services/pushNotification';

const router = Router();

const subscriptionSchema = z.object({
  username: z.string().min(1),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

router.get('/public-key', (_req: Request, res: Response) => {
  const publicKey = getPublicVapidKey();
  if (!publicKey) {
    return res.status(404).json({ error: 'Push is not configured on server' });
  }

  return res.json({ publicKey });
});

router.post('/subscribe', (req: Request, res: Response) => {
  try {
    const parsed = subscriptionSchema.parse(req.body);
    PushSubscriptionModel.upsert({
      username: parsed.username,
      endpoint: parsed.subscription.endpoint,
      p256dh: parsed.subscription.keys.p256dh,
      auth: parsed.subscription.keys.auth,
    });

    return res.status(201).json({ message: 'Push subscription saved' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(400).json({ error: 'Invalid subscription payload' });
  }
});

router.post('/unsubscribe', (req: Request, res: Response) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  PushSubscriptionModel.removeByEndpoint(endpoint);
  return res.json({ message: 'Push subscription removed' });
});

export default router;
