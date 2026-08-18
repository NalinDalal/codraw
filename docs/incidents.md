# CoDraw — Incident Discovery & Postmortems

This file documents production-quality incidents, bug discoveries, and the resulting fixes in CoDraw. Each entry follows the same structure: discovery, root cause, resolution, and lessons learned.

---

## Incident 1: Canvas Blur on HiDPI / Retina Displays

**Discovered:** Aug 14, 2026  
**Severity:** Medium — degraded UX on all high-density screens  
**Status:** Resolved

### Discovery

A user reported that drawn shapes appeared "soft" or blurry on a Retina display. The effect was consistent across all shape types and zoom levels. Screenshots confirmed that strokes and fills lacked the crispness expected from a vector canvas renderer.

Initial hypotheses:
1. Rough.js stroke-width scaling was wrong
2. Cache canvas was being drawn at the wrong scale
3. Browser was stretching a low-resolution bitmap to fill the viewport

### Investigation

**Eliminated hypothesis 1:** `renderer.ts` already divides stroke width by `zoom` before passing to Rough.js, so stroke scaling is correct.

**Eliminated hypothesis 2:** The cache canvas is sized to `this.canvas.width × this.canvas.height` and `drawImage` copies it 1:1. No scaling artifact there.

**Confirmed hypothesis 3:** In `components/Canvas.tsx:147-149`:
```ts
canvas.width = window.innerWidth;   // 1x resolution
canvas.height = window.innerHeight;
```

On a 2x Retina display (e.g. MacBook Pro, `devicePixelRatio = 2`), this sets the backing store to **half** the physical pixel count. The browser must then upscale the bitmap by 2× to fill the CSS layout box, producing the observed blur.

Ironically, `HeroBoard.tsx:39-42` — the landing-page marketing canvas — already handled this correctly:
```ts
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr;
canvas.height = H * dpr;
```

The fix pattern was already in the repo; it simply never made it into the real drawing engine.

### Why This Was Not a Simple Copy-Paste

`Game.ts` reads `this.canvas.width` and `this.canvas.height` directly as the **logical coordinate space** in 26+ places:
- `navigateTo()` — centers viewport on a point
- `zoomIn()` / `zoomOut()` — zooms centered on the midpoint
- `zoomToFit()` — fits bounds within the viewport
- `insertImage()` / `enterEditAction()` — converts viewport center to canvas coords
- `wheelHandler()` — zoom centered on cursor
- `drawSelection()` / `drawDragSelect()` — handle sizing
- `clearCanvas()` — clears the full backing store
- `buildCache()` — sizes the offscreen cache
- alignment guides — extend to canvas edges

If `canvas.width` is simply multiplied by `dpr`, all that math silently breaks: pan/zoom drifts, clicks misalign, and selection handles scale incorrectly, because `viewport.ts:getCanvasCoords()` maps raw `clientX/clientY` (CSS pixels) against the now-inflated values.

### Root Cause

The canvas backing store was sized in CSS pixels rather than physical pixels. The engine's internal coordinate math was also sized in CSS pixels, but it read `canvas.width/height` (which would become physical pixels after a naive DPR fix) as its logical dimensions — creating a coupling that prevented a one-line fix.

**Contributing factor:** The correct pattern existed in `HeroBoard.tsx` but was not shared or reused. The two canvases were implemented independently.

### Resolution

Separated the **logical coordinate space** (CSS pixels) from the **physical backing store** (CSS × DPR):

**`components/Canvas.tsx`** — resize now sets both dimensions:
```ts
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = cssWidth * dpr;
canvas.height = cssHeight * dpr;
canvas.style.width = cssWidth + "px";
canvas.style.height = cssHeight + "px";
gameRef.current?.resize(cssWidth, cssHeight, dpr);
```

