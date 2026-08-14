# Excalidraw Clone - Feature Timeline

## Week 1: Jan 11-19, 2025 — Bootstrap & Scaffolding

| Date | Feature | Details |
|------|---------|---------|
| Jan 11 | Monorepo scaffolding | `create-turbo` to set up Turborepo monorepo with pnpm |
| Jan 11 | HTTP + WebSocket servers | Bootstrapped backend services (basic structure) |
| Jan 18 | Frontend skeleton | Basic canvas page, type errors remaining |
| Jan 19 | Canvas basics | Pencil drawing + zoom (incomplete) |

> *Project paused for ~6 months*

---

## Week 2: Jul 5, 2025 — Core Canvas & Auth (Marathon Day)

### Foundation & Auth
| Time | Feature | Details |
|------|---------|---------|
| 12:09 | WebSocket bug fixes | Fixed `leave_room` logic, package dependencies |
| 12:10 | TypeScript fixes | Tool type export, missing types |
| 12:12 | File cleanup | Removed excess/duplicate files |
| 12:13 | Auth pages | `AuthPage.tsx` calling API, `RoomCanvas.tsx` using stored token |
| 12:13 | Password hashing | bcrypt for signup/signin |
| 12:14 | Deduplication | Removed duplicate code |
| 12:40 | Refactoring | Moved secrets to `.env`, cleaned up code |
| 12:41 | Environment config | Secrets removed from code |

### Canvas Core
| Time | Feature | Details |
|------|---------|---------|
| 12:43 | Undo/Redo | Ctrl+Z / Ctrl+Shift+Z with delta-based stack |
| 12:45 | Shape selection | Click-to-select on canvas |
| 12:45 | Selection tool | Select tool with rubber band |
| 12:47 | Export PNG/SVG | Basic export functionality |
| 12:49 | Dummy secrets | Environment placeholder setup |
| 12:53 | Dark theme toggle | Light/dark mode switch |

### Rendering & Polish
| Time | Feature | Details |
|------|---------|---------|
| 13:07 | Rough.js rendering | Hand-drawn aesthetic for shapes |
| 13:07 | PNG/SVG export cleanup | Removed old pencil logic |
| 13:10 | Type updates | Shared types package |
| 13:10 | Package structure | Turborepo packages organized |
| 13:13 | Canvas resize | Responsive canvas sizing |
| 13:15 | Stroke width zoom | Rough.js stroke scales with zoom |
| 13:15 | Chat z-order | Chat messages reversed order |

### Shapes & Tools
| Time | Feature | Details |
|------|---------|---------|
| 14:13 | Auth page polish | Final auth UI |
| 14:13 | More shapes | Diamond, text, undo, image, eraser |
| 14:13 | Additional shapes | Circle, arrow, line added |
| 14:23 | Copy/Paste | Ctrl+C / Ctrl+V with offset |
| 14:24 | Text tool | Click-to-place text with inline editing |
| 14:27 | Shape styles | Stroke color, fill color per shape |
| 14:28 | Style properties | Properties panel for editing |
| 14:29 | Style panel | Left-side properties panel |
| 14:30 | Canvas callback | Shape commit callback |
| 14:35 | Shape grouping | Ctrl+G to group, Ctrl+Shift+G to ungroup |
| 14:36 | JSON import/export | Save/load shapes as JSON |
| 14:37 | Image upload | File picker for image insertion |
| 14:39 | Arrowhead customization | Configurable arrowhead size |
| 14:40 | Batch operations | Multi-select + move/delete/style |

### Export & Persistence
| Time | Feature | Details |
|------|---------|---------|
| 14:41 | Full export support | PNG/SVG export for all shape types |
| 14:44 | Text editing overlay | Replaced `window.prompt` with textarea |
| 14:49 | Canvas optimizations | Dirty rect rendering, layer caching |
| 14:53 | Auto-save | Debounced persistence to server |
| 15:02 | Code documentation | Added code comments |
| 15:16 | Shape properties | Properties panel always visible |
| 15:23 | Text tool | Inline text editing |
| 15:23 | Properties panel | Always-visible style panel |

### Theme & Dark Mode
| Time | Feature | Details |
|------|---------|---------|
| 15:33 | Dark theme cleanup | Dark mode UI polish |
| 15:33 | Menu | Toolbar menu |
| 15:47 | Theme cleanup | Final theme adjustments |
| 16:03 | Theme persistence | Theme saved to localStorage |
| 22:01 | Single render fix | Eliminated double rendering |
| 22:08 | Color sync | Color changes pushed correctly |
| 22:20 | Final fixes | Day-end polish |
| 22:36 | Env consolidation | Single env var location |

