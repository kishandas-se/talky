import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { initializeSocket } from '../services/socket';
import { setupPushNotifications } from '../services/push';
import { useDirectCallStore } from '../stores/directCallStore';
import { useLanguageStore } from '../stores/languageStore';
import { translations } from '../i18n/translations';
import { getOrCreateUserId } from '../utils/userIdentity';

interface IncomingCallPayload {
  invitationId: string;
  callSessionId: string;
  callerName: string;
  calleeName: string;
  callType: 'audio' | 'video';
  timeoutMs: number;
}

interface AcceptedPayload {
  invitationId: string;
  callSessionId: string;
  peerName: string;
  callType: 'audio' | 'video';
}

export interface OnlineUser {
  username: string;
  userId: string;
  socketId: string;
}

export default function GlobalDirectCallHandler() {
  const navigate = useNavigate();
  const pushSetupDone = useRef(false);
  const registrationAttempted = useRef(false);
  const { language } = useLanguageStore();
  const t = translations[language];

  const {
    setIncoming,
    setAccepted,
    setStatus,
    setOutgoing,
    setCurrentUser,
    setOnlineUsers,
    reset,
    currentUsername,
  } = useDirectCallStore((state) => ({
    setIncoming: state.setIncoming,
    setAccepted: state.setAccepted,
    setStatus: state.setStatus,
    setOutgoing: state.setOutgoing,
    setCurrentUser: state.setCurrentUser,
    setOnlineUsers: state.setOnlineUsers,
    reset: state.reset,
    currentUsername: state.currentUsername,
  }));

  useEffect(() => {
    const socket = initializeSocket();

    // Attempt to register with stored username
    const attemptRegistration = () => {
      const storedUsername = localStorage.getItem('talky_username');
      if (storedUsername && !registrationAttempted.current) {
        registrationAttempted.current = true;
        socket.emit('direct:register', {
          username: storedUsername,
          clientUserId: getOrCreateUserId(),
        });
      }
    };

    // Handle successful registration
    socket.on('direct:registered', ({ username, userId }: { username: string; userId: string }) => {
      console.log(`✅ Registered: ${username} (userId: ${userId})`);
      setCurrentUser(username, userId);
      sessionStorage.setItem('guestName', username);
      sessionStorage.setItem('guestId', String(userId));
      localStorage.setItem('talky_username', username);
      localStorage.setItem('talky_user_id', userId);
      
      // Setup push notifications if not already done
      if (!pushSetupDone.current) {
        pushSetupDone.current = true;
        setupPushNotifications(username).catch(() => {
          // Push is optional and can be blocked by browser/user settings.
        });
      }

      // Request online users list after registration
      socket.emit('users:get');
    });

    // Handle online users list updates
    socket.on('users:online', ({ users }: { users: OnlineUser[] }) => {
      console.log(`📡 Received ${users.length} online users:`, users);
      setOnlineUsers(users);
    });

    // Attempt registration on connection
    if (socket.connected) {
      attemptRegistration();
    }

    socket.on('connect', () => {
      attemptRegistration();
    });

    socket.on('call:incoming', (payload: IncomingCallPayload) => {
      setIncoming(payload);
      toast(`📞 ${payload.callerName} ${t.isCalling}`, { icon: '📞', duration: 3000 });
    });

    socket.on('call:ringing', (payload: { invitationId: string; targetName: string; callType: 'audio' | 'video' }) => {
      setOutgoing({
        invitationId: payload.invitationId,
        callerName: currentUsername || 'Unknown',
        calleeName: payload.targetName,
        callType: payload.callType,
      });
      setStatus('outgoing_call');
    });

    socket.on('call:accepted', (payload: AcceptedPayload) => {
      setAccepted(payload);
      setStatus('connecting');

      sessionStorage.setItem('callType', 'audio');
      sessionStorage.setItem('directCallPeer', payload.peerName);

      toast.success(`✅ ${t.connectedWith} ${payload.peerName}`);
      navigate(`/call/${payload.callSessionId}`);

      setTimeout(() => {
        setStatus('connected');
      }, 800);
    });

    socket.on('call:rejected', ({ calleeName }: { calleeName: string }) => {
      toast.error(`${calleeName} ${t.rejectedYourCall}`);
      setStatus('ended');
      setTimeout(reset, 1200);
    });

    socket.on('call:cancelled', ({ callerName }: { callerName: string }) => {
      toast(`${t.callCancelledBy} ${callerName}`, { icon: '📴' });
      setStatus('ended');
      setTimeout(reset, 1200);
    });

    socket.on('call:timeout', ({ calleeName }: { calleeName: string }) => {
      toast.error(`${calleeName} ${t.didNotAnswer}`);
      setStatus('ended');
      setTimeout(reset, 1200);
    });

    socket.on('call:missed', ({ callerName }: { callerName: string }) => {
      toast(`${t.missedCallFrom} ${callerName}`, { icon: '📞' });
      setStatus('ended');
      setTimeout(reset, 1200);
    });

    socket.on('call:unavailable', ({ message }: { message: string }) => {
      toast.error(message || t.recipientUnavailable);
      setStatus('ended');
      setTimeout(reset, 1200);
    });

    socket.on('call:error', ({ message }: { message: string }) => {
      toast.error(message || t.callFailed);
      setStatus('ended');
      setTimeout(reset, 1200);
    });

    socket.on('call:ended', ({ username }: { username: string }) => {
      toast(`${username} ${t.endedTheCall}`, { icon: '📴' });
      setStatus('ended');
      setTimeout(reset, 1200);
    });

    const swMessageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'notification-action') return;
      if (data.action === 'accept' && data.payload?.invitationId) {
        socket.emit('call:accept', { invitationId: data.payload.invitationId });
      }
      if (data.action === 'decline' && data.payload?.invitationId) {
        socket.emit('call:reject', { invitationId: data.payload.invitationId });
      }
    };

    navigator.serviceWorker?.addEventListener('message', swMessageHandler);

    return () => {
      socket.off('connect');
      socket.off('direct:registered');
      socket.off('users:online');
      socket.off('call:incoming');
      socket.off('call:ringing');
      socket.off('call:accepted');
      socket.off('call:rejected');
      socket.off('call:cancelled');
      socket.off('call:timeout');
      socket.off('call:missed');
      socket.off('call:unavailable');
      socket.off('call:error');
      socket.off('call:ended');
      navigator.serviceWorker?.removeEventListener('message', swMessageHandler);
    };
  }, [navigate, reset, setAccepted, setCurrentUser, setIncoming, setOnlineUsers, setOutgoing, setStatus]);

  return null;
}
