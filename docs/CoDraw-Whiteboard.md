# CoDraw — Whiteboard Interview Script

**Goal:** explain this project like you're standing at a whiteboard, drawing boxes as you talk. Total time ~4-6 min if uninterrupted, but built to be paused anywhere for Q&A.

---

## 0. The 20-second hook (say this first, before drawing anything)

> "CoDraw is a real-time collaborative whiteboard — think of it as a self-hostable Excalidraw where multiple users draw together in the same room. Most collaborative whiteboards either give up the hand-drawn aesthetic or lock you into their cloud. I built one that keeps the Rough.js sketchy style, syncs shapes over WebSockets, supports full auth and persistence, and runs on a single EC2. It's a Turborepo monorepo: Next.js frontend, a Bun HTTP API, and a separate Bun WebSocket server."

That's it. Don't dive into tech stack yet — let them ask "walk me through the architecture" and THEN go to the whiteboard.

---

## 1. Draw the three boxes first (the skeleton)

Draw three boxes left to right, say each name as you draw it:

```
[ Next.js Frontend ]      [ HTTP Backend ]         [ WebSocket Backend ]
   port 3000                  port 3001                 port 8080
```

**Say:** "It's three independent services. The frontend is Next.js 15 / React 19 — it renders the canvas using Rough.js for that hand-drawn look, and handles all the local drawing state. The HTTP backend is Bun + native Web API — it owns auth, room CRUD, and session management. The WebSocket backend is also Bun-native, and I split it out on purpose because WebSocket connections are long-lived and stateful — a spike in drawing traffic or a slow client should never starve the request-response API."

Now draw a box above all three:

```
[ Nginx reverse proxy — port 80/443 ]
```

**Say:** "Nginx sits in front and routes by path: `/api/*` → HTTP backend, `/ws` → WebSocket backend, everything else → the Next.js frontend. One entry point, three services underneath."

---

## 2. Add the data layer underneath the HTTP backend

Draw below the HTTP backend box:

```
[ PostgreSQL (Neon) ]   [ PM2 ]
```

**Say, one at a time, don't rush:**

- **PostgreSQL (via Prisma)** — "Source of truth. The Prisma schema defines ~10 models: User, Room, Chat, Session, and shape-related tables. Neon gives me a managed Postgres with branching — I don't have to maintain it myself. The session table specifically is important: I moved away from stateless JWTs to httpOnly cookies + server-side sessions so I can revoke tokens on logout."

- **PM2** — "All three services run under PM2 on the EC2 instance. It keeps them alive across crashes, and I use `--update-env` on deploy so `.env` changes take effect without manual restarts."

---

## 3. The one flow worth drawing in detail: Real-time shape sync

This is the piece that shows systems thinking — spend the most time here.

Draw this as a straight pipeline:

```
User draws on canvas
    → Frontend computes diff
    → WebSocket sends shape-diff message
    → WS Backend broadcasts to all users in room
    → Each frontend applies diff to local state
    → Debounced auto-save persists to Postgres via HTTP API
```

**Say:** "When a user draws, the frontend computes a diff — just the shapes that changed, not the whole canvas state. It sends that diff over WebSocket to the ws-backend, which broadcasts it to everyone else in that room. Each receiving frontend applies the diff to their local state immediately — so you see other people's cursors and shapes in real-time, no polling.

Persistence is separate — every few seconds the frontend debounces a save to the HTTP backend, which writes the full shape state to Postgres. The WebSocket path is for liveness; the HTTP path is for durability. If someone disconnects and reconnects, they fetch the latest saved state and catch up."

**Then draw a small side box for reconnection:**

```
[ User reconnects ]
    → WS server sends full room state
    → Frontend replaces local state with server state
```

**Say:** "On reconnection — which happens automatically with exponential backoff — the server sends the current authoritative state for that room, and the client replaces its local state. No delta replay needed because the server always has the latest saved snapshot."

---

## 4. The second flow worth drawing: Auth + session management

Draw a simple flow:

```
Signup/Signin
    → HTTP Backend validates credentials (bcrypt)
    → Creates Session record in Postgres
    → Issues 7-day session cookie (httpOnly)
    → Returns userId in response body
```