---

## Week 2: Jul 6, 2025 — Security, Real-time & Hardening

### Security
| Time | Feature | Details |
|------|---------|---------|
| 10:08 | Env-configured URLs | Frontend URLs via env vars |
| 10:10 | CORS restriction | `ALLOWED_ORIGINS` env var |
| 10:10 | Rate limiting | In-memory sliding-window rate limiter |
| 10:11 | WS auth via headers | `Sec-WebSocket-Protocol` instead of URL params |
| 10:12 | DB indexes | Composite indexes on Chat model |
| 10:14 | Auth middleware | Bearer token prefix support |
| 10:14 | Token handling | 401/expired token graceful handling |
| 10:15 | WS auth failure | Handle WebSocket auth errors |
| 10:21 | Room authorization | Room-level read/write permissions |

### Real-time Collaboration
| Time | Feature | Details |
|------|---------|---------|
| 10:55 | WS broadcast fix | No echo to sender — duplicates on every edit |
| 10:46 | Room authorization | Any user can't read/write any room |
| 10:53 | Eraser persistence | Shapes don't rerender on refresh (fixed) |
| 10:56 | User enumeration fix | Signup error no longer reveals if email exists |
| 11:00 | Line tool icon | Fixed icon |
| 11:01 | Arrow tool icon | Fixed icon |
| 11:02 | Port config | Env-configured ports |
| 11:03 | Canvas reinit fix | `useEffect` deps for roomId/socket |
| 11:05 | Undo stack optimization | Switch to deltas, unbounded stack fix |

### Production Readiness
| Time | Feature | Details |
|------|---------|---------|
| 11:16 | Export theme match | Exports match current theme |
| 11:18 | Canvas CTA fix | "Open Canvas" button navigates correctly |
| 11:19 | Auth page dark mode | Auth UI supports dark theme |
| 11:25 | Dead code cleanup | Removed unused code |
| 11:26 | ErrorBoundary | Catches render errors in canvas tree |
| 11:27 | WS reconnection | Auto-reconnect with exponential backoff |
| 11:30 | Secrets check | Always require secrets |
| 11:31 | Graceful shutdown | SIGTERM/SIGINT handling |
| 11:32 | Body size limit | Content-Length spoofing prevention |
| 11:35 | Message size limit | Memory exhaustion prevention |
| 11:38 | Optimistic concurrency | Version checking on save |
| 11:42 | Image payload cap | Limit on image size |
| 11:46 | Room race condition | Fix join room race |
| 11:48 | Drawing rate limit | Rate limit on shape mutations |

---

## Week 3: Jul 22, 2025 — Touch Support & Bug Fixes

### Touch Support
| Time | Feature | Details |
|------|---------|---------|
| 19:14 | Touch events | Pinch-to-zoom, two-finger pan, double-tap text edit |

### Bug Fixes
| Time | Feature | Details |
|------|---------|---------|
| 19:28 | WS broadcast optimization | Full-state broadcast on every mutation (fixed) |
| 19:35 | Image cache eviction | LRU cache for base64 data URLs |
| 19:40 | Name conventions | Code style cleanup |
| 19:43 | Eraser cursor fix | Double-transform + fall-through |
| 19:43 | Drag undo fix | Undo for drag operations |
| 19:44 | Text edit undo | Shallow copy fix |
| 19:48 | Context menu leak | Listener leak in destroy() |
| 19:51 | Socket readyState check | `send()` without readyState check |
| 19:53 | Image error handling | `onerror` for corrupt files |
| 19:55 | Eraser memory leak | `eraserPoints` grows unboundedly |
| 19:59 | Canvas resize fix | Game notified on canvas resize |
| 20:00 | Error alerts | Non-blocking error notifications |
| 20:03 | Touch scroll fix | `preventDefault()` blocking scroll |
| 20:05 | RGBA fix | Missing alpha value |
| 21:17 | Set type fix | `Set<string>` instead of `Set<number>` |
| 21:19 | globalAlpha fix | Try-catch for corrupted data |

### TypeScript Cleanup
| Time | Feature | Details |
|------|---------|---------|
| 15:38 | Type extraction | Shared types moved to types package |

---

## Week 3: Jul 28, 2025 — Docker & Final Polish

