Yes — the other 2 backends deploy separately on Fly.io, and can alternatively all go on a single EC2 instance. Here's what's in place and what each path looks like.
Option A — Fly.io (backends)
I also fixed the port bindings so Fly works correctly:
- apps/ws-backend/src/index.ts now uses process.env.PORT || 8080 (Fly injects PORT)
- apps/http-backend/src/index.ts now uses process.env.PORT || 3001
- apps/http-backend/fly.toml and apps/ws-backend/fly.toml have internal_port aligned
To deploy them:
cd apps/http-backend && flyctl launch && flyctl deploy
cd apps/ws-backend  && flyctl launch && flyctl deploy
Then set secrets on each app: DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS, NEXT_PUBLIC_HTTP_BACKEND, NEXT_PUBLIC_WS_URL.
Option B — Single AWS EC2 instance (all 3 services)
New files created for this:
File	Purpose
deploy/ec2-setup.sh	First-time bootstrap: installs Node 20, Bun, Nginx, PM2, Postgres, clones repo, builds everything, starts services
deploy/nginx/default.conf	Reverse proxy: / → Next.js :3000, /api/ → HTTP :3001, /ws/ → WebSocket :8080
deploy/pm2/ecosystem.config.js	Keeps all 3 processes alive (node for Next.js, bun for backends)
.env.production.example	Template for production env vars (DB URL, JWT, CORS, public URLs)
.github/workflows/deploy-ec2.yml	CI: on push to main, SSH into EC2, pull latest, rebuild, restart services
Required GitHub Secrets:
- EC2_SSH_KEY — your EC2 private key
- EC2_USER — typically ubuntu
Required GitHub Variables:
- REPO_URL — https://github.com/...
- APP_DIR — e.g. /opt/excalidraw
- DOMAIN — your production domain
One-time EC2 setup:
# On the EC2 instance (Ubuntu 22.04/24.04):
bash deploy/ec2-setup.sh
# Then create .env.production from the template
nano /opt/excalidraw/.env.production
# Finally start/restart everything
cd /opt/excalidraw && pm2 restart all
For a database on EC2: either install Postgres locally (sudo apt install postgresql) or use RDS (recommended — just set DATABASE_URL to the RDS endpoint). Then run cd packages/db && npx prisma migrate deploy.
The Nginx config + Certbot handles HTTPS, so the frontend hits / and both backends are seamlessly proxied under the same origin.