**Say:** "Authentication is cookie-based. When you sign in, the backend creates a session record in Postgres, issues a 7-day session as an httpOnly cookie, and returns the userId in the response body. There's no JWT in the response body.

For WebSocket auth — I can't send custom headers during the upgrade handshake in all clients, so the flow is: frontend calls `/auth/ws-token` with the session cookie, gets a short-lived 5-minute JWT in the response body, then passes that token in the `Sec-WebSocket-Protocol` header. The ws-backend verifies the session exists in Postgres before accepting the connection. Token-less guests can also connect without any auth.

There's also a heartbeat: every 4 minutes the frontend fetches a fresh WS token and sends a `re_auth` message, so sessions don't expire mid-session. Logout hits `/auth/logout`, revokes the session, and clears the cookie."

---

## 5. The third flow worth mentioning: Room authorization

Draw a small diagram:

```
Join room request
    → WS backend checks: does user have a valid session?
    → Does the room exist?
    → Is the user allowed? (any authenticated user can join any room; token-less guests can also join with a stable guest ID)
    → Add to room's active members set
    → Broadcast user-joined to room
```

**Say:** "Room authorization is intentionally simple right now — any authenticated user can join any room, and token-less guests can also join via a stable client-generated guest ID. The ws-backend maintains per-room member maps and uses Bun pub/sub room topics for broadcast, so scaling to multiple instances would just need Redis pub/sub on top. It validates the session on every `join_room` call before adding the user."

---

## 6. Closing zoom-out (say this after the deep dives)

**Say:** "So the stack: Bun everywhere instead of Node for speed and native APIs — `process.env`, custom HS256 JWT via `node:crypto`, no build step for the backends, they run `.ts` directly. Turborepo keeps the frontend, HTTP backend, WS backend, and shared packages (`@repo/db`, `@repo/shapes`, `@repo/ui`) in one repo with shared types. Infra is a single EC2 instance with Nginx, PM2, and GitHub Actions CI/CD — typecheck and build on every PR, automated deploy to production on merge to main."

That's your natural stopping point — pause here and let them redirect.

---

## 7. Rapid-fire answers to likely follow-ups

**"Why split ws from http-backend instead of just using Socket.io inside the API?"**
→ Different scaling and failure characteristics. WS connections are long-lived and stateful; REST handlers are stateless and short-lived. Separating them means a slow WS client can't block the API's event loop, and I can scale each independently — though right now they run on the same EC2, the separation makes that easy later.

**"How do you handle concurrent edits — what if two users move the same shape at the same time?"**
→ Right now it's last-write-wins with optimistic concurrency. Each shape has an ID and a version; when saving, if the server version doesn't match what the client based its edit on, it returns 409. The frontend then fetches the latest state and merges. For a whiteboard this is acceptable — users rarely edit the exact same pixel simultaneously. If I were building Figma I'd reach for CRDTs, but that's overkill here.

**"Why Bun instead of Node?"**
→ Mostly for developer experience: native TypeScript support with no build step, fast installs, and the standard library is solid. The backends run `.ts` files directly — no `tsc` compilation, no `dist/` folder. For a small team or solo project, that removes an entire class of build-related bugs.

**"Why Turborepo instead of just three separate repos?"**
→ Shared packages. The `@repo/db` package exports the Prisma client, `@repo/shapes` has shape type definitions used by both frontend and backends, and `@repo/ui` has shared React components. Having them in one repo means changing a shape type is a single PR that updates all consumers, not three coordinated releases. Turborepo handles the build orchestration and caching.

**"What happens if the WebSocket connection drops?"**
→ Auto-reconnect with exponential backoff. The frontend stores the last known room state locally, so the canvas stays interactive while disconnected — users can still draw, it just won't sync until reconnect. On reconnect, the server sends the full authoritative state and the client reconciles. For brief drops this is seamless; for longer ones, you might see a jump when state syncs.

**"How does export work?"**
→ Export is entirely client-side. PNG export uses the canvas API directly — Rough.js renders to a 2D context, and I capture that. SVG export walks the shape array and emits SVG elements. JSON export serializes the shape state. No server round-trip needed because the frontend has the full authoritative state locally at all times.

