import db from '../config/database';
import { Message, MessageReadReceipt } from '../types';

export class MessageModel {
  static create(
    roomId: string, 
    userId: string, 
    username: string, 
    content: string, 
    messageType: 'text' | 'system' | 'image' | 'video' | 'document' = 'text',
    fileData?: {
      fileUrl: string;
      fileName: string;
      fileSize: number;
      fileType: string;
    }
  ): Message {
    const result = db.prepare(
      `INSERT INTO messages (room_id, user_id, username, content, message_type, file_url, file_name, file_size, file_type, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      roomId, 
      userId, 
      username, 
      content, 
      messageType,
      fileData?.fileUrl || null,
      fileData?.fileName || null,
      fileData?.fileSize || null,
      fileData?.fileType || null,
      'sent'
    );

    return {
      id: result.lastInsertRowid as number,
      room_id: roomId,
      user_id: userId,
      username,
      content,
      message_type: messageType,
      file_url: fileData?.fileUrl,
      file_name: fileData?.fileName,
      file_size: fileData?.fileSize,
      file_type: fileData?.fileType,
      status: 'sent',
      created_at: new Date().toISOString(),
    };
  }

  static findByRoomId(roomId: string, limit: number = 100): Message[] {
    const messages = db.prepare(
      'SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(roomId, limit) as Message[];

    // Get read receipts for each message
    return messages.map(msg => ({
      ...msg,
      read_by: this.getReadBy(msg.id)
    }));
  }

  static getRecentMessages(roomId: string, limit: number = 100): Message[] {
    const messages = this.findByRoomId(roomId, limit);
    return messages.reverse(); // Return in chronological order
  }

  static markAsDelivered(messageId: number): boolean {
    const result = db.prepare(
      'UPDATE messages SET status = ? WHERE id = ? AND status = ?'
    ).run('delivered', messageId, 'sent');
    return result.changes > 0;
  }

  static markAsRead(messageId: number, userId: string): boolean {
    try {
      // Add read receipt
      db.prepare(
        'INSERT OR IGNORE INTO message_read_receipts (message_id, user_id) VALUES (?, ?)'
      ).run(messageId, userId);

      // Update message status to read if it's the first read
      const readCount = db.prepare(
        'SELECT COUNT(*) as count FROM message_read_receipts WHERE message_id = ?'
      ).get(messageId) as { count: number };

      if (readCount.count > 0) {
        db.prepare(
          'UPDATE messages SET status = ? WHERE id = ?'
        ).run('read', messageId);
      }

      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }

  static getReadBy(messageId: number): string[] {
    const receipts = db.prepare(
      'SELECT user_id FROM message_read_receipts WHERE message_id = ?'
    ).all(messageId) as MessageReadReceipt[];
    
    return receipts.map(r => r.user_id);
  }

  static deleteByRoomId(roomId: string): boolean {
    // First delete read receipts for messages in this room
    const messageIds = db.prepare(
      'SELECT id FROM messages WHERE room_id = ?'
    ).all(roomId) as { id: number }[];

    for (const msg of messageIds) {
      db.prepare('DELETE FROM message_read_receipts WHERE message_id = ?').run(msg.id);
    }

    // Then delete messages
    const result = db.prepare('DELETE FROM messages WHERE room_id = ?').run(roomId);
    return result.changes > 0;
  }
}
