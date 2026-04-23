# Talky - Personal Video Calling & Chat Application

A free, self-hosted real-time communication platform built with WebRTC for personal use. Features video/audio calling, persistent meeting rooms, integrated chat, and **Progressive Web App (PWA)** capabilities for installation on any device.

## Features

- 🎥 **One-on-One Video Calls** - Create shareable call links for instant video/audio calls
- 🏠 **Persistent Meeting Room** - Always-available room you can join anytime
- 💬 **Real-time Chat** - In-call messaging and standalone WhatsApp-like chat
- 📱 **Progressive Web App (PWA)** - Install on mobile, tablet, and desktop like a native app
- 🚀 **Optimized Performance** - Only ~138 KB gzipped bundle size for fast loading
- 📶 **Works Offline** - View cached messages and interface when offline
- 🔔 **Push Notifications** - Get notified of incoming calls (Android & Desktop)
- 🔒 **Private & Free** - Self-hosted with no external dependencies or costs
- 🎛️ **Full Call Controls** - Mute/unmute, video on/off, screen sharing
- 🔄 **Auto Reconnection** - Handles network interruptions gracefully
- 🌐 **Low Bandwidth Optimized** - Designed for rural and limited connectivity areas

## Tech Stack

### Backend
- Node.js 18+ with Express.js and TypeScript
- Socket.io for WebRTC signaling and real-time chat
- SQLite with better-sqlite3 for data persistence
- JWT authentication with bcryptjs

### Frontend
- React 18 with TypeScript and Vite
- Tailwind CSS for responsive styling
- Native WebRTC APIs for peer connections
- Zustand for state management
- React Router for navigation
- Service Workers for PWA offline capabilities
- Optimized bundle size (~138 KB gzipped)

### Infrastructure & Deployment
- **No-Card Hosting Path**: Cloudflare Pages (frontend) + Laptop backend via Cloudflare Tunnel
- Google STUN server (stun:stun.l.google.com:19302)
- Optional: Free TURN server for complex NATs
- CDN edge distribution for global reach

## Prerequisites

- Node.js 18 or higher
- npm or yarn package manager

---

## Quick Start - Local Development

### 1. Clone and Install Dependencies

```bash
# Clone the repository (if using git)
git clone <repository-url>
cd talky

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and set your values (especially JWT_SECRET)
```

**Important**: Generate a secure JWT_SECRET:
```bash
openssl rand -base64 32
```

### 3. Initialize Database

```bash
cd backend
npm run init-db
```

## Running the Application

### Development Mode (Local)

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend runs on `http://localhost:3001`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on `http://localhost:5173`

Open http://localhost:5173 in your browser and start using Talky!

---

## Production Deployment

Talky can be deployed for **free** on cloud platforms with global CDN distribution.

