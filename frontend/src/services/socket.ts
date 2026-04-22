import { io, Socket } from 'socket.io-client';

// Use environment variable in production, relative URL in development
const SOCKET_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || window.location.origin;

let socket: Socket | null = null;

export const initializeSocket = (): Socket => {
  if (!socket) {
    console.log('🔌 Connecting socket to:', SOCKET_URL);
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'], // Fallback to polling for poor networks
      reconnection: true,
      reconnectionAttempts: 10,           // More attempts (vs 5) for unstable networks
      reconnectionDelay: 1000,            // Start with 1s delay
      reconnectionDelayMax: 10000,        // Up to 10s between attempts (vs default 5s)
      timeout: 20000,                     // 20s connection timeout (vs default 20s) - Good for high latency
      autoConnect: true,
      upgrade: true,                      // Allow upgrading from polling to WebSocket
      rememberUpgrade: true,              // Remember successful WebSocket upgrade
      // Better buffering for offline scenarios
      withCredentials: true,
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('🔥 Socket connection error:', error);
    });
  }

  return socket;
};

export const getSocket = (): Socket | null => {
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default {
  initialize: initializeSocket,
  get: getSocket,
  disconnect: disconnectSocket,
};
