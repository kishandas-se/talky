# Talky Deployment Guide

This guide prioritizes a truly no-card setup:
- Frontend on Cloudflare Pages
- Backend running on your laptop
- Public backend URL via Cloudflare Tunnel

This gives you free hosting with good performance, but backend availability depends on your laptop staying on and connected.

## Prerequisites

- Node.js 18+ and npm
- Cloudflare account
- A domain in Cloudflare (or a subdomain you control there)
- macOS Terminal

## Phase 1: Local Build Check

```bash
cd frontend && npm install && npm run build
cd ../backend && npm install && npm run build
```

Expected:
- Frontend build succeeds
- Backend TypeScript build succeeds
- You can run backend locally on port 3001

## Phase 2: Backend on Laptop (Always On)

### 1. Create backend production env

```bash
cd backend
cp .env.production.example .env.production
```

Edit backend .env.production with real values:

```env
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-project.pages.dev
DATABASE_PATH=./data/talky.db
JWT_SECRET=<secure-random-secret>
VAPID_PUBLIC_KEY=<vapid-public>
VAPID_PRIVATE_KEY=<vapid-private>
VAPID_SUBJECT=mailto:your-email@example.com
```

Generate keys:

```bash
openssl rand -base64 32
npx web-push generate-vapid-keys
```

### 2. Keep backend running with PM2

```bash
npm install -g pm2
cd backend
pm2 start "npm run dev" --name talky-backend
pm2 save
pm2 startup
```

Useful commands:

```bash
pm2 status
pm2 logs talky-backend
pm2 restart talky-backend
```

### 3. Expose backend with Cloudflare Tunnel

Install cloudflared:

```bash
brew install cloudflared
```

Login and create tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create talky-backend
```

Create ~/.cloudflared/config.yml:

```yaml
tunnel: talky-backend
credentials-file: /Users/<your-user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

Route DNS and run tunnel:

```bash
cloudflared tunnel route dns talky-backend api.yourdomain.com
cloudflared tunnel run talky-backend
```

Test backend URL:

```bash
curl https://api.yourdomain.com/health
curl https://api.yourdomain.com/api/health
```

## Phase 3: Frontend Deployment (Cloudflare Pages)

### 1. Configure frontend env

```bash
cd frontend
cp .env.production.example .env.production
```

Set:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

### 2. Deploy frontend

Option A: Git integration in Cloudflare Pages
- Connect repository
- Root directory: frontend
- Build command: npm run build
- Output directory: dist
- Set the same two VITE env vars in Cloudflare Pages dashboard

Option B: CLI deploy

```bash
npm install -g wrangler
wrangler login
cd frontend
npm run build
wrangler pages deploy dist --project-name=talky
```

## Phase 4: Final Verification

Check these end-to-end:
- Register and login works
- Meeting room and direct call connect
- Chat works
- Install prompt appears for PWA
- Offline indicator works

## Monitoring

- Backend process: pm2 status
- Backend logs: pm2 logs talky-backend
- Tunnel logs: cloudflared tunnel run talky-backend
- Frontend deploy logs: Cloudflare Pages dashboard

## Important Limitations

- Backend is reachable only when your laptop is on and online
- Laptop sleep will disconnect active calls
- For 24/7 reliability, move backend to a managed host later

## Optional Managed Alternative (Requires Billing)

If you enable billing on Fly.io, you can use backend/fly.toml and deploy backend there for always-on service.

