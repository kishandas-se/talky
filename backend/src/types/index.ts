// User types
export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

// Meeting room types
export interface MeetingRoom {
  id: number;
  room_id: string;
  name: string;
  created_by: number;
  is_permanent: boolean;
  created_at: string;
}

// Message types
export interface Message {
  id: number;
  room_id: string;
  user_id: string;
  username: string;
  content: string;
  message_type: 'text' | 'system' | 'image' | 'video' | 'document';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  status: 'sent' | 'delivered' | 'read';
  created_at: string;
  read_by?: string[]; // Array of user IDs who have read the message
}

export interface MessageReadReceipt {
  id: number;
  message_id: number;
  user_id: string;
  read_at: string;
}

// Call history types
export interface CallHistory {
  id: number;
  call_id: string;
  room_id: string;
  initiator_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

// Socket event types (using any for browser-only WebRTC types)
export interface SignalingOffer {
  roomId: string;
  offer: any; // RTCSessionDescriptionInit is browser-only
  userId: string;
}

export interface SignalingAnswer {
  roomId: string;
  answer: any; // RTCSessionDescriptionInit is browser-only
  userId: string;
}

export interface IceCandidate {
  roomId: string;
  candidate: any; // RTCIceCandidateInit is browser-only
  userId: string;
}

export interface ChatMessage {
  roomId: string;
  content: string;
  userId: string;
  username: string;
  timestamp: string;
}

export interface RoomParticipant {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: string;
}

export interface CallInvitation {
  id: number;
  invitation_id: string;
  call_session_id: string;
  caller_name: string;
  callee_name: string;
  call_type: 'audio' | 'video';
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'missed' | 'failed';
  created_at: string;
  responded_at: string | null;
}

export interface PushSubscription {
  id: number;
  username: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  updated_at: string;
}
