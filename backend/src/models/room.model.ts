import db from '../config/database';
import { MeetingRoom } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class RoomModel {
  static create(name: string, createdBy: number, isPermanent: boolean = false): MeetingRoom {
    const roomId = uuidv4();
    const result = db.prepare(
      'INSERT INTO meeting_rooms (room_id, name, created_by, is_permanent) VALUES (?, ?, ?, ?)'
    ).run(roomId, name, createdBy, isPermanent ? 1 : 0);

    return {
      id: result.lastInsertRowid as number,
      room_id: roomId,
      name,
      created_by: createdBy,
      is_permanent: isPermanent,
      created_at: new Date().toISOString(),
    };
  }

  static findByRoomId(roomId: string): MeetingRoom | undefined {
    return db.prepare('SELECT * FROM meeting_rooms WHERE room_id = ?').get(roomId) as MeetingRoom | undefined;
  }

  static findById(id: number): MeetingRoom | undefined {
    return db.prepare('SELECT * FROM meeting_rooms WHERE id = ?').get(id) as MeetingRoom | undefined;
  }

  static findByUserId(userId: number): MeetingRoom[] {
    return db.prepare('SELECT * FROM meeting_rooms WHERE created_by = ? ORDER BY created_at DESC').all(userId) as MeetingRoom[];
  }

  static findPermanentRooms(): MeetingRoom[] {
    return db.prepare('SELECT * FROM meeting_rooms WHERE is_permanent = 1').all() as MeetingRoom[];
  }

  static delete(roomId: string): boolean {
    const result = db.prepare('DELETE FROM meeting_rooms WHERE room_id = ? AND is_permanent = 0').run(roomId);
    return result.changes > 0;
  }
}
