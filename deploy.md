# CoDraw — VM Deployment Guide

## Architecture

```
                    ┌─────────────┐
                    │   Nginx     │
                    │   :80/:443  │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌────▼────┐ ┌───────▼───────┐
     │  Frontend   │ │  HTTP   │ │  WebSocket    │
     │  Next.js    │ │  Backend│ │  Backend      │
     │  :3000      │ │  :3001  │ │  :8080        │
     └─────────────┘ └────┬────┘ └───────┬───────┘
                          │              │
                    ┌─────▼──────────────▼─────┐
                    │      Neon PostgreSQL      │
                    └───────────────────────────┘
```

## Prerequisites

- A VM (Ubuntu 22.04/24.04) with SSH access
- A domain name pointed to your VM's IP
- A Neon database (free tier works)
- GitHub repository

---

## Step 1: One-Time VM Setup

SSH into your VM and run these commands one by one:

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install Nginx
sudo apt-get install -y nginx

# Install PM2
sudo npm install -g pm2

# Install Certbot (for SSL)
sudo apt-get install -y certbot python3-certbot-nginx

# Clone your repo
sudo mkdir -p /opt/codraw
sudo chown $USER /opt/codraw
git clone https://github.com/YOUR_USER/codraw.git /opt/codraw
```

---

## Step 2: Configure Environment Variables

```bash
cd /opt/codraw
cp .env.example .env
nano .env
```

Update with your values:

```bash
# Get this from Neon Dashboard → Connection Details
DATABASE_URL="postgresql://your-neon-user:your-neon-password@your-neon-host/neondb?sslmode=require"

# Generate with: openssl rand -base64 32
JWT_SECRET="your-generated-secret"

# Your domain
ALLOWED_ORIGINS="https://your-domain.com"
NEXT_PUBLIC_HTTP_BACKEND="https://your-domain.com/api"
NEXT_PUBLIC_WS_URL="wss://your-domain.com/ws"
```

---

## Step 3: Build & Start Services

```bash
cd /opt/codraw

# Install dependencies
bun install

# Generate Prisma client
cd packages/db && bun prisma generate && cd ../..

# Build all packages
bun run build

# Run database migrations
cd packages/db && bun prisma migrate deploy && cd ../..

# Start services
pm2 start deploy/pm2/ecosystem.config.js
pm2 save
pm2 startup systemd -u $USER --hp $HOME
```

Verify services are running:

```bash
pm2 list
```

---

## Step 4: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/default
```

Paste this (replace `your-domain.com`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    client_max_body_size 50M;
}
```

Test and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 5: SSL with Certbot

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot auto-renews. Verify with:

```bash
sudo certbot renew --dry-run
```

---

## Step 6: Set Up CI/CD (GitHub Actions)

### GitHub Secrets (🔒 Settings → Secrets → Actions)

| Name | How to get |
|------|------------|
| `EC2_SSH_KEY` | `cat ~/.ssh/id_rsa` (your VM's private key) |
| `EC2_HOST` | Your VM's public IP address |
| `EC2_USER` | SSH username (usually `ubuntu`) |

### GitHub Variables (📦 Settings → Variables → Actions)

| Name | Value |
|------|-------|
| `REPO_URL` | `https://github.com/YOUR_USER/codraw.git` |
| `DOMAIN` | `your-domain.com` |

---

## How CI/CD Works

Every push to `main` triggers `.github/workflows/deploy.yml`:

```
git push origin main
  → GitHub Actions triggers
    → SSH into your VM
      → git pull latest code
      → source .env
      → bun install
      → bun prisma generate
      → bun run build (turbo builds all packages)
      → bun prisma migrate deploy
      → pm2 restart all
```

---

## Useful Commands

```bash
# Check service status
pm2 list

# View logs
pm2 logs frontend
pm2 logs http-backend
pm2 logs ws-backend

# Restart all services
pm2 restart all

# View real-time logs
pm2 logs --lines 50

# Check Nginx status
sudo systemctl status nginx

# Test Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Run Prisma migrations manually
cd /opt/codraw/packages/db && bun prisma migrate deploy

# Check Prisma status
cd /opt/codraw/packages/db && bun prisma migrate status
```

---

## Troubleshooting

### Frontend shows blank page or API errors

`NEXT_PUBLIC_*` variables are baked at build time. If you changed `.env`:

```bash
cd /opt/codraw && bun run build && pm2 restart frontend
```

### WebSocket not connecting

1. Check ws-backend is running: `pm2 list`
2. Check Nginx has the `/ws/` location block
3. Ensure `NEXT_PUBLIC_WS_URL` uses `wss://` (not `ws://`)

### Database connection errors

1. Verify `DATABASE_URL` in `.env` is correct
2. Check Neon dashboard for connection status
3. Run `cd /opt/codraw/packages/db && bun prisma migrate status`

### PM2 services keep crashing

```bash
pm2 logs --lines 50
```

Common issues:
- `JWT_SECRET` not set or using default value
- `DATABASE_URL` incorrect
- Port already in use

### SSL certificate issues

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Random secret (generate: `openssl rand -base64 32`) |
| `NEXT_PUBLIC_HTTP_BACKEND` | ✅ | `https://your-domain.com/api` |
| `NEXT_PUBLIC_WS_URL` | ✅ | `wss://your-domain.com/ws` |
| `ALLOWED_ORIGINS` | ❌ | CORS origins (default: `*`) |
| `HTTP_PORT` | ❌ | HTTP backend port (default: `3001`) |
| `WS_PORT` | ❌ | WebSocket backend port (default: `8080`) |