### Docker
| Time | Feature | Details |
|------|---------|---------|
| 19:07 | Port fix | Correct port configuration |
| 19:08 | Dockerfiles | Multi-stage Docker builds for backends |
| 19:12 | Frontend fix | TypeScript correctness |

### Final Fixes
| Time | Feature | Details |
|------|---------|---------|
| 19:18 | Type fixes | Correct TypeScript types |
| 19:21 | Idiomatic TS | TypeScript best practices |

---

## Week 22: Aug 7, 2026 — Security Audit, Bun Migration & CI/CD

### Security Fixes
| Time | Feature | Details |
|------|---------|---------|
| — | JWT algorithm confusion | Pinned HS256 in sign and verify (auth.ts, middleware.ts, ws-backend) |
| — | CORS wildcard fallback | Returns null (no header) when origin unmatched or ALLOWED_ORIGINS unset in production |
| — | X-Forwarded-For spoofable | Changed from first IP to last IP in chain |
| — | Room slug XSS | Added regex constraint `[a-zA-Z0-9_-]` |
| — | JWT in localStorage | Replaced with httpOnly cookie for HTTP auth + in-memory lib/auth.ts for WS auth |
| — | Env validation | Added DATABASE_URL to required vars in env.ts |
| — | join_room optimistic add | Validate room exists before adding to ws.data.rooms |
| — | FK RESTRICT → Cascade | Changed to onDelete: Cascade on Room→User, Chat→Room, Chat→User |

### Crash & Bug Fixes
| Time | Feature | Details |
|------|---------|---------|
| — | JSON.parse crash | Added try/catch around both JSON.parse calls in Game.onmessage |
| — | Async init race condition | Added destroyed flag checked in .then() callback |
| — | Division by zero (distToSegment) | Early return when ab2 === 0 |
| — | Division by zero (zoom) | this.zoom || 1 guard in viewport.ts |
| — | Stack overflow on large arrays | Replaced Math.min(...xs) with iterative loops in shapes.ts and exporter.ts |
| — | Object URL revoked too early | Deferred with setTimeout in exporter.ts |
| — | Race condition in saveShapes | Wrapped version check + write in prismaClient.$transaction |
| — | DB errors silenced | Return 500 instead of 200 with empty data on DB errors |
| — | Signup swallows errors | Distinguish P2002 (email taken → 200) from other errors (→ 500) |
| — | OpenCanvasButton silent redirect | Only redirect on 401/403, show inline error otherwise |

### Performance & Correctness
| Time | Feature | Details |
|------|---------|---------|
| — | Selection box coords | Computed endX/endY explicitly for clarity |
| — | Auto-save 409 merge | Compare against lastSyncedShapes to detect locally modified shapes; local wins on conflict |
| — | Image cache key | Strip data URL prefix, use base64 content as key |
| — | Unbounded undo stacks | Capped at 100 entries in undoManager.ts |
| — | Arrow key structuredClone | Only clone selected shapes instead of entire array |
| — | Error boundary reset | Added componentDidUpdate to reset on children change |

### UI & Accessibility
| Time | Feature | Details |
|------|---------|---------|
| — | IconButton a11y | Changed div onClick to button type="button" |
| — | Auth form Enter key | Wrapped inputs in form onSubmit, button changed to type="submit" |
| — | Button missing type | Added type="button" to packages/ui/button.tsx |
| — | Game in useState | Changed to useRef<Game> with gameReady state flag |
| — | Copyright year | Dynamic new Date().getFullYear() |

### Bun Migration
| Time | Feature | Details |
|------|---------|---------|
| — | Bun JWT | Replaced jsonwebtoken with Bun.jwt.sign/verify |
| — | Bun env/exit/on | process.env → Bun.env, process.exit → Bun.exit, process.on → Bun.on |
| — | TextEncoder | Replaced Buffer.byteLength with TextEncoder |
| — | Build targets | Updated to --target bun |
| — | Flattened src/ | Both backends and all 3 packages (common, db, ui) — files at package root |
| — | No build step | Backends run .ts directly with Bun, no dist/ |

### CI/CD & Infrastructure
| Time | Feature | Details |
|------|---------|---------|
| — | CI workflow | GitHub Actions: install, build, typecheck on PRs and pushes to main |
| — | Deploy workflow | Triggered after CI passes: SSH into EC2, pull, build, migrate, restart PM2 |
| — | PM2 ecosystem fix | Frontend uses `bun next start` instead of `node_modules/.bin/next` |
| — | @repo/ui dependency | Added missing workspace dependency to frontend package.json |
| — | Duplicate lint config | Removed entries already in baseConfig from react-internal.js |

