import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { CallModel } from '../models/call.model';
import { CallInvitationModel } from '../models/callInvitation.model';
import { sendIncomingCallPush } from '../services/pushNotification';
import { RoomParticipant } from '../types';

interface ActiveCallInvite {
  invitationId: string;
  callSessionId: string;
  callerName: string;
  calleeName: string;
  callerSocketId: string;
  calleeSocketId: string;
  callType: 'audio' | 'video';
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'missed';
  timeout: NodeJS.Timeout;
}

interface UserPresence {
  username: string;
  userId: number;
  socketId: string;
}

// Store active rooms and their participants
const activeRooms = new Map<string, Map<string, RoomParticipant>>();

// Presence maps for direct calling
const socketPresence = new Map<string, UserPresence>();
const usernameToSockets = new Map<string, Set<string>>();

// Active direct call invites
const activeInvites = new Map<string, ActiveCallInvite>();

// Guest user counter for auto-assignment
let guestCounter = 1;
const assignedUserIds = new Map<string, number>(); // socketId -> userId

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function addPresence(socketId: string, username: string, userId: number): void {
  removePresence(socketId);
  const normalized = normalizeName(username);
  socketPresence.set(socketId, { username, userId, socketId });

  if (!usernameToSockets.has(normalized)) {
    usernameToSockets.set(normalized, new Set());
  }
  usernameToSockets.get(normalized)!.add(socketId);
}

function removePresence(socketId: string): void {
  const presence = socketPresence.get(socketId);
  if (!presence) return;

  socketPresence.delete(socketId);
  assignedUserIds.delete(socketId);
  const normalized = normalizeName(presence.username);
  const sockets = usernameToSockets.get(normalized);
  if (!sockets) return;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    usernameToSockets.delete(normalized);
  }
}

function getOnlineUsers(): UserPresence[] {
  return Array.from(socketPresence.values());
}

function broadcastOnlineUsers(io: Server): void {
  const users = getOnlineUsers();
  io.emit('users:online', { users });
  console.log(`📡 Broadcasting ${users.length} online users`);
}

function getAnySocketIdForUsername(username: string, excludingSocketId?: string): string | null {
  const sockets = usernameToSockets.get(normalizeName(username));
  if (!sockets || sockets.size === 0) return null;

  for (const socketId of sockets.values()) {
    if (!excludingSocketId || socketId !== excludingSocketId) {
      return socketId;
    }
  }

  return null;
}

