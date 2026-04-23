import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DirectCallStatus =
  | 'idle'
  | 'outgoing_call'
  | 'incoming_call'
  | 'connecting'
  | 'connected'
  | 'ended';

export type DirectCallType = 'audio' | 'video';

export interface OnlineUser {
  username: string;
  userId: string;
  socketId: string;
}

interface DirectCallState {
  status: DirectCallStatus;
  invitationId: string | null;
  callSessionId: string | null;
  callerName: string | null;
  calleeName: string | null;
  peerName: string | null;
  callType: DirectCallType;
  quality: 'excellent' | 'good' | 'poor' | 'disconnected';
  signalBars: 1 | 2 | 3 | 4 | 5;
  
  // Current user info (auto-assigned by server)
  currentUsername: string | null;
  currentUserId: string | null;
  
  // Online users list
  onlineUsers: OnlineUser[];

  setCurrentUser: (username: string, userId: string) => void;
  setOnlineUsers: (users: OnlineUser[]) => void;

  setOutgoing: (payload: {
    invitationId?: string;
    callerName: string;
    calleeName: string;
    callType: DirectCallType;
  }) => void;
  setIncoming: (payload: {
    invitationId: string;
    callSessionId: string;
    callerName: string;
    calleeName: string;
    callType: DirectCallType;
  }) => void;
  setAccepted: (payload: {
    invitationId: string;
    callSessionId: string;
    peerName: string;
    callType: DirectCallType;
  }) => void;
  setStatus: (status: DirectCallStatus) => void;
  setQuality: (quality: 'excellent' | 'good' | 'poor' | 'disconnected', signalBars: 1 | 2 | 3 | 4 | 5) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as DirectCallStatus,
  invitationId: null,
  callSessionId: null,
  callerName: null,
  calleeName: null,
  peerName: null,
  callType: 'audio' as DirectCallType,
  quality: 'excellent' as const,
  signalBars: 5 as const,
  currentUsername: null,
  currentUserId: null,
  onlineUsers: [] as OnlineUser[],
};

export const useDirectCallStore = create<DirectCallState>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentUser: (username, userId) =>
        set({
          currentUsername: username,
          currentUserId: userId,
        }),

      setOnlineUsers: (users) =>
        set({
          onlineUsers: users,
        }),

      setOutgoing: ({ invitationId, callerName, calleeName, callType }) =>
        set({
          status: 'outgoing_call',
          invitationId: invitationId || null,
          callerName,
          calleeName,
          peerName: calleeName,
          callType,
        }),

      setIncoming: ({ invitationId, callSessionId, callerName, calleeName, callType }) =>
        set({
          status: 'incoming_call',
          invitationId,
          callSessionId,
          callerName,
          calleeName,
          peerName: callerName,
          callType,
        }),

      setAccepted: ({ invitationId, callSessionId, peerName, callType }) =>
        set({
          status: 'connecting',
          invitationId,
          callSessionId,
          peerName,
          callType,
        }),

      setStatus: (status) => set({ status }),

      setQuality: (quality, signalBars) => set({ quality, signalBars }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'talky-direct-call',

      partialize: (state) => ({
        currentUsername: state.currentUsername,
        currentUserId: state.currentUserId,
      }),
    }
  )
);