**`apps/frontend/draw/Game.ts`** — new fields + updated `resize()`:
```ts
private cssWidth = 0;   // logical width in CSS px
private cssHeight = 0;  // logical height in CSS px
private dpr = 1;        // device pixel ratio, capped at 2

resize(cssWidth?: number, cssHeight?: number, dpr?: number) {
    if (cssWidth !== undefined) this.cssWidth = cssWidth;
    if (cssHeight !== undefined) this.cssHeight = cssHeight;
    if (dpr !== undefined) this.dpr = dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cacheCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.invalidateCache();
    this.clearCanvas();
}
```

Then a mechanical pass replaced all 24 logical `canvas.width/height` usages with `cssWidth/cssHeight`. The two sites that legitimately need the physical backing store dimensions (`buildCache` sizing, `clearCanvas` cache comparison) were left as `this.canvas.width/height`.

**Cache canvas rendering:** `cacheCtx` gets the same `setTransform(dpr, ...)` as the main context, so all shape rendering happens at native resolution. When blitting to the main canvas, `drawImage` uses an identity transform for a 1:1 physical pixel copy.

### Outcome

Canvas renders at full native resolution on Retina/HiDPI displays. All coordinate math, hit-testing, zoom, pan, and selection handles remain correct because the logical coordinate space is unchanged.

**Commits:** `8e2b947`, `40aaabd`

---

## Incident 2: TypeScript Bound-Text Binding Field Not on Shape Union

**Discovered:** Aug 14, 2026  
**Severity:** Low — build-time type errors, no runtime impact  
**Status:** Resolved

### Discovery

After implementing bound text-in-shapes, `tsc --noEmit` reported `Property 'boundTextId' does not exist on type 'Shape'` at 10+ call sites in `Game.ts`.

### Investigation

`boundTextId` was added to the six container shape interfaces (`RectShape`, `CircleShape`, `DiamondShape`, `EllipsisArcShape`, `StickyNoteShape`, `FrameShape`) but **not** to the other shape interfaces in the `Shape` union type.

TypeScript's discriminated union requires a property to exist on **every** member of the union before it can be accessed through a base-type reference. Since `ArrowShape`, `LineShape`, `TextShape`, `PencilShape`, `EraserShape`, and `ImageShape` did not declare `boundTextId`, accessing it on `Shape` was a type error.

### Root Cause

Incomplete propagation of the new field across all shape type definitions.

### Resolution

Added `boundTextId?: string` to all 12 shape interfaces in `packages/shapes/`. Where `textShape` is narrowed by `s.type === "text"`, added an explicit `as TextShape` cast to satisfy the narrowed type for text-specific fields (`textAlign`, `x`, `y`, `fontSize`, `bold`, `italic`, `fontFamily`).

**Commit:** `a90274b`

---

## Incident 3: Cache Canvas Clear Rect Used Physical Instead of Logical Dimensions

**Discovered:** Aug 14, 2026 (during DPR fix)  
**Severity:** Medium — cache canvas content partially preserved across frames after resize  
**Status:** Resolved

### Discovery

While validating the DPR fix, observed that after a window resize the offscreen cache sometimes retained fragments of the previous frame's background, producing ghosting.

### Investigation

`buildCache()` called:
```ts
this.cacheCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
```

After the DPR fix, `this.canvas.width` is the **physical** pixel count (e.g. 3840 on a 1920×2 display). But `cacheCtx` has `setTransform(dpr, ...)` applied, so its coordinate space is logical CSS pixels. `clearRect(0, 0, 3840, 2160)` in a DPR-2 context clears a 1920×1080 logical area — which is correct. However, on some browsers the transform interaction with `clearRect` is inconsistent, and the physical-dimension path was fragile.

### Root Cause

`clearRect` on a transformed context should use logical dimensions, but the code was mixing physical (`canvas.width`) and logical (`cssWidth`) values.

### Resolution

Replaced with logical dimensions:
```ts
this.cacheCtx.clearRect(0, 0, this.cssWidth, this.cssHeight);
```

