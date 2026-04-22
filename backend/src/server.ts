import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initializeDatabase } from './config/database';
import db from './config/database';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import messageRoutes from './routes/messages';
import fileRoutes from './routes/files';
import pushRoutes from './routes/push';
import { setupSignaling } from './sockets/signaling';
import { setupChat } from './sockets/chat';

// Load environment variables
dotenv.config();

// Initialize database
initializeDatabase();

// Create Express app
const app = express();
const httpServer = createServer(app);

// Get allowed origins from environment
const getAllowedOrigins = (): (string | RegExp)[] => {
  const origins: (string | RegExp)[] = [
    'http://localhost:5173', 
    'https://your-app.pages.dev',
  ];
  
  // Add production frontend URL if set
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  
  // Add ngrok patterns for development
  origins.push(/\.ngrok-free\.dev$/);
  origins.push(/\.ngrok\.io$/);
  
  return origins;
};

// Configure Socket.io with optimizations for low-bandwidth rural networks
const io = new Server(httpServer, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Optimized for slow/unstable networks
  pingTimeout: 60000,          // 60 seconds (vs default 5s) - Better for high latency
  pingInterval: 25000,          // 25 seconds (vs default 25s) - Keep-alive pings
  upgradeTimeout: 30000,        // 30 seconds (vs default 10s) - More time for WebSocket upgrade
  maxHttpBufferSize: 1e6,       // 1MB (vs default 1MB) - Reasonable for poor bandwidth
  transports: ['websocket', 'polling'], // Fallback to polling if WebSocket fails
  allowUpgrades: true,          // Allow transport upgrades when possible
});

// Middleware
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req, res) => {
  try {
    // Test database connection
    const result = db.prepare('SELECT 1 as test').get() as { test: number };
    const dbStatus = result.test === 1 ? 'connected' : 'error';
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/push', pushRoutes);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Setup Socket.io handlers
setupSignaling(io);
setupChat(io);

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🎥 Talky Backend Server Running     ║
╠═══════════════════════════════════════╣
║   Port: ${PORT.toString().padEnd(29)}║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(21)}║
║   Frontend: ${(process.env.FRONTEND_URL || 'http://localhost:5173').padEnd(23)}║
╠═══════════════════════════════════════╣
║   API: http://localhost:${PORT}/api       ║
║   Health: http://localhost:${PORT}/health ║
╚═══════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, httpServer, io };
