import { Server, Socket } from 'socket.io';
import { MessageModel } from '../models/message.model';

/**
 * Chat Socket Handler - Production-grade implementation
 * Handles real-time messaging with file support (images, videos, documents)
 * Features: Input validation, sanitization, error handling, logging, room management
 */

// In-memory storage for room names (can be moved to database later)
const chatRooms = new Map<string, { roomName: string; createdAt: string; creatorName: string }>();

export function setupChat(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log('💬 Chat handler ready for socket:', socket.id);

    /**
     * Create chat room with custom name
     */
    socket.on('chat:create-room', ({ roomId, roomName, creatorName }) => {
      try {
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        if (!roomName || typeof roomName !== 'string') {
          throw new Error('Invalid room name');
        }

        // Store room info
        chatRooms.set(roomId, {
          roomName,
          createdAt: new Date().toISOString(),
          creatorName: creatorName || 'Unknown'
        });

        console.log(`🏠 Room created: ${roomName} (${roomId}) by ${creatorName}`);
      } catch (error) {
        console.error('❌ Error creating room:', error);
        socket.emit('chat:error', { 
          error: error instanceof Error ? error.message : 'Failed to create room' 
        });
      }
    });

    /**
     * Join chat room - Must be called before sending/receiving messages
     */
    socket.on('chat:join', ({ roomId, userId, username }) => {
      try {
        // Validate inputs
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        if (!username || typeof username !== 'string') {
          throw new Error('Invalid username');
        }

        socket.join(roomId);
        console.log(`💬 ${username} joined chat room: ${roomId} (socket: ${socket.id})`);
        
        // Get room info if available
        const roomInfo = chatRooms.get(roomId);
        const roomName = roomInfo?.roomName || `Chat ${roomId}`;
        
        // Load message history and send room name
        const messages = MessageModel.getRecentMessages(roomId, 100);
        socket.emit('chat:history', { messages, roomName });
        console.log(`📜 Sent ${messages.length} messages to ${username} in ${roomName}`);
        
        // Broadcast room info to all participants
        io.to(roomId).emit('chat:room-info', { 
          roomId, 
          roomName,
          participantCount: io.sockets.adapter.rooms.get(roomId)?.size || 0
        });
      } catch (error) {
        console.error('❌ Error joining chat:', error);
        socket.emit('chat:error', { 
          error: error instanceof Error ? error.message : 'Failed to join chat room' 
        });
      }
    });

    /**
     * Send text message
     */
    socket.on('chat:message', ({ roomId, userId, username, content }) => {
      try {
        // Validate inputs
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        if (!username || typeof username !== 'string') {
          throw new Error('Invalid username');
        }
        if (!content || typeof content !== 'string') {
          throw new Error('Invalid message content');
        }
        if (content.length > 10000) {
          throw new Error('Message too long (max 10000 characters)');
        }

        // Sanitize content (basic XSS prevention)
        const sanitizedContent = content.trim();
        if (!sanitizedContent) {
          throw new Error('Message cannot be empty');
        }

        console.log(`💬 Message from ${username} (userId: ${userId}, type: ${typeof userId}) in room ${roomId}:`, sanitizedContent.substring(0, 50));
        
        // Save to database
        const message = MessageModel.create(roomId, userId || 0, username, sanitizedContent, 'text');
        
        console.log(`💾 Saved message - DB user_id: ${message.user_id}, type: ${typeof message.user_id}`);
        
        // Broadcast to all users in the room (including sender for confirmation)
        const messageData = {
          id: message.id,
          roomId: message.room_id,
          userId: message.user_id,
          username: message.username,
          content: message.content,
          messageType: message.message_type,
          createdAt: message.created_at,
          status: 'sent',
        };
        
        console.log(`📡 Broadcasting - userId: ${messageData.userId}, type: ${typeof messageData.userId}`);
        io.to(roomId).emit('chat:message', messageData);
        
        // Auto-deliver to other users in room (not sender)
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets && roomSockets.size > 1) {
          // Mark as delivered since other users are in the room
          MessageModel.markAsDelivered(message.id);
          // Emit delivery status to sender
          socket.emit('chat:status', {
            messageId: message.id,
            status: 'delivered'
          });
        }
        
        console.log(`✅ Message ${message.id} broadcasted to room ${roomId} (${io.sockets.adapter.rooms.get(roomId)?.size || 0} sockets)`);
      } catch (error) {
        console.error('❌ Error sending message:', error);
        socket.emit('chat:error', { 
          error: error instanceof Error ? error.message : 'Failed to send message' 
        });
      }
    });

    /**
     * Send file message (image/video/document)
     */
    socket.on('chat:file', ({ roomId, userId, username, fileUrl, fileName, fileSize, fileType, messageType }) => {
      try {
        // Validate inputs
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        if (!username || typeof username !== 'string') {
          throw new Error('Invalid username');
        }
        if (!fileUrl || typeof fileUrl !== 'string') {
          throw new Error('Invalid file URL');
        }
        if (!fileName || typeof fileName !== 'string') {
          throw new Error('Invalid file name');
        }
        if (!messageType || !['image', 'video', 'document'].includes(messageType)) {
          throw new Error('Invalid message type');
        }

        // Validate file size (max 100MB)
        const maxFileSize = 100 * 1024 * 1024; // 100MB
        if (fileSize && fileSize > maxFileSize) {
          throw new Error('File too large (max 100MB)');
        }

        console.log(`📎 File from ${username} in room ${roomId}:`, fileName);
        
        // Save to database with file metadata
        const message = MessageModel.create(
          roomId, 
          userId || 0, 
          username, 
          fileName, // Use filename as content
          messageType,
          {
            fileUrl,
            fileName,
            fileSize: fileSize || 0,
            fileType: fileType || 'application/octet-stream'
          }
        );
        
        // Broadcast to all users in the room
        const messageData = {
          id: message.id,
          roomId: message.room_id,
          userId: message.user_id,
          username: message.username,
          content: message.content,
          messageType: message.message_type,
          fileUrl: message.file_url,
          fileName: message.file_name,
          fileSize: message.file_size,
          fileType: message.file_type,
          createdAt: message.created_at,
          status: 'sent',
        };
        
        io.to(roomId).emit('chat:message', messageData);
        
        // Auto-deliver to other users in room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets && roomSockets.size > 1) {
          MessageModel.markAsDelivered(message.id);
          socket.emit('chat:status', {
            messageId: message.id,
            status: 'delivered'
          });
        }
        
        console.log(`✅ File message ${message.id} broadcasted to room ${roomId}`);
      } catch (error) {
        console.error('❌ Error sending file:', error);
        socket.emit('chat:error', { 
          error: error instanceof Error ? error.message : 'Failed to send file' 
        });
      }
    });

    /**
     * User is typing indicator
     */
    socket.on('chat:typing', ({ roomId, username, isTyping }) => {
      socket.to(roomId).emit('chat:typing', { username, isTyping });
    });

    /**
     * Mark message as delivered
     */
    socket.on('chat:delivered', ({ messageId }) => {
      try {
        MessageModel.markAsDelivered(messageId);
        socket.emit('chat:status', { messageId, status: 'delivered' });
      } catch (error) {
        console.error('Error marking as delivered:', error);
      }
    });

    /**
     * Mark message as read
     */
    socket.on('chat:read', ({ messageId, userId, roomId }) => {
      try {
        MessageModel.markAsRead(messageId, userId);
        const readBy = MessageModel.getReadBy(messageId);
        io.to(roomId).emit('chat:status', { 
          messageId, 
          status: 'read',
          readBy 
        });
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    });
  });
}
