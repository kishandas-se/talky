import { create } from 'zustand';
import { Participant, Message } from '../types';

interface CallState {
  isInCall: boolean;
  roomId: string | null;
  roomName: string | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  messages: Message[];
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  callId: string | null;
  
  // Actions
  setInCall: (inCall: boolean) => void;
  setRoomId: (roomId: string, roomName?: string) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addRemoteStream: (socketId: string, stream: MediaStream) => void;
  removeRemoteStream: (socketId: string) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (socketId: string) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setScreenSharing: (sharing: boolean) => void;
  toggleChat: () => void;
  setCallId: (callId: string | null) => void;
  reset: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  isInCall: false,
  roomId: null,
  roomName: null,
  localStream: null,
  remoteStreams: new Map(),
  participants: [],
  messages: [],
  isAudioEnabled: true,
  isVideoEnabled: true,
  isScreenSharing: false,
  isChatOpen: false,
  callId: null,

  setInCall: (inCall) => set({ isInCall: inCall }),

  setRoomId: (roomId, roomName) => set({ roomId, roomName: roomName || null }),

  setLocalStream: (stream) => set({ localStream: stream }),

  addRemoteStream: (socketId, stream) =>
    set((state) => {
      const newStreams = new Map(state.remoteStreams);
      newStreams.set(socketId, stream);
      return { remoteStreams: newStreams };
    }),

  removeRemoteStream: (socketId) =>
    set((state) => {
      const newStreams = new Map(state.remoteStreams);
      newStreams.delete(socketId);
      return { remoteStreams: newStreams };
    }),

  setParticipants: (participants) => set({ participants }),

  addParticipant: (participant) =>
    set((state) => ({
      participants: [...state.participants.filter((p) => p.socketId !== participant.socketId), participant],
    })),

  removeParticipant: (socketId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.socketId !== socketId),
    })),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setMessages: (messages) => set({ messages }),

  toggleAudio: () =>
    set((state) => ({
      isAudioEnabled: !state.isAudioEnabled,
    })),

  toggleVideo: () =>
    set((state) => ({
      isVideoEnabled: !state.isVideoEnabled,
    })),

  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),

  toggleChat: () =>
    set((state) => ({
      isChatOpen: !state.isChatOpen,
    })),

  setCallId: (callId) => set({ callId }),

  reset: () =>
    set({
      isInCall: false,
      roomId: null,
      roomName: null,
      localStream: null,
      remoteStreams: new Map(),
      participants: [],
      messages: [],
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      isChatOpen: false,
      callId: null,
    }),
}));
