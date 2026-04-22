import { Router, Request, Response } from 'express';
import { MessageModel } from '../models/message.model';

const router = Router();

// Get messages for a specific room
router.get('/:roomId', (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const messages = MessageModel.getRecentMessages(roomId, limit);

    return res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
