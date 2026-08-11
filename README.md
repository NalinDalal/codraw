# CoDraw

A real-time collaborative whiteboard application built as a Turborepo monorepo.

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, Rough.js
- **HTTP Backend**: Bun-native Web API server
- **WebSocket Backend**: Bun-native WebSocket server with room-based broadcasting
- **Database**: PostgreSQL (via Prisma ORM), deployed on Neon
- **Runtime**: Bun 1.2+
- **Monorepo**: Turborepo with pnpm workspaces
- **Shared packages**: `@repo/db`, `@repo/shapes`, `@repo/ui`, `@repo/typescript-config`

## Architecture

```
codraw/
├── apps/
│   ├── frontend/         # Next.js app (port 3000)
│   ├── http-backend/     # Auth & room management API (port 3001)
│   └── ws-backend/       # WebSocket real-time sync server (port 8080)
├── packages/
│   ├── db/               # Prisma schema + generated client
│   ├── shapes/           # Shape definitions and helpers
│   ├── ui/               # Shared React components
│   ├── typescript-config/# Shared tsconfig presets
│   └── eslint-config/    # Shared ESLint configs
└── deploy/               # Nginx + PM2 + deployment scripts
```

- **HTTP backend** handles signup, signin, create-room, and WebSocket token issuance.
- **WebSocket backend** handles real-time shape sync, cursor broadcast, and chat within rooms.
- **Frontend** renders the canvas, manages local state, and syncs mutations over WebSocket.

## Features

- **Real-time collaboration**: multiple users draw in the same room simultaneously
- **Drawing tools**: select, pencil, rectangle, ellipse, diamond, arrow, line, text, image, eraser
- **Shape styling**: stroke color, fill color, roughness, opacity, stroke width
- **Selection & grouping**: rubber-band multi-select, Ctrl+G / Ctrl+Shift+G grouping
- **Copy/Paste**: Ctrl+C / Ctrl+V with offset
- **Undo/Redo**: delta-based undo stack (Ctrl+Z / Ctrl+Shift+Z)
- **Export**: PNG, SVG, JSON export/import
- **Auto-save**: debounced persistence with optimistic concurrency
- **Theme**: light/dark mode with localStorage persistence
- **Touch support**: pinch-to-zoom, two-finger pan, double-tap text edit
- **Security**: bcrypt password hashing, JWT session tokens, CORS restriction, rate limiting, httpOnly cookies, token revocation
- **Production-ready**: GitHub Actions CI/CD, PM2 process manager, Nginx reverse proxy, automated EC2 deployment

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.2+
- PostgreSQL (local or Neon)

### Install

```bash
bun install
```

### Configure

```bash
cp .env.example .env
```

Set the following variables in `.env`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (≥ 32 chars) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `NEXT_PUBLIC_HTTP_BACKEND` | HTTP API base URL |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL |

### Run

```bash
bun run dev
```

This starts all workspaces via Turborepo:
- Frontend at `http://localhost:3000`
- HTTP backend at `http://localhost:3001`
- WebSocket backend at `ws://localhost:8080`

### Build

```bash
bun run build
```

### Lint & Format

```bash
bun run lint
bun run format
```

## Deployment

See [deploy.md](./deploy.md) for a complete production deployment guide to a single AWS EC2 instance with Nginx, PM2, and Certbot.

Quick steps:
1. Push to `main` branch
2. CI runs typecheck + build + lint
3. On success, deploy workflow SSHes into EC2 and redeploys automatically

## Project Structure

| Path | Purpose |
|------|---------|
| `apps/frontend/app/` | Next.js App Router pages |
| `apps/frontend/draw/` | Canvas engine, rendering, input handling |
| `apps/frontend/components/` | React UI components |
| `apps/http-backend/src/` | Auth, room CRUD, middleware |
| `apps/ws-backend/src/` | WebSocket server, room broadcasting |
| `packages/db/` | Prisma schema + migrations |
| `packages/shapes/` | Shape type definitions |
| `packages/ui/` | Shared UI primitives |
| `packages/common/` | Shared types, JWT utils, env config |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all apps in development mode |
| `bun run build` | Build all packages and apps |
| `bun run lint` | Run ESLint across all workspaces |
| `bun run format` | Format code with Prettier |

## License

MIT
