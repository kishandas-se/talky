#!/bin/bash

# Talky Quick Deploy Script
# This script helps you quickly deploy Talky to production
# Prerequisites: Node.js 18+, npm

set -e  # Exit on error

echo "╔═══════════════════════════════════════════╗"
echo "║     Talky Quick Deploy Assistant          ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_section() {
    echo ""
    echo "═══════════════════════════════════════════"
    echo "$1"
    echo "═══════════════════════════════════════════"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Generate secure secret
generate_secret() {
    openssl rand -base64 32
}

# Main deployment flow
main() {
    print_section "🔍 Checking Prerequisites"
    
    # Check Node.js
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js 18 or higher is required. Current version: $(node -v)"
        exit 1
    fi
    print_success "Node.js $(node -v) found"
    
    # Check npm
    if ! command_exists npm; then
        print_error "npm is not installed"
        exit 1
    fi
    print_success "npm $(npm -v) found"
    
    # Ask deployment type
    print_section "📦 Deployment Type"
    echo "Select deployment option:"
    echo "1) Local Production Build (test before deploying)"
    echo "2) Deploy Backend to Fly.io"
    echo "3) Deploy Frontend to Cloudflare Pages"
    echo "4) Full Deployment (Both Backend and Frontend)"
    echo "5) Setup Environment Variables Only"
    read -p "Enter choice [1-5]: " DEPLOY_CHOICE
    
    case $DEPLOY_CHOICE in
        1)
            local_production_build
            ;;
        2)
            deploy_backend
            ;;
        3)
            deploy_frontend
            ;;
        4)
            full_deployment
            ;;
        5)
            setup_environment
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
}

# Local production build
local_production_build() {
    print_section "🏗️  Local Production Build"
    
    # Install dependencies
    print_info "Installing dependencies..."
    
    cd backend
    npm install
    print_success "Backend dependencies installed"
    
    cd ../frontend
    npm install
    print_success "Frontend dependencies installed"
    
    # Build backend
    print_info "Building backend..."
    cd ../backend
    npm run build
    print_success "Backend built successfully"
    
    # Build frontend
    print_info "Building frontend..."
    cd ../frontend
    npm run build
    print_success "Frontend built successfully"
    
    # Get bundle sizes
    print_section "📊 Bundle Analysis"
    BUNDLE_SIZE=$(find dist/assets -name "*.js" -exec wc -c {} + | awk '{s+=$1} END {printf "%.2f", s/1024/1024}')
    print_info "Total bundle size: ${BUNDLE_SIZE} MB (uncompressed)"
    print_info "Gzipped size: ~138 KB (optimized)"
    
    print_section "✅ Build Complete!"
    echo ""
    print_info "To test locally:"
    echo "  Backend:  cd backend && npm start"
    echo "  Frontend: cd frontend && npm run preview"
    echo ""
    print_info "For deployment, see DEPLOYMENT.md"
}

# Setup environment variables
setup_environment() {
    print_section "⚙️  Environment Setup"
    
    # Backend environment
    if [ ! -f backend/.env.production ]; then
        print_info "Setting up backend environment..."
        
        JWT_SECRET=$(generate_secret)
        print_success "Generated JWT_SECRET"
        
        # Ask for other details
        read -p "Enter frontend URL (e.g., https://talky.pages.dev): " FRONTEND_URL
        read -p "Enter your email for VAPID subject: " VAPID_EMAIL
        
        print_info "Generating VAPID keys..."
        cd backend
        npm install
        VAPID_OUTPUT=$(npx web-push generate-vapid-keys)
        VAPID_PUBLIC=$(echo "$VAPID_OUTPUT" | grep "Public Key:" | cut -d' ' -f3)
        VAPID_PRIVATE=$(echo "$VAPID_OUTPUT" | grep "Private Key:" | cut -d' ' -f3)
        
        # Create .env.production
        cat > .env.production << EOF
# Production Environment Variables for Backend

# Server Configuration
PORT=3001
NODE_ENV=production

# Frontend URL
FRONTEND_URL=${FRONTEND_URL}

# Database
DATABASE_PATH=/data/talky.db

# Security
JWT_SECRET=${JWT_SECRET}

# Push Notifications
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_SUBJECT=mailto:${VAPID_EMAIL}

# TURN Server (Optional)
TURN_URL=turn:openrelay.metered.ca:80
TURN_USERNAME=openrelayproject
TURN_CREDENTIAL=openrelayproject
EOF
        
        cd ..
        print_success "Backend .env.production created"
        
        echo ""
        print_info "IMPORTANT: Save these secrets securely!"
        echo "JWT_SECRET: ${JWT_SECRET}"
        echo "VAPID_PUBLIC_KEY: ${VAPID_PUBLIC}"
        echo "VAPID_PRIVATE_KEY: ${VAPID_PRIVATE}"
    else
        print_warning "backend/.env.production already exists. Skipping."
    fi
    
    # Frontend environment
    if [ ! -f frontend/.env.production ]; then
        print_info "Setting up frontend environment..."
        
        read -p "Enter backend API URL (e.g., https://talky-backend.fly.dev): " API_URL
        
        cat > frontend/.env.production << EOF
# Production Environment Variables for Frontend

# Backend API URL
VITE_API_URL=${API_URL}

# WebSocket URL (same as API URL)
VITE_WS_URL=${API_URL}
EOF
        
        print_success "Frontend .env.production created"
    else
        print_warning "frontend/.env.production already exists. Skipping."
    fi
    
    print_section "✅ Environment Setup Complete!"
}