Also added an explicit `ctx.setTransform(1,0,0,1,0,0)` before `drawImage` in `clearCanvas()` to ensure the cache blit is a raw 1:1 pixel copy independent of any lingering DPR transform on the main context.

---

## Incident 4: Double-Click / Double-Tap Silently No-Ops on Non-Select Tools

**Discovered:** Aug 18, 2026  
**Severity:** Medium — silent dead end on most tools; accidental shapes on shape tools  
**Status:** Resolved

### Discovery

With any tool other than "select" active, double-clicking the canvas did nothing — the shape editor never opened. Worse, with a shape tool active the first click of the pair committed a full-size (100×100) shape at the click point that stayed on the canvas as a stray.

### Investigation

Both double-gesture handlers gated the editor path on the select tool:

`managers/mouseManager.ts` (dblclick) and `managers/touchManager.ts` (double-tap, `<300ms` window) called `hitTest` + `openShapeEditor` only when `selectedTool === "select"`.

The behavior diverged by tool because `handlePointerUp()` commits shape tools via `commitShape(shape, true)` and `commitShape` **auto-switches the tool back to "select"** (`shapeLifecycle.ts`). So:

- **Shape tools (rect, circle, diamond, ellipsisArc, arrow, stickyNote, frame):** the gate passed by the time `dblclick` fired, so the editor opened — but only on the accidental default-size shape the first click left behind.
- **Tools that never commit on click (pen, eraser, text, image, eyedropper, line):** the gate blocked the double-click entirely → silent no-op. **Pen** additionally committed a 2-point scribble per pair of clicks.