### Recommended Setup (No Card Required)
- **Backend**: Run on your laptop with PM2 + Cloudflare Tunnel
- **Frontend**: [Cloudflare Pages](https://pages.cloudflare.com) - Unlimited bandwidth, 500 builds/month, 300+ edge locations

### No-Card Backend Quick Steps

```bash
# Keep backend alive
npm i -g pm2
cd backend
pm2 start "npm run dev" --name talky-backend

# Expose backend securely
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create talky-backend
```

Set frontend production env values:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

### 📖 Complete Deployment Guide

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for detailed step-by-step instructions including:
- Backend setup on your laptop with Cloudflare Tunnel
- Frontend deployment to Cloudflare Pages
- Environment configuration
- Custom domain setup
- Monitoring and maintenance
- Troubleshooting tips

### 📱 Installing as a Mobile/Desktop App

After deployment, users can install Talky as a native app on their devices!

See **[PWA_INSTALL.md](./PWA_INSTALL.md)** for platform-specific installation instructions.

### Quick Deploy Commands

```bash
# Backend (Laptop + PM2)
cd backend
npm run dev

# Frontend (Cloudflare Pages - Direct)
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=talky
```

### One-Command Quick Tunnel + GitHub Pages Deploy

Use this script to automate all of the following in one run:
- Start a new Cloudflare Quick Tunnel
- Capture the temporary trycloudflare.com URL
- Create or update `~/.cloudflared/config.yml`
- Update `frontend/.env.production` (`VITE_API_URL`, `VITE_WS_URL`)
- Build frontend and deploy to GitHub Pages

Important:
- GitHub Pages must be available for this repository.
- On free GitHub plans, this usually means the repository must be **public**.
- Private repository Pages may require a paid plan.

How to run:

```bash
# 1) Go to project root
cd /Users/kishan/Projects/Personal\ Work/talky

# 2) Make script executable (run once)
chmod +x scripts/deploy-fe.sh

# 3) Run the script
./scripts/deploy-fe.sh
```

Alternative (if you do not want to use chmod):

```bash
bash scripts/deploy-fe.sh
```

```bash
./scripts/deploy-fe.sh
```

If your backend runs on port `3100` instead of `3001`:

```bash
BACKEND_PORT=3100 ./scripts/deploy-fe.sh
```

---

## Local Production Build

Test the production build locally before deploying:

**Build:**
```bash
# Build backend
cd backend
npm run build

# Build frontend
cd frontend
npm run build

# Analyze bundle size (opens visualization in browser)
npm run analyze
```

**Run Locally:**
```bash
# Start backend (from dist/)
cd backend
npm start

# Preview frontend production build
cd frontend
npm run preview
```

---

## Usage

1. **Register/Login**: Create an account or log in at the home page
2. **Create a Call**: Click "Create Call" to generate a shareable link
3. **Share Link**: Copy and share the link with the person you want to call
4. **Join Meeting Room**: Access the persistent meeting room anytime
5. **Chat**: Send messages during calls or use standalone chat
6. **Install as App** (Production): Use the "Install" button to add to home screen

---

## Performance & Bundle Size

Talky is optimized for minimal bandwidth usage and fast loading:

- **Frontend Bundle**: ~138 KB gzipped (total)
  - React vendor chunk: 51.45 KB
  - Main app code: 34.22 KB
  - Socket.io client: 12.79 KB
  - Route lazy loading: 7-8 KB per page (loaded on demand)
  - CSS: 9.14 KB

- **Optimization Features**:
  - Code splitting with route-based lazy loading
  - Manual chunk splitting for vendor code
  - Terser minification with console removal
  - Tree shaking to eliminate dead code
  - Service worker caching for repeat visits
  - Brotli/Gzip compression on CDN

- **Target Audience**: Works well even on 2G/3G networks in rural areas

Run `npm run analyze` in the frontend directory to visualize the bundle composition.

---

## Project Structure

```
talky/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express app entry point
│   │   ├── config/
│   │   │   └── database.ts        # SQLite setup and schema
│   │   ├── models/                # Database query functions
│   │   ├── routes/                # REST API endpoints
│   │   │   ├── auth.ts            # Login/register endpoints
│   │   │   ├── rooms.ts           # Room management
│   │   │   ├── messages.ts        # Chat messages
│   │   │   └── push.ts            # Push notifications
│   │   ├── sockets/               # Socket.io handlers
│   │   │   ├── signaling.ts       # WebRTC signaling
│   │   │   └── chat.ts            # Real-time chat
│   │   ├── middleware/            # Auth middleware
│   │   └── types/                 # TypeScript types
│   ├── package.json
│   ├── tsconfig.json
│   ├── fly.toml                   # Fly.io config (for deployment)
│   └── .env.production.example    # Production env template
├── frontend/
│   ├── public/
│   │   ├── manifest.json          # PWA manifest
│   │   ├── sw.js                  # Service worker
│   │   ├── icon-192.svg           # PWA app icon
│   │   ├── icon-512.svg           # PWA app icon
│   │   └── _redirects             # Cloudflare Pages routing
│   ├── src/
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Root component with routing
│   │   ├── components/            # Reusable UI components
│   │   │   ├── InstallPrompt.tsx  # PWA install prompt
│   │   │   └── OfflineIndicator.tsx # Online/offline status
│   │   ├── pages/                 # Page components (lazy loaded)
│   │   ├── services/              # WebRTC & Socket.io services
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── stores/                # Zustand state stores
│   │   ├── types/                 # TypeScript types
│   │   └── styles/                # Global styles
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts             # Optimized build config
│   └── .env.production.example    # Production env template
├── DEPLOYMENT.md                  # Detailed deployment guide
├── PWA_INSTALL.md                 # User installation instructions
└── README.md                      # This file
```

## Browser Compatibility

### Desktop
- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 15+

### Mobile
- ✅ Chrome Mobile (Android) - Full PWA support with push notifications
- ✅ Safari (iOS 15+) - PWA installable, limited notification support
- ✅ Samsung Internet (Android) - Full PWA support

### PWA Installation Support
- ✅ Android (Chrome, Edge, Samsung Internet) - Full features
- ✅ iOS/iPadOS (Safari) - Installable, no push notifications
- ✅ Windows/macOS/Linux (Chrome, Edge) - Full features including notifications

## Troubleshooting

### Calls Not Connecting

If video calls fail to connect:
1. Check both users have granted camera/microphone permissions
2. Ensure firewall isn't blocking WebRTC
3. If on restrictive networks, uncomment TURN server settings in `.env`

### Database Issues

If database errors occur:
```bash
cd backend
rm -f data/talky.db
npm run init-db
```

### Port Already in Use

Change ports in:
- Backend: `.env` file (`PORT=3001`)
- Frontend: `vite.config.ts` (`server.port`)

## Security Notes

- **JWT_SECRET**: Use a strong, random secret in production (generate with `openssl rand -base64 32`)
- **HTTPS**: Required for WebRTC and PWA features in production (Fly.io and Cloudflare provide this automatically)
- **Environment Variables**: Never commit .env files to version control
- **CORS**: Configure allowed origins in production (see DEPLOYMENT.md)
- **Personal Use**: Designed for trusted personal use, not public deployment at scale

---

## Contributing & License

This is a personal project for self-hosting. Feel free to fork and customize for your own use.

---

## Support & Documentation

- 📖 **[Deployment Guide](./DEPLOYMENT.md)** - Complete production deployment walkthrough
- 📱 **[PWA Installation Guide](./PWA_INSTALL.md)** - How to install on different devices
- 🐛 **Issues**: Check DEPLOYMENT.md troubleshooting section first

---

**Built with ❤️ for seamless personal communication, even in low-bandwidth areas.**

## Future Enhancements

- [ ] Call recording functionality
- [ ] Multiple persistent meeting rooms
- [ ] File sharing in chat
- [ ] Push notifications
- [ ] Self-hosted TURN server setup (coturn)

## License

MIT License - Free for personal use

## Support

For issues or questions, refer to the troubleshooting section or check the browser console for errors.

---

Built with ❤️ for personal communication needs
# Talky - Simple 1-on-1 Video Calls

A clean, minimal WebRTC video calling application rebuilt from scratch with a battle-tested architecture.

## ✨ Features

- 🎥 **1-on-1 Video Calls** - High-quality peer-to-peer video
- 🎤 **Audio Control** - Mute/unmute support
- 📹 **Video Toggle** - Turn camera on/off
- 🏠 **Persistent Meeting Room** - Fixed room ID (711997)
- 🔗 **Dynamic Rooms** - Create unique room links
- 📱 **Mobile Responsive** - Works on all devices
- 🆓 **100% Free** - Uses Google's free STUN servers

## 🏗️ Architecture

**Simplified design - eliminates all race conditions:**

- ✅ Single WebRTC hook (all logic in one place)
- ✅ Sequential initialization (no async races)
- ✅ No SDP transformation (browser-native codecs)
- ✅ Clean separation (server/client)
- ✅ Battle-tested patterns

## 🚀 Quick Start

### Install Dependencies

```bash
npm run install:all
```

### Start Development

```bash
npm run dev
```

This starts:
- Server: `http://localhost:3001`
- Client: `http://localhost:5173`

### Test the Connection

1. Open two incognito browser windows
2. Navigate to `http://localhost:5173`
3. Click "Join Meeting Room" in both windows
4. Allow camera/microphone permissions
5. **You should see both video feeds in ~2 seconds** ✅

## 📁 Project Structure

```
talky/
├── server/                 # Express + Socket.io backend
│   ├── index.js           # Server setup (50 lines)
│   ├── signaling.js       # WebRTC signaling (80 lines)
│   └── package.json
│
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── hooks/
│   │   │   ├── useSocket.js   # Socket.io connection (30 lines)
│   │   │   └── useWebRTC.js   # WebRTC logic (180 lines)
│   │   ├── pages/
│   │   │   ├── Home.jsx       # Landing page (150 lines)
│   │   │   └── Room.jsx       # Video call room (200 lines)
│   │   ├── components/
│   │   │   ├── Video.jsx      # Video display (60 lines)
│   │   │   └── Controls.jsx   # Call controls (60 lines)
│   │   ├── App.jsx            # Router (15 lines)
│   │   └── main.jsx           # Entry point (8 lines)
│   └── package.json
│
└── package.json            # Monorepo scripts
```

**Total: ~730 lines** (vs 2000+ in old version)

## 🎯 How It Works

### Sequential Initialization (No Races)

```javascript
1. Get media stream (await)
2. Join room (await callback)  
3. Setup socket listeners
4. On peer-joined → create peer as initiator
5. On signal → create peer + process signal
6. Connection established ✓
```

### Simple WebRTC Config

```javascript
{
  initiator: boolean,
  stream: localStream,
  trickle: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  }
  // NO sdpTransform - browser handles codec negotiation
}
```

## 🔧 Configuration

### Server (.env)
```
PORT=3001
MEETING_ROOM_ID=711997
CLIENT_URL=http://localhost:5173
```

### Client (.env)
```
VITE_SOCKET_URL=
VITE_MEETING_ROOM_ID=711997
```

## 🧪 Testing

### Local Testing (Same Machine)
1. Two incognito windows → `http://localhost:5173/meeting`
2. Expected: Both show 2 videos in <2 seconds

### Mobile Testing (Same WiFi)
1. Start dev server: `npm run dev`
2. Mobile browser: `http://192.168.1.5:5173`
3. Expected: Camera/mic permissions → video call works

### Cross-Browser Testing
- ✅ Chrome
- ✅ Firefox  
- ✅ Safari
- ✅ Edge

## 📊 What Changed from Old Version

### Removed (Bug Sources)
- ❌ SDP transformation (caused 3 bugs)
- ❌ Multiple WebRTC hooks (caused 4 bugs)
- ❌ Complex async flows (caused 1 bug)
- ❌ Separate Call/Meeting components (90% duplicate)

### Added (Simplifications)
- ✅ Single useWebRTC hook (all logic in one place)
- ✅ Sequential async/await (deterministic order)
- ✅ Unified Room component (handles all room types)
- ✅ Browser-native codec negotiation

## 🐛 Debugging

### Connection Issues

**Console logs to check:**
```
✅ Socket connected
✅ Media stream acquired
✅ Joined room, initiator: true/false
✅ Creating peer (INITIATOR/RESPONDER)
✅ Peer connected!
✅ Remote stream received!
```

**If stuck:**
1. Check browser console for errors
2. Verify both users allowed camera/mic
3. Try different browser (Chrome recommended)
4. Check network isn't blocking WebRTC

### Common Issues

**"Camera access denied"**
- Allow permissions in browser settings
- Refresh page after allowing

**"Room is full"**
- Max 2 users per room
- Create new room or wait for someone to leave

**"Connection failed"**
- Check if server is running (port 3001)
- Verify firewall isn't blocking WebRTC

## 💡 Tips

- Use **incognito windows** for local testing (simulates different users)
- **Mobile requires HTTPS** in production (use ngrok for testing)
- **Google STUN** works for 90%+ of connections (no TURN needed)
- Connection should establish in **<2 seconds** (if slower, check network)

## 🚀 Production Deployment

### Requirements
- HTTPS (required for camera/mic on mobile)
- Environment variables configured
- Node.js 16+ on server

### Free Hosting Options
- **Backend**: Render, Railway, Fly.io (free tiers)
- **Frontend**: Vercel, Netlify, Cloudflare Pages
- **STUN**: Google's free servers (already configured)

## 📝 License

MIT - Feel free to use for personal projects

## 🙏 Credits

Built with:
- [simple-peer](https://github.com/feross/simple-peer) - WebRTC wrapper
- [Socket.io](https://socket.io/) - Real-time signaling
- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- Google STUN servers - Free ICE servers

---

**Version 2.0** - Rebuilt from scratch with clean architecture ✨
# Talky - One-to-One Video/Audio Call & Chat Application

A simple, robust WebRTC-based video/audio call and chat application for personal use, optimized for low bandwidth and mobile devices.

## Features

- 🎥 **Dynamic Audio/Video Calls** - Create and share call links, seamlessly switch between audio and video
- 📹 **Persistent Meeting Room** - Join a fixed meeting room anytime
- 💬 **Real-time Chat** - Standalone chat and in-call messaging
- 🌐 **Low Bandwidth Optimized** - Works well on slow networks with adaptive bitrate
- 📱 **PWA Support** - Installable on mobile devices like Google Meet
- 🎨 **Modern UI** - Clean, minimalist design with purple gradient theme

## Tech Stack

- **Backend:** Node.js + Express.js + Socket.io
- **Frontend:** React.js + Vite + Styled Components
- **WebRTC:** simple-peer library
- **Deployment:** Docker + Docker Compose

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Backend server: http://localhost:3001
   - Frontend app: http://localhost:5173

### Docker Deployment

#### Development Mode (with hot reload)
```bash
npm run docker:dev
```

#### Production Mode
```bash
npm run docker:build
npm run docker:prod
```

Access the application at `http://localhost` (production) or `http://localhost:5173` (development).

## Project Structure

```
talky/
├── server/              # Backend Node.js server
│   ├── src/
│   │   ├── index.js     # Express & Socket.io setup
│   │   ├── signaling.js # WebRTC signaling logic
│   │   └── rooms.js     # Room management
│   └── Dockerfile
├── client/              # Frontend React app
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── contexts/    # React Context providers
│   │   ├── services/    # WebRTC & API services
│   │   └── styles/      # Styled Components theme
│   └── Dockerfile
└── docker-compose.yml   # Docker orchestration
```

## Configuration

### STUN/TURN Servers

The app uses Google's free STUN servers by default. For restrictive networks, you can configure TURN servers:

1. Get free TURN credentials from [Metered.ca](https://www.metered.ca/) (50GB/month free tier)
2. Add credentials to `.env` file
3. Restart the server

### Meeting Room

The persistent meeting room ID is configured in `.env`:
```env
MEETING_ROOM_ID=my-custom-meeting-room
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Development

### Available Scripts

- `npm run dev` - Start both server and client in development mode
- `npm run build` - Build both server and client for production
- `npm run start` - Start production server
- `npm run docker:dev` - Run in Docker (development)
- `npm run docker:prod` - Run in Docker (production)

### Testing Low Bandwidth

Use Chrome DevTools Network throttling:
1. Open DevTools (F12)
2. Go to Network tab
3. Select "Slow 3G" or "Fast 3G" from throttling dropdown
4. Test call quality and adaptive bitrate

## License

MIT - For personal use only
