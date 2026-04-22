import db from '../config/database';
import { CallHistory } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class CallModel {
  static create(roomId: string, initiatorId: number): CallHistory {
    const callId = uuidv4();
    const result = db.prepare(
      'INSERT INTO call_history (call_id, room_id, initiator_id) VALUES (?, ?, ?)'
    ).run(callId, roomId, initiatorId);

    return {
      id: result.lastInsertRowid as number,
      call_id: callId,
      room_id: roomId,
      initiator_id: initiatorId,
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: null,
    };
  }

  static endCall(callId: string): boolean {
    const call = db.prepare('SELECT started_at FROM call_history WHERE call_id = ?').get(callId) as CallHistory | undefined;
    
    if (!call) return false;

    const startTime = new Date(call.started_at).getTime();
    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);

    const result = db.prepare(
      'UPDATE call_history SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ? WHERE call_id = ?'
    ).run(durationSeconds, callId);

    return result.changes > 0;
  }

  static findByCallId(callId: string): CallHistory | undefined {
    return db.prepare('SELECT * FROM call_history WHERE call_id = ?').get(callId) as CallHistory | undefined;
  }

  static findByUserId(userId: number, limit: number = 50): CallHistory[] {
    return db.prepare(
      'SELECT * FROM call_history WHERE initiator_id = ? ORDER BY started_at DESC LIMIT ?'
    ).all(userId, limit) as CallHistory[];
  }
}