### Token Revocation & Session Management
| Time | Feature | Details |
|------|---------|---------|
| — | Session table | Prisma Session model (token, userId, expiresAt) with indexes |
| — | Session on signin | Creates session record, cleans up expired sessions |
| — | WS token verifies session | `/auth/ws-token` checks session exists before issuing |
| — | Logout endpoint | `POST /auth/logout` revokes session, clears cookie |
| — | Separate WS token endpoint | `GET /auth/ws-token` returns 5-min JWT via httpOnly cookie |
| — | Signin cookie-only | Signin no longer returns JWT in response body |

### WebSocket Re-auth
| Time | Feature | Details |
|------|---------|---------|
| — | re_auth message type | Backend verifies new token, updates connection userId |
| — | Frontend heartbeat | Fetches fresh token every 4 min, sends via re_auth |
| — | Timer lifecycle | Cleared on disconnect, unmount, or auth failure |

### ESLint Fixes
| Time | Feature | Details |
|------|---------|---------|
| — | Canvas refs during render | Store game instance in state instead of ref |
| — | RoomCanvas connect pattern | Move connect into useEffect, use ref for recursive call |
| — | ThemeToggle DOM read | Use useState initializer instead of effect |
| — | ignoreDuringBuilds removed | ESLint now runs during Next.js builds |

### CI/CD Updates
| Time | Feature | Details |
|------|---------|---------|
| — | Full project typecheck | `bunx turbo check-types` across all packages |
| — | Lint step added | CI runs lint before build |

---

## Week 22: Aug 8–9, 2026 — Production Readiness & AWS Deployment

### Bun 1.3 Compatibility
| Time | Feature | Details |
|------|---------|---------|
| — | `Bun.on` removed | Graceful shutdown (SIGTERM/SIGINT) now uses `process.on` in http-backend and ws-backend |
| — | `Bun.jwt` removed | New `packages/common/jwt.ts`: sync HS256 `signJwt`/`verifyJwt` via `node:crypto` (timingSafeEqual + exp check); all 4 call sites migrated (signin, `/auth/ws-token`, middleware, ws-backend `checkUser`) |

### Database
| Time | Feature | Details |
|------|---------|---------|
| — | Session table migration | Added `20260808000000_add_session_table` (table + userId/token/expiresAt indexes + FK cascade) — schema had Session but no migration existed; applied to live Neon DB, `prisma migrate diff` confirms schema in sync |

### Build & CI
| Time | Feature | Details |
|------|---------|---------|
| — | Frontend CI build fix | Added `@types/node` to frontend devDependencies — Next.js auto-installs missing types via hardcoded npm, which crashes on the `workspace:*` protocol (`EUNSUPPORTEDPROTOCOL`) |