This is the same class of bug Excalidraw fixed in [excalidraw/excalidraw#740](https://github.com/excalidraw/excalidraw/issues/740): a double-click's first click must not leave a shape behind.

### Root Cause

Shape-editing was framed as a select-tool behavior instead of a canvas-level behavior, and click-committed shapes were not discardable when the click turned out to be the first half of a double-click.

### Resolution

Removed the tool gate from both handlers so the editor opens on whatever is under the cursor, for any tool. The polyline-finish branch stays first, and the **text tool** keeps a guard — its clicks already open the text overlay, and opening a second editor would yank focus away.

To clean up the stray commit, `PointerInteractionManager` now records the last click commit (shape id, commit point, timestamp) where shape and pen tools commit, and the double-click handlers call `discardStrayClickCommit()` before opening the editor:

```ts
discardStrayClickCommit(coords: [number, number]) {
    const removed = new Set<string>();
    while (this.lastClickCommit) {
        const commit = this.lastClickCommit;
        this.lastClickCommit = null;
        if (performance.now() - commit.t > 600) break;
        // 25px canvas distance from the commit point
        if ((coords[0] - commit.x) ** 2 + (coords[1] - commit.y) ** 2 > 25 * 25) break;
        removed.add(commit.shapeId);
    }
    if (removed.size === 0) return;
    const prev = [...this.context.existingShapes];
    this.context.existingShapes = this.context.existingShapes.filter((s) => !removed.has(s.id!));
    for (const id of removed) this.context.selectedIds.delete(id);
    this.api.pushUndo(prev, this.context.existingShapes);
    this.api.notifySelection();
    this.api.syncShapes();
}
```

The 600ms window plus the 25px distance check keeps deliberate drags safe: a genuinely dragged shape was committed either too long ago or too far from the double-click point. Discards are undoable and synced to collaborators.

### Outcome

Double-click / double-tap now edits the shape under the cursor with **any** tool active, and no accidental shape is left behind — matching the select-tool UX and Excalidraw's behavior.

**Commits:** `240a84d`

---

## Incident 5: Selection Renders in the Wrong Place After Arrow-Key Nudge

**Discovered:** Aug 18, 2026  
**Severity:** Medium — baked render cache can disagree with shape state  
**Status:** Resolved

### Discovery

Screenshots after nudging a selection with the arrow keys showed the selection outline at the new position while the baked shape stayed at the old position — the classic stale-cache ghost.

### Investigation

The nudge branch in `managers/shortcutRegistry.ts` (`navigation:arrowKeys`) translated the selected shapes via `translateShape`, pushed to the undo stack, and called `api.syncShapes()` — but carried **no explicit `invalidateCache()` / `clearCanvas()` pair**, unlike every other shape-mutating action in the file:

```ts
ctx.undoManager.push(prev, ctx.existingShapes);
api.syncShapes();          // ← relied on implicit invalidation only
```

Correctness depended entirely on `syncShapes()` internally invalidating and clearing the cache (`webSocketSyncManager.syncShapes()`), a side effect added mid-fix-history. The repo convention — also enforced by edits like `libraryManager.ts:139-140` and `shapeEdit.ts:100-102` — is that the mutation site owns its invalidation: the render cache is rebuilt from shape state exactly when the shape state changes.

A codebase-wide sweep for the same gap found no other instance: every remaining geometry-mutating action either carries the explicit pair or routes through `syncShapes()`.

### Root Cause

The nudge branch was the only direct shape-mutating action that relied on `syncShapes()`' implicit side effects instead of declaring them at the mutation site.

### Resolution

```ts
ctx.undoManager.push(prev, ctx.existingShapes);
api.invalidateCache();
api.clearCanvas();
api.syncShapes();
```

The calls are harmless when redundant and guarantee the branch stays correct even if `syncShapes()`' internals change.

### Outcome

The nudge branch now matches the repo's explicit-invalidation convention. `tsc --noEmit` and `next lint` clean.

**Commits:** `397b54a`

---

## Incident 6: Shapes Duplicate into Ghost Trails (Multiplayer)

**Discovered:** Aug 18, 2026  
**Severity:** High — phantom duplicates visible to all clients  
**Status:** Resolved (fix verified statically; no live multiplayer repro performed)

### Discovery

Under message loss or reconnection, a shape could appear twice on the canvas — a "ghost trail" that re-rendered and could not be selected or edited coherently. Duplicates of the same id break every component that assumes id uniqueness: `findIndex`-based updates, selection, and undo/redo diffs (`undoManager.computeDiff`).

### Investigation

The shape-diff **"modified"** branch in `managers/webSocketSyncManager.ts` inserted a shape when its id was not found locally:

```ts
const idx = this.context.existingShapes.findIndex((s) => s.id === shape.id);
if (idx !== -1) {
    this.context.existingShapes[idx] = shape;
} else {
    this.context.existingShapes.push(shape);  // ← re-creates a phantom
}
```

`RoomCanvas.tsx` reconnects with exponential backoff, but the server only relays diffs to *other* members between reconnects — there is no per-connection catch-up queue. So when an "added" message was lost or reordered, a later "modified" for the same id inserted the shape client-side; when the true "added" eventually arrived (e.g. a refreshed state pull), two shapes shared one id.

### Root Cause

Treating "update for unknown id" as "insert" makes a sync protocol non-idempotent: lost/reordered messages become duplicates instead of dropping harmlessly.

### Resolution

Unmatched "modified" entries are now dropped — an update for a shape this client never saw is noise, not a creation event:

```ts
const idx = this.context.existingShapes.findIndex((s) => s.id === shape.id);
if (idx === -1) continue;   // unknown id → drop, never insert
this.context.existingShapes[idx] = shape;
```

Plus a defensive id-dedupe pass after applying the incoming diff (keep the first occurrence) so a duplicate id can never reach the renderer, regardless of what the server sends. This also keeps Bug 4's discarded strays from being resurrected by late "modified" messages.

### Outcome

Ghost duplicates can no longer be created by reordered or lost messages. The dedupe guards all future diff paths.

**Commits:** `df3d22c`

---

## Incident 7: Properties Panel Disappears Until Remount

**Discovered:** Aug 18, 2026  
**Severity:** Medium — inspector can become unreachable mid-session  
**Status:** Resolved

### Discovery

During a UI-behavior audit of the inspector, the properties panel could be dismissed with its close button and would then stay hidden even after selecting a shape. Because the panel is remounted under a different `key` only when the panel type changes, the stale hidden state could persist for the rest of the session — the panel was effectively unreachable without reloading.

### Investigation

`Canvas.tsx:309` already gated the panel correctly:

```ts
const showPropertiesPanel = selectedShapes.length > 0 || toolHasProperties(selectedTool);
```

…but the panel itself kept a second, independent source of truth:

```ts
const [hidden, setHidden] = useState(false);
if (hidden) return null;      // ← panel can refuse to render on its own
```

The close button set `hidden`, and `PopoverPanel`'s `onClose` only handled its own dismissal — nothing reset the flag when the selection changed. The parent gate was correct; the local flag defeated it.

### Root Cause

An inspector whose visibility is driven by selection state must not own visibility state. Two sources of truth (parent gate + local `hidden` flag) let the panel detach from the selection context, and a stale flag produced unreachable UI.

### Resolution

Visibility is now a pure reflection of selection/tool state — the local state, close button, and `onClose` wiring were removed from the panel, and `PopoverPanel.onClose` became optional:

- `PropertiesPanel.tsx` — no `useState`, no close button; renders exactly when the parent gates it
- `PopoverPanel.tsx` — `onClose` optional; listener effect no-ops when absent
- `shapeLifecycle.ts` `commitShape` — on the auto-switch-to-select draw path, the new shape is selected immediately, so the panel updates to the just-drawn shape instead of flashing the old selection

### Outcome

The panel appears and disappears exactly with `selectedShapes.length > 0 || toolHasProperties(tool)`; it can never be dismissed into an unreachable state. Undo/redo already clear `selectedIds`, so no stale-selection path remains. `tsc --noEmit` and `next lint` clean.

**Commits:** `e4f95e7`

---

## Lessons Learned

1. **Share canvas setup code.** `HeroBoard.tsx` had the correct DPR pattern. Drawing engines should extract canvas-sizing logic into a shared utility so marketing and production code cannot drift.

2. **Separate logical and physical dimensions early.** Coupling coordinate math to `canvas.width` creates a hidden dependency that prevents DPR fixes. A canvas engine should own its logical size from day one.

3. **Add fields to the full union type.** When extending a shared discriminated union, all members must declare the new property, even if it is unused, or narrowing by `type` will not expose it.

4. **Verify cache canvas transforms.** Any context that receives `setTransform(dpr, ...)` must have all its sizing/clearing calls use logical coordinates, or you get subtle ghosting that only appears after resize.

5. **Double-click is a canvas gesture, not a tool behavior.** Gating shape editing on the active tool creates silent dead ends per-tool and hides the fact that a double-click's first click already committed a shape. Where tools commit on click-up, record commit provenance (id, point, timestamp) so the gesture's second half can discard the first half's stray.

6. **Cache invalidation belongs at the mutation site.** Relying on `syncShapes()`' implicit invalidation couples rendering correctness to a sync manager's internals. Declare the `invalidateCache()` / `clearCanvas()` pair wherever shape state changes, and sweep for peers missing the pair.

7. **Sync applications must be idempotent.** "Update unknown id → insert" turns lost or reordered messages into duplicate shapes. Unknown-id updates are noise — drop them — and dedupe defensively at the client boundary so one protocol slip can never reach the renderer.

8. **Inspectors must not own visibility state.** A panel whose visibility is driven by selection state needs exactly one source of truth — the parent's gate. A second, local `hidden` flag can detach the panel from the selection context and produce unreachable UI. Dismissal is a popover concept, not an inspector concept.
