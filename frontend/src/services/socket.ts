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
      reconnectionAttempts: Infinity,     // Keep trying on unstable links
      reconnectionDelay: 1500,            // Start with 1.5s delay
      reconnectionDelayMax: 15000,        // Up to 15s between attempts
      timeout: 30000,                     // 30s connection timeout for high-latency rural networks
      autoConnect: true,
      upgrade: true,                      // Allow upgrading from polling to WebSocket
      rememberUpgrade: false,             // Retry from polling first to avoid sticky failed websocket state
      // Better buffering for offline scenarios
      withCredentials: true,
      // Bypass ngrok free-tier browser interstitial page on polling requests
      extraHeaders: {
        'ngrok-skip-browser-warning': '1',
      },
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