export function setupSignaling(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Register a user presence for direct calling
    socket.on('direct:register', ({ username }: { username: string }) => {
      try {
        if (!username || typeof username !== 'string' || !username.trim()) {
          throw new Error('Valid username is required for registration');
        }

        // Assign unique userId if not already assigned
        let userId = assignedUserIds.get(socket.id);
        if (!userId) {
          userId = guestCounter++;
          assignedUserIds.set(socket.id, userId);
        }

        addPresence(socket.id, username.trim(), userId);
        socket.emit('direct:registered', { username: username.trim(), userId });
        broadcastOnlineUsers(io);
        console.log(`📡 Registered: ${username.trim()} (userId: ${userId}, socketId: ${socket.id})`);
      } catch (error) {
        console.error('❌ direct:register error:', error);
        socket.emit('call:error', {
          message: error instanceof Error ? error.message : 'Failed to register for direct calling',
        });
      }
    });

    // Send online users list on request
    socket.on('users:get', () => {
      const users = getOnlineUsers();
      socket.emit('users:online', { users });
    });

    // Initiate a direct call invitation by recipient name.
    socket.on(
      'call:initiate',
      async ({
        targetName,
        callerName,
        callType,
      }: {
        targetName: string;
        callerName: string;
        callType?: 'audio' | 'video';
      }) => {
        try {
          if (!targetName || typeof targetName !== 'string') {
            throw new Error('Target name is required');
          }
          if (!callerName || typeof callerName !== 'string') {
            throw new Error('Caller name is required');
          }

          const normalizedTarget = normalizeName(targetName);
          const normalizedCaller = normalizeName(callerName);
          if (normalizedTarget === normalizedCaller) {
            throw new Error('You cannot call yourself');
          }

          // Keep socket presence in sync with caller name.
          const callerUserId = assignedUserIds.get(socket.id) || socketPresence.get(socket.id)?.userId || 0;
          addPresence(socket.id, callerName, callerUserId);

          const inviteType: 'audio' | 'video' = callType === 'video' ? 'video' : 'audio';
          const invitationId = uuidv4();
          const callSessionId = `direct_${uuidv4()}`;
          const calleeSocketId = getAnySocketIdForUsername(targetName, socket.id);

          // Persist invitation status regardless of online/offline target.
          CallInvitationModel.create({
            invitationId,
            callSessionId,
            callerName,
            calleeName: targetName,
            callType: inviteType,
          });

          if (!calleeSocketId) {
            CallInvitationModel.updateStatus(invitationId, 'failed');
            socket.emit('call:unavailable', {
              invitationId,
              message: `${targetName} is offline or unavailable`,
            });

            await sendIncomingCallPush({
              calleeName: targetName,
              callerName,
              invitationId,
              callSessionId,
              callType: inviteType,
            });
            return;
          }

          const timeout = setTimeout(() => {
            const invite = activeInvites.get(invitationId);
            if (!invite || invite.status !== 'pending') return;

            invite.status = 'missed';
            CallInvitationModel.updateStatus(invitationId, 'missed');

            io.to(invite.callerSocketId).emit('call:timeout', {
              invitationId,
              calleeName: invite.calleeName,
              callSessionId: invite.callSessionId,
            });

            io.to(invite.calleeSocketId).emit('call:missed', {
              invitationId,
              callerName: invite.callerName,
              callSessionId: invite.callSessionId,
            });

            activeInvites.delete(invitationId);
          }, 30000);

          const invite: ActiveCallInvite = {
            invitationId,
            callSessionId,
            callerName,
            calleeName: targetName,
            callerSocketId: socket.id,
            calleeSocketId,
            callType: inviteType,
            status: 'pending',
            timeout,
          };

          activeInvites.set(invitationId, invite);

          socket.emit('call:ringing', {
            invitationId,
            callSessionId,
            targetName,
            callType: inviteType,
          });

          io.to(calleeSocketId).emit('call:incoming', {
            invitationId,
            callSessionId,
            callerName,
            calleeName: targetName,
            callType: inviteType,
            timeoutMs: 30000,
          });

          // Push even when online to increase chance of user noticing in background tabs/devices.
          await sendIncomingCallPush({
            calleeName: targetName,
            callerName,
            invitationId,
            callSessionId,
            callType: inviteType,
          });
        } catch (error) {
          console.error('❌ call:initiate error:', error);
          socket.emit('call:error', {
            message: error instanceof Error ? error.message : 'Failed to initiate call',
          });
        }
      }
    );

    socket.on('call:accept', ({ invitationId }: { invitationId: string }) => {
      const invite = activeInvites.get(invitationId);
      if (!invite || invite.status !== 'pending') return;
      if (invite.calleeSocketId !== socket.id) return;

      invite.status = 'accepted';
      clearTimeout(invite.timeout);
      CallInvitationModel.updateStatus(invitationId, 'accepted');

      io.to(invite.callerSocketId).emit('call:accepted', {
        invitationId,
        callSessionId: invite.callSessionId,
        peerName: invite.calleeName,
        callType: invite.callType,
      });

      io.to(invite.calleeSocketId).emit('call:accepted', {
        invitationId,
        callSessionId: invite.callSessionId,
        peerName: invite.callerName,
        callType: invite.callType,
      });

      activeInvites.delete(invitationId);
    });

    socket.on('call:reject', ({ invitationId }: { invitationId: string }) => {
      const invite = activeInvites.get(invitationId);
      if (!invite || invite.status !== 'pending') return;
      if (invite.calleeSocketId !== socket.id) return;

      invite.status = 'rejected';
      clearTimeout(invite.timeout);
      CallInvitationModel.updateStatus(invitationId, 'rejected');

      io.to(invite.callerSocketId).emit('call:rejected', {
        invitationId,
        calleeName: invite.calleeName,
      });

      activeInvites.delete(invitationId);
    });

    socket.on('call:cancel', ({ invitationId }: { invitationId: string }) => {
      const invite = activeInvites.get(invitationId);
      if (!invite || invite.status !== 'pending') return;
      if (invite.callerSocketId !== socket.id) return;

      invite.status = 'cancelled';
      clearTimeout(invite.timeout);
      CallInvitationModel.updateStatus(invitationId, 'cancelled');

      io.to(invite.calleeSocketId).emit('call:cancelled', {
        invitationId,
        callerName: invite.callerName,
      });

      activeInvites.delete(invitationId);
    });

    // Handle call end during active call
    socket.on('call:end', ({ roomId, username }: { roomId: string; username: string }) => {
      try {
        console.log(`📴 User ${username} ended call in room ${roomId}`);
        
        // Notify all other participants in the room
        socket.to(roomId).emit('call:ended', {
          username,
          roomId,
        });
      } catch (error) {
        console.error('❌ call:end error:', error);
      }
    });

    // Join room
    socket.on('join-room', ({ roomId, userId, username }) => {
      try {
        // Validate inputs
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        if (!username || typeof username !== 'string') {
          throw new Error('Invalid username');
        }

        // Sync presence for direct calling while preserving room flow.
        const finalUserId = userId || assignedUserIds.get(socket.id) || 0;
        addPresence(socket.id, username, finalUserId);

        console.log(`🚪 ${username} (${userId}, socket: ${socket.id}) joining room: ${roomId}`);

        socket.join(roomId);

        // Add participant to active rooms
        if (!activeRooms.has(roomId)) {
          activeRooms.set(roomId, new Map());
        }

        const participant: RoomParticipant = {
          userId,
          username,
          socketId: socket.id,
          joinedAt: new Date().toISOString(),
        };

        activeRooms.get(roomId)!.set(socket.id, participant);

        // Get list of other participants in the room
        const participants = Array.from(activeRooms.get(roomId)!.values());

        // Notify others in the room about new participant
        socket.to(roomId).emit('user-joined', participant);

        // Send current participants list to the new user
        socket.emit('room-participants', participants);

        console.log(
          `✅ Room ${roomId} now has ${participants.length} participant(s):`,
          participants.map((p) => p.username).join(', ')
        );
      } catch (error) {
        console.error('❌ Error joining room:', error);
        socket.emit('error', {
          message: error instanceof Error ? error.message : 'Failed to join room',
        });
      }
    });

    // WebRTC Offer
    socket.on('webrtc-offer', ({ roomId, offer, targetSocketId }) => {
      try {
        if (!roomId || !offer) {
          throw new Error('Invalid offer parameters');
        }

        console.log(`WebRTC offer from ${socket.id} to ${targetSocketId} in room ${roomId}`);

        if (targetSocketId) {
          // Send to specific peer
          io.to(targetSocketId).emit('webrtc-offer', {
            offer,
            senderSocketId: socket.id,
          });
        } else {
          // Broadcast to all in room except sender
          socket.to(roomId).emit('webrtc-offer', {
            offer,
            senderSocketId: socket.id,
          });
        }
      } catch (error) {
        console.error('❌ Error handling WebRTC offer:', error);
      }
    });

    // WebRTC Answer
    socket.on('webrtc-answer', ({ roomId, answer, targetSocketId }) => {
      try {
        if (!roomId || !answer || !targetSocketId) {
          throw new Error('Invalid answer parameters');
        }

        console.log(`WebRTC answer from ${socket.id} to ${targetSocketId} in room ${roomId}`);

        io.to(targetSocketId).emit('webrtc-answer', {
          answer,
          senderSocketId: socket.id,
        });
      } catch (error) {
        console.error('❌ Error handling WebRTC answer:', error);
      }
    });

    // ICE Candidate
    socket.on('ice-candidate', ({ roomId, candidate, targetSocketId }) => {
      try {
        if (!candidate) {
          console.warn('Invalid ICE candidate received');
          return;
        }

        if (targetSocketId) {
          io.to(targetSocketId).emit('ice-candidate', {
            candidate,
            senderSocketId: socket.id,
          });
        } else if (roomId) {
          socket.to(roomId).emit('ice-candidate', {
            candidate,
            senderSocketId: socket.id,
          });
        }
      } catch (error) {
        console.error('❌ Error handling ICE candidate:', error);
      }
    });

    // Leave room
    socket.on('leave-room', ({ roomId }) => {
      handleLeaveRoom(socket, roomId);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);

      // End pending invites involving this socket
      activeInvites.forEach((invite, invitationId) => {
        if (invite.callerSocketId === socket.id && invite.status === 'pending') {
          clearTimeout(invite.timeout);
          invite.status = 'cancelled';
          CallInvitationModel.updateStatus(invitationId, 'cancelled');
          io.to(invite.calleeSocketId).emit('call:cancelled', {
            invitationId,
            callerName: invite.callerName,
          });
          activeInvites.delete(invitationId);
        } else if (invite.calleeSocketId === socket.id && invite.status === 'pending') {
          clearTimeout(invite.timeout);
          invite.status = 'missed';
          CallInvitationModel.updateStatus(invitationId, 'missed');
          io.to(invite.callerSocketId).emit('call:timeout', {
            invitationId,
            calleeName: invite.calleeName,
            callSessionId: invite.callSessionId,
          });
          activeInvites.delete(invitationId);
        }
      });

      // Remove from all rooms
      activeRooms.forEach((participants, roomId) => {
        if (participants.has(socket.id)) {
          handleLeaveRoom(socket, roomId);
        }
      });

      // Remove from direct presence
      removePresence(socket.id);
      
      // Broadcast updated online users list
      broadcastOnlineUsers(io);
    });

    // Start call tracking
    socket.on('start-call', ({ roomId, userId }) => {
      try {
        const call = CallModel.create(roomId, userId);
        socket.emit('call-started', { callId: call.call_id });
        console.log(`Call started: ${call.call_id} in room ${roomId}`);
      } catch (error) {
        console.error('Error starting call:', error);
        socket.emit('call-error', { error: 'Failed to start call' });
      }
    });

    // End call tracking
    socket.on('end-call', ({ callId }) => {
      try {
        CallModel.endCall(callId);
        console.log(`Call ended: ${callId}`);
      } catch (error) {
        console.error('Error ending call:', error);
      }
    });
  });

  function handleLeaveRoom(socket: Socket, roomId: string): void {
    try {
      const room = activeRooms.get(roomId);
      if (room && room.has(socket.id)) {
        const participant = room.get(socket.id);
        room.delete(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('user-left', {
          socketId: socket.id,
          userId: participant?.userId,
          username: participant?.username,
        });

        socket.leave(roomId);

        console.log(`${participant?.username} left room ${roomId}`);

        // Clean up empty rooms
        if (room.size === 0) {
          activeRooms.delete(roomId);
          console.log(`Room ${roomId} is now empty and removed`);
        }
      }
    } catch (error) {
      console.error('❌ Error handling leave room:', error);
    }
  }
}
