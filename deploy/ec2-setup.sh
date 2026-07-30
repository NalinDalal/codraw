#!/usr/bin/env bash
set -euxo pipefail

APP_DIR="${APP_DIR:-/opt/excalidraw}"
REPO_URL="${REPO_URL:-https://github.com/YOUR_USER/excalidraw.git}"
DOMAIN="${DOMAIN:-your-domain.com}"
EMAIL="${EMAIL:-admin@your-domain.com}"

echo ">>> Cloning repo..."
rm -rf "$APP_DIR"
git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

echo ">>> Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y nginx curl gnupg2 ca-certificates lsb-release

echo ">>> Installing Node.js (for Next.js frontend)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo ">>> Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

echo ">>> Installing dependencies..."
bun install

echo ">>> Building apps..."
cd apps/http-backend && bun run build
cd ../ws-backend && bun run build
cd ../frontend && bun run build
cd ../../

echo ">>> Setting up Nginx..."
sudo cp deploy/nginx/default.conf /etc/nginx/sites-available/default
sudo sed -i "s/%DOMAIN%/$DOMAIN/g" /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl reload nginx

echo ">>> Setting up SSL with Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --domains "$DOMAIN" || true

echo ">>> Installing PM2..."
sudo npm install -g pm2
pm2 install pm2-logrotate

echo ">>> Creating .env.production..."
if [ ! -f .env.production ]; then
  cp .env.example .env.production
  echo "Created .env.production — edit it with real secrets before restarting:"
  echo "  nano $APP_DIR/.env.production"
fi

echo ">>> Starting services with PM2..."
cd "$APP_DIR"
pm2 start deploy/pm2/ecosystem.config.js
pm2 save
pm2 startup systemd -u $USER --hp $HOME

echo ">>> Initial setup complete."
echo "Edit $APP_DIR/.env.production, then:"
echo "  cd $APP_DIR && pm2 restart all"
