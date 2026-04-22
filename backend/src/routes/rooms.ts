import { Router, Request, Response } from 'express';
import { RoomModel } from '../models/room.model';

const router = Router();

// Get all rooms (no auth required)
router.get('/', (req: Request, res: Response) => {
  try {
    const permanentRooms = RoomModel.findPermanentRooms();

    return res.json({
      rooms: permanentRooms,
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific room by room_id
router.get('/:roomId', (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = RoomModel.findByRoomId(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    return res.json(room);
  } catch (error) {
    console.error('Get room error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new room
router.post('/', (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Room name is required' });
    }

    // Use guest user ID (1)
    const room = RoomModel.create(name, 1, false);

    return res.status(201).json({
      message: 'Room created successfully',
      room,
    });
  } catch (error) {
    console.error('Create room error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete room (if not permanent)
router.delete('/:roomId', (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = RoomModel.findByRoomId(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.is_permanent) {
      return res.status(403).json({ error: 'Cannot delete permanent room' });
    }

    RoomModel.delete(roomId);

    return res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete room error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
