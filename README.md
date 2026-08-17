# CoDraw

A real-time collaborative whiteboard — think self-hostable Excalidraw with room-based drawing, auth, and persistence. Built as a Turborepo monorepo with a Next.js frontend, a Bun HTTP API, and a separate Bun WebSocket server.

**Live:** [codraw.nerdev.in](codraw.nerdev.in) · **Source:** [github](https://github.com/nerdev-co/codraw/tree/main)

---

## Why

Most collaborative whiteboards either give up the hand-drawn Rough.js aesthetic for performance, or lock you into a closed cloud. Existing open-source alternatives like Excalidraw are client-side only — no real-time sync, no auth, no persistence. CoDraw fills that gap: it keeps the organic sketchy rendering, supports full real-time collaboration over WebSockets, and runs on modest infrastructure without depending on a vendor.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx :80 / :443                      │
└───────┬──────────────────────┬───────────────────────────┘
        │                      │
   ┌────▼────┐           ┌────▼────┐
   │ Frontend│           │   HTTP  │
   │ Next.js │           │ Backend │
   │ :3000   │           │ :3001   │
   └────┬────┘           └────┬────┘
        │                     │
        │              ┌──────▼──────────┐
        │              │  PostgreSQL     │
        │              │  (Neon)         │
        │              └─────────────────┘
        │
   ┌────▼────────────────────┐
   │  WebSocket Backend      │
   │  :8080                  │
   └─────────────────────────┘
```

Three independent services behind Nginx:

- **Frontend** (`apps/frontend`) — Next.js 15 / React 19. Canvas rendering with Rough.js, local state management, WebSocket client, auto-save, export.
- **HTTP Backend** (`apps/http-backend`) — Bun + native Web API. Auth, room CRUD, session management, shape persistence with optimistic concurrency.
- **WebSocket Backend** (`apps/ws-backend`) — Bun + WebSocket server. Real-time shape diff broadcasting, cursor sync, chat, room management.

All three run under **PM2** on a single EC2 instance (t3.small), with Neon providing managed PostgreSQL. CI/CD is a two-stage GitHub Actions pipeline: CI runs typecheck, build on every PR and push to main; on success, the deploy workflow ships the prebuilt Next.js `.next/` artifact to EC2 via `scp`, pulls latest source, installs deps, runs migrations, and restarts PM2 — no rebuild on the instance.

---

## Real-time sync

```
User draws on canvas
    → Frontend computes shape diff
    → WebSocket sends shape-diff message
    → WS Backend broadcasts to all users in room
    → Each frontend applies diff to local state
    → Debounced auto-save persists to Postgres via HTTP API
```

The frontend computes minimal diffs (added, modified, deleted shape IDs) — not full state — and sends only the delta over WebSocket. Each receiving client applies the diff immediately. Persistence is separate: the frontend debounces saves (1.5s) and sends the full state to the HTTP backend, which writes to Postgres with optimistic concurrency control.

On reconnection, the server sends the full authoritative state and the client replaces its local state. No delta replay needed.

---

## Features

### Drawing
- **Tools**: Select, Pencil, Rectangle, Ellipse, Diamond, Arrow, Line, Text, Image, Eraser
- **Styling**: Stroke color, fill color, roughness, opacity, stroke width
- **Operations**: Undo/Redo (delta-based stack, cap 100), Copy/Paste, Group/Ungroup, rubber-band multi-select
- **Export**: PNG, SVG, JSON export/import

### Collaboration
- **Room-based**: create/join rooms via slug
- **Real-time sync**: diff-based WebSocket broadcasting
- **Cursor sync**: see other users' cursors
- **Chat**: per-room text chat

### Auth & Security
- **Session-based auth**: bcrypt password hashing, httpOnly cookies, server-side sessions
- **Token revocation**: logout invalidates session immediately
- **WebSocket auth**: short-lived WS tokens via `/auth/ws-token`, heartbeat with `re_auth`
- **CORS**: locked to `ALLOWED_ORIGINS`
- **Rate limiting**: sliding window on auth endpoints
- **Input validation**: room slug regex `[a-zA-Z0-9_-]`

### Performance
- **Dirty-rect rendering**: only redraws changed regions
- **Layer caching**: static / active / overlay layers
- **Zoom-aware strokes**: Rough.js stroke scales with zoom
- **Debounced auto-save**: 1.5s debounce with version checking
- **Optimistic concurrency**: 409 on version mismatch, client-side merge

### UX
- **Theme**: light/dark mode with localStorage persistence
- **Touch**: pinch-to-zoom, two-finger pan, double-tap text edit
- **Keyboard shortcuts**: V/H/R/O/T/E/A/D/P/I for tools, Ctrl+Z/Ctrl+Shift+Z, Escape, Delete
- **Error boundaries**: graceful fallback on canvas errors
- **WebSocket reconnection**: exponential backoff, 1s initial / 30s max

### Production
- **CI/CD**: GitHub Actions — typecheck, lint, build on every PR; deploy to EC2 on merge to main
- **Infrastructure**: Nginx reverse proxy, PM2 process manager, Neon Postgres
- **Incident documentation**: root-cause analysis for production issues

---

## Getting started

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

- Frontend: `http://localhost:3000`
- HTTP backend: `http://localhost:3001`
- WebSocket backend: `ws://localhost:8080`

### Build

```bash
bun run build
```

### Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all apps in development mode |
| `bun run build` | Build all packages and apps |
| `bun run lint` | Run ESLint across all workspaces |
| `bun run format` | Format code with Prettier |

---

## Project structure

```
codraw/
├── apps/
│   ├── frontend/
│   │   ├── app/                  # Next.js App Router pages
│   │   ├── components/           # React UI components
│   │   └── draw/                 # Canvas engine, rendering, input handling
│   ├── http-backend/
│   │   └── src/                  # Auth, room CRUD, middleware, session
│   └── ws-backend/
│       └── src/                  # WebSocket server, room broadcasting
├── packages/
│   ├── db/                       # Prisma schema + migrations
│   ├── shapes/                   # Shape type definitions
│   ├── ui/                       # Shared React components
│   ├── common/                   # Shared types, JWT utils, env config
│   ├── typescript-config/        # Shared tsconfig presets
│   └── eslint-config/            # Shared ESLint configs
├── deploy/                       # Nginx + PM2 + deployment scripts
├── features.md                   # Detailed feature timeline
├── CoDraw.mdx                    # Full case study (portfolio)
└── CoDraw-Whiteboard.md          # Whiteboard interview script
```

---

## Deployment

See [deploy.md](./deploy.md) for a complete production deployment guide to a single AWS EC2 instance with Nginx, PM2, and Certbot.

Quick summary:
1. Push to `main` branch
2. CI runs typecheck + build + lint
3. On success, deploy workflow SSHes into EC2 and redeploys automatically

---

## Feature timeline

See [features.md](./features.md) for the full day-by-day development timeline (Jan 2025 → Aug 2026).

| Phase | Date | What changed |
|-------|------|-------------|
| Bootstrap | Jan 2025 | Monorepo scaffolding, HTTP + WS servers, frontend skeleton |
| Core Canvas | Jul 2025 | Canvas engine, drawing tools, shapes, undo/redo, export |
| Auth & Rooms | Jul 2025 | Signup/signin, bcrypt, Prisma schema, room CRUD |
| Real-time Sync | Jul 2025 | WebSocket backend, diff-based broadcasting, reconnection |
| Production Hardening | Aug 2026 | Session table, httpOnly cookies, optimistic concurrency, CI/CD, incidents |

---

## License

MIT
