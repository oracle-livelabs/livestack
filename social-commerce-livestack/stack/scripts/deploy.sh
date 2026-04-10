#!/bin/bash
# ============================================================
# deploy.sh — Deploy Social Commerce Demo on Oracle Linux VM (OCI)
# Run from the scripts/ directory inside the project
# ============================================================

set -e

APP_DIR="/opt/social-commerce-demo"
APP_USER="opc"
NODE_VERSION="20"

echo "=================================================="
echo " Social Commerce Demo — Deployment"
echo "=================================================="

# ── 1. System Dependencies ────────────────────────────────
echo ""
echo "[1/7] Installing system dependencies..."

# Enable EPEL and install basics
sudo dnf install -y oracle-epel-release-el8 2>/dev/null || sudo dnf install -y oracle-epel-release-el9 2>/dev/null || true
sudo dnf install -y git curl wget unzip gcc-c++ make

# ── 2. Node.js ────────────────────────────────────────────
echo ""
echo "[2/7] Installing Node.js ${NODE_VERSION}..."

if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt ${NODE_VERSION} ]]; then
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | sudo bash -
    sudo dnf install -y nodejs
fi
echo "  Node.js $(node -v)"
echo "  npm $(npm -v)"

# ── 3. Oracle Instant Client ──────────────────────────────
echo ""
echo "[3/7] Checking Oracle Instant Client..."

if ! rpm -q oracle-instantclient-basic &> /dev/null; then
    echo "  Oracle Instant Client not found."
    echo "  Install it from: https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html"
    echo "  Or use: sudo dnf install oracle-instantclient-release-el8"
    echo "  Then: sudo dnf install oracle-instantclient-basic oracle-instantclient-sqlplus"
    echo ""
    echo "  For ADB connections, also set TNS_ADMIN to your wallet directory."
    echo ""
    read -p "  Continue without Instant Client? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
else
    echo "  Oracle Instant Client found"
fi

# ── 4. PM2 Process Manager ────────────────────────────────
echo ""
echo "[4/7] Installing PM2..."

sudo npm install -g pm2 2>/dev/null || npm install -g pm2
pm2 --version

# ── 5. Application Setup ──────────────────────────────────
echo ""
echo "[5/7] Setting up application..."

# Create app directory if deploying fresh
if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p $APP_DIR
    sudo chown $APP_USER:$APP_USER $APP_DIR
    echo "  Created $APP_DIR"
fi

# If running from git clone
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$PROJECT_ROOT/package.json" ]; then
    echo "  Syncing from $PROJECT_ROOT..."
    rsync -av --exclude='node_modules' --exclude='.env' --exclude='frontend/dist' \
        "$PROJECT_ROOT/" "$APP_DIR/"
fi

cd $APP_DIR

# ── 6. Install Dependencies & Build ───────────────────────
echo ""
echo "[6/7] Installing dependencies and building frontend..."

npm install --production=false
cd frontend
npm install
npm run build
cd ..

# Check for .env
if [ ! -f .env ]; then
    echo ""
    echo "  ⚠️  No .env file found!"
    echo "  Copy .env.example to .env and configure your ADB credentials:"
    echo "    cp .env.example .env"
    echo "    nano .env"
    echo ""
fi

# ── 7. Start with PM2 ─────────────────────────────────────
echo ""
echo "[7/7] Starting application with PM2..."

# Set environment variables for Oracle
export LD_LIBRARY_PATH=/usr/lib/oracle/23/client64/lib:$LD_LIBRARY_PATH
export TNS_ADMIN=${TNS_ADMIN:-/opt/oracle/wallet}

# Stop existing instance if running
pm2 delete social-commerce 2>/dev/null || true

# Start with PM2
pm2 start backend/server.js \
    --name social-commerce \
    --env production \
    --max-memory-restart 512M \
    --log-date-format "YYYY-MM-DD HH:mm:ss" \
    -- --env production

# Save PM2 config for auto-restart
pm2 save
pm2 startup systemd -u $APP_USER --hp /home/$APP_USER 2>/dev/null || true

echo ""
echo "=================================================="
echo " Deployment Complete!"
echo "=================================================="
echo ""
echo " App running at:  http://$(hostname -I | awk '{print $1}'):3001"
echo " Health check:    http://$(hostname -I | awk '{print $1}'):3001/api/health"
echo ""
echo " PM2 commands:"
echo "   pm2 status              — check app status"
echo "   pm2 logs social-commerce — view logs"
echo "   pm2 restart social-commerce — restart app"
echo "   pm2 monit               — real-time monitoring"
echo ""
echo " Next steps:"
echo "   1. Ensure .env is configured with ADB credentials"
echo "   2. Run database schema scripts (db/schema/)"
echo "   3. Load sample data (db/data/load_all_data.sql)"
echo "   4. Open firewall: sudo firewall-cmd --add-port=3001/tcp --permanent && sudo firewall-cmd --reload"
echo "   5. (Optional) Set up nginx reverse proxy for port 80/443"
echo ""