### Deployment Infrastructure
| Time | Feature | Details |
|------|---------|---------|
| — | Nginx `/api/` prefix | `proxy_pass` now strips the prefix (backend routes have none) — previously every API call 404'd |
| — | Nginx `/ws` location | Dropped trailing slash so `wss://domain/ws` actually matches (was falling through to the frontend) |
| — | deploy.yml env propagation | `APP_DIR`/`REPO_URL` now passed to the remote shell via SSH env prefix (quoted heredoc never expanded them before) |
| — | deploy.yml pm2 | Idempotent `pm2 start deploy/pm2/ecosystem.config.js --update-env` replaces failing `restart || start` fallback |
| — | PM2 ecosystem script | Frontend now uses `script: node_modules/next/dist/bin/next` (pm2 can't resolve a bare `next` binary) |
| — | deploy.md | Full rewrite: 5-phase runbook, ops reference, security notes, troubleshooting |

### Verification
| Time | Feature | Details |
|------|---------|---------|
| — | End-to-end audit | Production-mode runtime tests against live Neon: auth flow, CORS (matching/evil origins), rooms, shapes optimistic concurrency (409 on stale), WS join/chat/shape-diff/cursor/re_auth, `next start` pages — all passing |

---

## Week 22: Aug 9, 2026 — Canvas UX & Interaction Fixes

### Canvas Engine Fixes
| Time | Feature | Details |
|------|---------|---------|
| — | Single authoritative tool state | `Game.selectedTool` is the sole source of truth; Hand toggles via `setHandPanning` and restores previous tool on exit |
| — | Hand tool state | Toolbar and React state stay in sync through `toolChangeCallback`; no more two tools appearing selected |
| — | Trackpad navigation | Two-finger scroll pans the canvas; `ctrl`/`meta`+wheel or pinch zooms around cursor |
| — | Theme-safe shape colors | `setTheme` no longer overwrites `currentStyle` if the user has customized it; existing shapes retain their stored colors |
| — | Text tool workflow | Text tool now edits existing text on click; creates new text on empty canvas; Escape cancels in-progress edits |
| — | Delete/undo correctness | `deleteSelectedShape` removes from `existingShapes`; undo/redo tracks trash membership so restored items do not resurrect deleted copies |
| — | Rotation pivot | Uses `getShapeCenter(shape)` instead of bounds center to eliminate jitter during rotation |
| — | Image cache race | `ImageCache.getAsync` attaches `onload`/`onerror` before setting `src`, fixing cached images that never resolved |
| — | Pointer state hygiene | `handlePointerDown` resets `isSelecting`, `isResizing`, `isRotating` to prevent stuck interactions |
| — | Eyedropper tool | Switches back to Select through `setTool` so state stays consistent; picked color is preserved across theme changes |
| — | Trash updates | Replaced 500ms polling interval with `trashChangeCallback` fired on every trash mutation |

### UI & Rendering Fixes
| Time | Feature | Details |
|------|---------|---------|
| — | Dark mode toolbar contrast | Added `dark:bg-card-dark/90` to `MainToolbar`, `ZoomControls`, `HistoryControls`, and `MobileToolDock` |
| — | Image placeholder | Loading state uses theme-aware colors so it is visible in both light and dark modes |
| — | Text editor positioning | Removed arbitrary vertical offset so the textarea aligns with rendered text |
| — | Paste deduplication | Removed duplicate undo/sync calls in `pasteExternal` |
| — | Remote sync deduplication | `initHandlers` skips `added` shapes whose IDs already exist locally |

### Bug Fixes
| Time | Feature | Details |
|------|---------|---------|
| — | Hydration mismatch (RoomList) | Moved `getRecentRooms()` from `useState` initializer to `useEffect` so SSR and client start from the same state |
| — | Hydration error (Auth pages) | Wrapped `AuthPage` in `<Suspense>` on `/signin` and `/signup` to satisfy Next.js `useSearchParams` requirement |
| — | `.next` chunk error | Stale build cache issue; resolved by clean rebuild |

### Keyboard Shortcuts
| Time | Feature | Details |
|------|---------|---------|
| — | Tool shortcuts | `V` select, `H` hand, `R` rect, `O` ellipse, `T` text, `E` eraser, `A` arrow, `D` diamond, `P` pen, `I` eyedropper — all route through the same `setTool` path as toolbar clicks |
| — | Escape | Cancels in-progress shape creation/resizing/rotation/selection; exits text editing; clears selection |
| — | Delete/Backspace | Removes selected shapes from `existingShapes`, pushes to trash, and supports undo |

---

## Week 22: Aug 10-11, 2026 — Documentation & Portfolio

### Case Study (CoDraw.mdx)

| Time | Feature | Details |
|------|---------|---------|
| — | Case study written | Full MDX case study for portfolio: frontmatter, architecture Mermaid diagrams, 4-phase journey, 5 hard technical challenges (diff-based sync, session management, Rough.js performance, auto-save conflict resolution, WebSocket reconnection), 2 production incidents (Nginx prefix, upstream IP staleness), results & metrics, tech stack |
| — | Problem/Context refined | Sharpened opening to call out Excalidraw's client-side-only limitation and the specific gap CoDraw fills |
| — | Rapid-fire answers added | "What would you improve", "Hardest bug" (Bun 1.3 migration), "Canvas engine internals", "Testing strategy", "Security", "Scaling beyond single EC2" |

### Interview Prep (CoDraw-Whiteboard.md)

| Time | Feature | Details |
|------|---------|---------|
| — | Whiteboard script written | 9-section interview script: 20-second hook, 3 architecture boxes, 3 drawable flows (real-time sync, auth, room auth), closing zoom-out, 12 rapid-fire answers, 4 known gaps with file paths and interview lines, delivery tips |
| — | Rapid-fire answers expanded | Added "What would you improve", "Hardest bug", "Canvas engine internals", "Testing strategy", "Security", "Scaling" to the existing rapid-fire section |
| — | Known gaps updated | Gap 1 (no CRDT), Gap 2 (single-process WS), Gap 3 (no automated tests), Gap 4 (no image sanitization), plus meta-pattern on client-side source of truth vs server-side persistence |

### README Rewrite

| Time | Feature | Details |
|------|---------|---------|
| — | README.md rewritten | ASCII architecture diagram, real-time sync flow diagram, categorized features (Drawing, Collaboration, Auth, Performance, UX, Production), project structure tree, feature timeline table, links to CoDraw.mdx and CoDraw-Whiteboard.md |

---

## Week 22: Aug 14, 2026 — Bound Text in Shapes

### Text-in-Shapes
| Time | Feature | Details |
|------|---------|---------|
| — | Bound text shapes | Double-click rect/circle/diamond/ellipsisArc/stickyNote to create centered text; text follows container on drag/resize/align/distribute/nudge; cascade delete on container removal; touch double-tap support |

---

## Summary by Feature Area

| Category | Features Implemented | Date(s) |
|----------|---------------------|---------|
| **Auth** | Signup, Signin, JWT, bcrypt, rate limiting | Jul 5-6 |
| **Room Management** | Create rooms, room lookup, slug-based navigation | Jul 5-6 |
| **Real-time Collaboration** | WebSocket shape sync, room join/leave, auto-reconnect | Jul 5-6 |
| **Canvas Core** | Pan, zoom, viewport transforms, touch support | Jul 5, Jul 22 |
| **Drawing Tools** | Select, Pencil, Rectangle, Circle, Diamond, Arrow, Line, Text, Image, Eraser | Jul 5 |
| **Shape Styling** | Stroke color, fill color, roughness, opacity, stroke width | Jul 5 |
| **Selection** | Single select, rubber band, multi-select (Shift+click) | Jul 5 |
| **Grouping** | Ctrl+G group, Ctrl+Shift+G ungroup | Jul 5 |
| **Copy/Paste** | Ctrl+C / Ctrl+V with offset | Jul 5 |
| **Undo/Redo** | Ctrl+Z / Ctrl+Shift+Z, delta-based stack | Jul 5 |
| **Export** | PNG, SVG, JSON export | Jul 5 |
| **Import** | JSON import | Jul 5 |
| **Auto-save** | Debounced persistence, optimistic concurrency | Jul 5-6 |
| **Theme** | Dark/Light mode, localStorage persistence | Jul 5 |
| **Error Handling** | ErrorBoundary, graceful shutdown, body limits | Jul 6 |
| **Security** | CORS, rate limiting, WS auth, room authorization | Jul 6 |
| **Performance** | Dirty rect rendering, layer caching, LRU image cache | Jul 5, Jul 22 |
| **Docker** | Multi-stage builds for HTTP + WS backends | Jul 28 |
| **Security Audit** | JWT hardening, CORS, XSS, CSRF, env validation | Aug 7 |
| **Crash Fixes** | JSON.parse, race conditions, division by zero, stack overflow | Aug 7 |
| **Bun Migration** | Bun JWT, Bun.env, flattened src/, no build step | Aug 7 |
| **CI/CD** | GitHub Actions CI + deploy pipeline, PM2 fix | Aug 7 |
| **Token Revocation** | Session table, logout endpoint, WS token verification | Aug 7 |
| **WS Re-auth** | Heartbeat timer, re_auth message, proactive token refresh | Aug 7 |
| **ESLint Fixes** | Refs during render, unused imports, ignoreDuringBuilds removed | Aug 7 |
| **Bun 1.3 Compat** | Bun.jwt → custom HS256 JWT, Bun.on → process.on | Aug 8 |
| **Session Migration** | `add_session_table` migration created + applied to Neon | Aug 8 |
| **CI Build Fix** | @types/node for Next.js type-checking (npm workspace: crash) | Aug 8 |
| **Deployment** | Nginx /api//ws fixes, deploy.yml env propagation, PM2 script fix, deploy.md rewrite | Aug 8-9 |
| **E2E Validation** | Full production-mode audit: auth, CORS, rooms, shapes, WebSocket, frontend | Aug 9 |
| **Canvas UX Fixes** | Tool state, trackpad/zoom, theme-safe colors, text/delete/undo, rotation, image cache, trash callback, toolbar contrast, hydration fixes | Aug 9 |
| **Bound Text in Shapes** | Double-click container shapes to create/edit centered text; bound text follows container on drag/resize/align/distribute/nudge; cascade delete on container removal | Aug 14 |
| **Documentation** | Case study (CoDraw.mdx), whiteboard interview script (CoDraw-Whiteboard.md), README rewrite | Aug 10-11 |