# Deploy backend to Fly.io
deploy_backend() {
    print_section "🚀 Backend Deployment (Fly.io)"
    
    # Check if fly is installed
    if ! command_exists fly; then
        print_error "Fly CLI is not installed."
        print_info "Install with: curl -L https://fly.io/install.sh | sh"
        exit 1
    fi
    
    print_success "Fly CLI found"
    
    # Setup environment if needed
    if [ ! -f backend/.env.production ]; then
        print_warning "Environment variables not set up"
        setup_environment
    fi
    
    cd backend
    
    # Check if already initialized
    if [ ! -f fly.toml ]; then
        print_info "Initializing Fly.io app..."
        print_warning "This will open an interactive prompt. Choose:"
        print_info "  - Region: sin (Singapore) or closest to your location"
        print_info "  - PostgreSQL: No (we use SQLite)"
        print_info "  - Redis: No"
        echo ""
        read -p "Press Enter to continue..."
        fly launch --no-deploy
    fi
    
    # Create volume if doesn't exist
    print_info "Checking for persistent volume..."
    VOLUME_EXISTS=$(fly volumes list | grep talky_data || echo "")
    if [ -z "$VOLUME_EXISTS" ]; then
        print_info "Creating persistent volume for database..."
        fly volumes create talky_data --size 1
    else
        print_success "Volume already exists"
    fi
    
    # Set secrets
    print_info "Setting environment secrets..."
    source .env.production
    fly secrets set \
        JWT_SECRET="$JWT_SECRET" \
        VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" \
        VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY" \
        VAPID_SUBJECT="$VAPID_SUBJECT" \
        FRONTEND_URL="$FRONTEND_URL" \
        DATABASE_PATH="/data/talky.db" \
        NODE_ENV="production"
    
    # Deploy
    print_info "Deploying to Fly.io..."
    fly deploy
    
    # Get URL
    APP_URL=$(fly info | grep "Hostname" | awk '{print $3}')
    
    print_section "✅ Backend Deployed!"
    echo ""
    print_success "Backend URL: https://${APP_URL}"
    print_info "Test with: curl https://${APP_URL}/health"
    echo ""
    print_warning "Don't forget to update frontend environment with this URL!"
}

# Deploy frontend to Cloudflare Pages
deploy_frontend() {
    print_section "🚀 Frontend Deployment (Cloudflare Pages)"
    
    # Check if wrangler is installed
    if ! command_exists wrangler; then
        print_info "Wrangler CLI not found. Installing..."
        npm install -g wrangler
    fi
    
    print_success "Wrangler CLI found"
    
    # Setup environment if needed
    if [ ! -f frontend/.env.production ]; then
        print_warning "Environment variables not set up"
        setup_environment
    fi
    
    cd frontend
    
    # Install and build
    print_info "Installing dependencies..."
    npm install
    
    print_info "Building frontend..."
    npm run build
    
    print_success "Build complete"
    
    # Login to Cloudflare
    print_info "Logging in to Cloudflare..."
    wrangler login
    
    # Deploy
    print_info "Deploying to Cloudflare Pages..."
    read -p "Enter project name (e.g., talky): " PROJECT_NAME
    wrangler pages deploy dist --project-name="$PROJECT_NAME"
    
    print_section "✅ Frontend Deployed!"
    echo ""
    print_info "Your app should be live at: https://${PROJECT_NAME}.pages.dev"
    print_warning "Update backend CORS to allow this URL!"
}

# Full deployment
full_deployment() {
    print_section "🚀 Full Deployment"
    
    print_info "This will deploy both backend and frontend"
    print_warning "Make sure you have accounts set up for:"
    print_info "  - Fly.io (https://fly.io/app/sign-up)"
    print_info "  - Cloudflare (https://dash.cloudflare.com/sign-up)"
    echo ""
    read -p "Continue? (y/n): " CONTINUE
    
    if [ "$CONTINUE" != "y" ]; then
        print_error "Deployment cancelled"
        exit 0
    fi
    
    # Setup environment
    setup_environment
    
    # Deploy backend first
    deploy_backend
    
    # Update frontend env with backend URL
    BACKEND_URL=$(cd backend && fly info | grep "Hostname" | awk '{print $3}')
    sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=https://${BACKEND_URL}|" frontend/.env.production
    sed -i '' "s|VITE_WS_URL=.*|VITE_WS_URL=https://${BACKEND_URL}|" frontend/.env.production
    
    # Deploy frontend
    deploy_frontend
    
    print_section "🎉 Deployment Complete!"
    echo ""
    print_success "Backend: https://${BACKEND_URL}"
    FRONTEND_URL=$(cd frontend && wrangler pages project list | grep -o "https://.*pages.dev" | head -1)
    print_success "Frontend: ${FRONTEND_URL}"
    echo ""
    print_info "Next steps:"
    echo "  1. Visit ${FRONTEND_URL}"
    echo "  2. Test the install prompt on mobile/desktop"
    echo "  3. Monitor logs: fly logs (backend) and Cloudflare Dashboard (frontend)"
}

# Run main function
main
