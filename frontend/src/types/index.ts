// User types
export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

// Room types
export interface Room {
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
  roomId: string;
  userId: string;
  username: string;
  content: string;
  messageType: 'text' | 'system' | 'image' | 'video' | 'document';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  readBy?: string[];
  isOwn?: boolean;
}

// WebRTC types
export interface PeerConnection {
  socketId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

// Participant types
export interface Participant {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: string;
  stream?: MediaStream;
}

// Call state
export interface CallState {
  isInCall: boolean;
  roomId: string | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}