**"What would you improve if you rebuilt this?"**
→ Two things. First, I'd add Redis pub/sub for cross-instance WebSocket broadcasting — right now the WS backend is single-process, so scaling beyond one instance requires a shared room state store. Second, I'd add proper automated tests. Right now verification is manual, and for a real-time system with race conditions, a test suite that exercises reconnect, concurrent edits, and session expiry would catch regressions I currently only catch in production.

**"Tell me about the hardest bug you fixed."**
→ The Bun 1.3 migration. `Bun.jwt` and `Bun.on` were removed in a minor version bump, which broke both backends at startup. The fix was replacing `Bun.jwt` with a custom HS256 implementation using `node:crypto` (with `timingSafeEqual` and explicit `exp` checking), and swapping `Bun.on` for `process.on` in the graceful shutdown handlers. The interesting part isn't the fix itself — it's that the whole backend runs `.ts` directly with no build step, so a breaking change in the runtime hit every service simultaneously at startup. That's the trade-off of using a young runtime.

**"How does the canvas engine actually render?"**
→ Rough.js is the rendering layer, but the engine manages viewport transforms, layer grouping, and dirty-rect optimization. Shapes live in a flat array grouped into layers: static (background shapes that don't change), active (shapes currently being drawn), and overlay (selection boxes, cursors). On interaction, only the active layer redraws. On zoom or pan, stroke width scales with the zoom factor so shapes don't get heavier or lighter. The dirty-rect system means a single shape move doesn't redraw the whole canvas — it only redraws the bounding box of the moved shape plus any overlapping shapes.

**"What's your testing strategy?"**
→ Honest answer: it's manual verification plus the CI typecheck and lint. I don't have automated tests for the canvas engine or WebSocket protocol — those are the gaps I'd prioritize. The HTTP backend has implicit test coverage through the CI build, but no unit tests either. For a whiteboard with complex interaction states (resizing while rotated, grouped shapes, undo after paste), I'd want integration tests that drive the canvas through WebSocket + HTTP and assert the final shape state. That's the next investment.

**"How do you handle security?"**
→ Several layers. CORS is locked to `ALLOWED_ORIGINS` — no wildcard fallback in production. Auth uses bcrypt for password hashing, httpOnly cookies for the WS token path (not exposed to XSS), and server-side sessions so I can revoke on logout. Rate limiting on auth endpoints using an in-memory sliding window. Input validation on room slugs (regex constraint `[a-zA-Z0-9_-]` to prevent XSS). Body size limits on HTTP and message size limits on WS to prevent memory exhaustion. And I moved JWT verification to pin `HS256` explicitly — no algorithm confusion attacks.

**"How would you scale this beyond a single EC2?"**
→ The architecture is already separated into three services, so scaling is straightforward in theory. The WS backend already uses Bun pub/sub for per-process room broadcast — the next step is Redis pub/sub for cross-instance broadcast and a shared room state store. The HTTP backend is stateless, so I can add instances behind Nginx with no changes. The frontend is Next.js, which scales horizontally. The database is Neon, which handles connection pooling and read replicas. So the path is: Redis pub/sub for WS, more EC2 instances for HTTP, and Neon scaling for the DB. PM2 would be replaced by a proper orchestrator, but the service boundaries are already clean.

---

## 8. Known Gaps Log (honest answers score higher than fake confidence)

### Gap 1: No CRDT — last-write-wins for concurrent edits
- **Where:** `apps/frontend/draw/undoManager.ts` and the save flow in `apps/frontend/draw/Game.ts`
- **Failure mode:** If two users edit the same shape simultaneously, whichever save reaches the server last wins. The other user's changes are silently overwritten on the next auto-save.
- **Real fix:** CRDTs (Yjs, Automerge) or operational transforms — but they add significant complexity. For a whiteboard where concurrent pixel-level editing is rare, last-write-wins with explicit 409 conflict surfacing is pragmatic. I'd add CRDTs if the product started getting merge-conflict reports from real users.
- **Interview line:** "Right now concurrent edits use last-write-wins with optimistic concurrency — the server returns 409 if versions diverge, and the frontend refetches. For a whiteboard this is fine; if I saw real merge conflicts in production I'd reach for Yjs or Automerge."

### Gap 2: WebSocket scaling is single-process
- **Where:** `apps/ws-backend/index.ts` — Bun pub/sub room topics are per-process; `roomMembers` and `shapeVersions` maps are in-memory.
- **Failure mode:** If I run multiple ws-backend processes, room state and user→socket mappings are per-process. A user connected to instance A won't receive broadcasts from instance B.
- **Real fix:** Redis pub/sub for cross-instance broadcast, plus a shared room state store (Redis hash or Postgres). The Bun pub/sub foundation is already in place; cross-instance just needs a Redis transport layer.
- **Interview line:** "The ws-backend already uses Bun pub/sub room topics for per-process broadcast — room state and versions are in-memory. Scaling to multiple instances would need Redis pub/sub for cross-instance broadcast on top of that foundation. I know the pattern, just haven't needed it at current scale."

### Gap 3: No automated tests
- **Where:** the whole repo — no unit, integration, or E2E test suite.
- **Failure mode:** The canvas engine has complex interaction states (resizing while rotated, grouped shapes, undo after paste, reconnect during active drawing) that are currently verified manually. A regression in any of these paths only gets caught by a user noticing it in production.
- **Real fix:** Vitest for unit tests (shape math, undoManager, viewport transforms), and Playwright or similar for integration tests that drive the canvas through WebSocket + HTTP and assert final shape state. For a real-time system, I'd especially want tests for reconnect reconciliation and concurrent edit conflict resolution.
- **Interview line:** "No automated tests right now — verified manually plus CI typecheck. The canvas engine has enough edge cases (resize-while-rotated, reconnect-during-draw) that I'd want Vitest for unit tests and Playwright for integration tests before calling this production-ready at scale."

### Gap 4: Image upload has no server-side sanitization
- **Where:** `apps/frontend/draw/imageCache.ts` and the upload flow in `apps/frontend/components/Canvas.tsx` — images are accepted as base64 data URLs with no server-side validation.
- **Failure mode:** A user could upload a crafted image that exploits a browser rendering bug, or use the image feature to store non-image data. There's no EXIF stripping, size enforcement, or content-type validation on the server.
- **Real fix:** Server-side image validation with Sharp — strip EXIF, enforce max dimensions and file size, reject non-image content. For a public-facing app, ClamAV or similar for malware scanning. Right now it's acceptable for an internal/trusted-user tool.
- **Interview line:** "Image upload is client-trusted right now — the frontend converts to base64 and sends it. I'd add Sharp on the server for sanitization and EXIF stripping before this went to a public audience."

### Meta-pattern: client-side source of truth + server-side persistence
Gaps 1, 2, and the reconnect design all share the same architectural choice: the frontend is the source of truth for the UI, and the server is the source of truth for durability. This is the right call for a whiteboard — users need 60fps responsiveness, and they don't want their drawing to stutter because a remote save is in flight. But it means every feature (undo, redo, reconnect, export) has to be designed around "what happens if the local state and server state diverge?" That tension is the through-line of the whole project.


---

## 9. Delivery tips

- Don't memorize word-for-word — know the **shape** of each answer, say it in your own words each time.
- Whiteboard order: boxes → arrows → one flow at a time. Never try to draw everything at once.
- If they interrupt mid-flow, answer the question, then say "should I continue with the real-time sync flow?" — shows control of the room.
- Have the repo link ready to share if they want to see actual code: `github.com/NalinDalal/week-22-excalidraw`
- The real-time sync flow and auth flow are your strongest answers — they show you understand both the happy path and the edge cases (reconnection, session expiry, CORS).
- When they ask "what was the hardest part," lead with the diff-based sync or the Bun 1.3 migration — both are concrete, technical, and show adaptability.
- If they ask "what would you improve," mention tests and Redis pub/sub — honest, actionable, and shows you understand the current limits.
- If the interview is for a frontend role, emphasize the canvas engine (Rough.js, dirty-rect, viewport transforms, layer caching) and state management (local state as source of truth, WebSocket integration, debounced persistence).
- If the interview is for a backend/full-stack role, emphasize the WebSocket protocol, session management with httpOnly cookies, optimistic concurrency, and the CI/CD pipeline.
- This doc works for two formats: (1) actual whiteboard interview where you draw as you talk, and (2) written take-home / portfolio piece where you send this as "how I'd explain this project." The structure supports both — the boxes and flows translate directly to diagrams in a markdown doc.
