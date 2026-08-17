# CoDraw Architecture

CoDraw is an Excalidraw-style collaborative whiteboard: a React front-end
rendering onto an HTML canvas, a Bun WebSocket relay for live sync, and a
Bun HTTP server that owns durable snapshot data.

- Repo layout & how things are wired (current, as-built)
- The target architecture and why
- Transition records — decisions made while closing the gap
- Phasing: see [build-plan.md](./build-plan.md)

---

## 1. Current as-built layout (audit snapshot)

```text
codraw/
├── apps/
│   ├── ws-backend/          Bun WebSocket relay (rooms, cursor, shape-diff)
│   ├── http-backend/        Bun HTTP + SQLite (rooms, snapshots, auth-less admin)
│   └── frontend/            Next.js + React canvas app
│       ├── src/app/         App shell, toolbar, inspector, panels, canvases
│       └── src/hooks/       Editor hook stack:
│           ├── drawManagers/        mouse, keyboard, toolbar, text-input
│           └── engine/              (reduced surface; see history below)
├── packages/
│   └── shapes/              @repo/shapes — geometry, per-type bounds/hit-test
└── docs/
    ├── architecture.md      (this file)
    └── build-plan.md        phased rebuild plan
```

### Data flow

```text
Pointer/Keyboard/Toolbar events
        │
        ▼
Interaction Managers  (draw/pointer, selection, resize, rotate, arrange,
 │                      shape lifecycle, text, clipboard, history/undo)
 │  mutate shape objects  (breach: geometry written ad hoc, (shape as any))
 ▼
EditorState (id → Shape map, selectedIds, transient state)
        │
        ├──► Renderer (rough.js scene, per-frame with cache)
        ├──► autosaveHistory → HTTP snapshot (POST, 409-merge on conflict)
        └──► SocketClient → ws-backend relay → other clients → local sync
```

### Where geometry lives today

| Concern                                                                | Location                                                                                                    | Notes                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Shape model + types                                                    | `packages/shapes/types.ts`                                                                                  | `Shape` union; `rotation` optional, 0-default when absent |
| Per-type bounds                                                        | `packages/shapes/{rect,circle,diamond,ellipsisArc,arrow,line,pencil,text,image,eraser,stickyNote,frame}.ts` | also getCenter / hitTest per type                         |
| Cross-type "unrotated bounds"                                          | `packages/shapes/utils.ts`                                                                                  | second switch — a drift source vs per-type getters        |
| Keep-in-bounds                                                         | `packages/shapes/utils.ts` `keepShapeInsideBounds`                                                          | suffices for Phase 2 target                               |
| Point transforms (rotatePointAround, distToSegment, scalePointsRatios) | `packages/shapes/arrow.ts`, `pencil.ts`, `utils.ts`                                                         | primitives only — no selection-level ops                  |
| Shape _writes_ (move/resize/flip…)                                     | frontend: `inputHandler.ts`, `shapeStyle.ts`, managers                                                      | dispatched by type at every call site                     |

### The core structural problem

There is a shared `Shape` abstraction at the manager level but **no
unified geometry/transform abstraction underneath it**. Every operation
is a `switch (shape.type)` in the caller, and the switch bodies drift:

- Circle/diamond/ellipsisArc are **center-anchored** (`centerX/centerY`),
  box shapes are **corner-anchored** (`x/y`), point shapes (arrow/line/
  pencil/eraser) store **points[]**, text stores **x/y** with different
  bounds semantic (see per-type notes).
- Callers assume corner-anchored fields: resize writes
  `(shape as any).x/.y/.width/.height` on **every** type
  (`pointerInteractionManager.ts:519-539`) — phantom props on circle
  (which stores `radius`), center shifts lost on diamond/ellipsisArc.
- Flip (`shapeStyle.ts:24-66`) also writes corner fields and ignores
  rotation (flipping a rotated shape is a no-op visually: it mirrors
  geometry and re-rotates at render).
- Bounds are recomputed independently in ~6 places with different
  formulas (utils unrotated-bounds switch vs per-type getters, renderer,
  hit-test, textManager, ws sync bounds for snapshot serialization).

### Confirmed broken behaviors (seed list for the build plan)

1. Circle/diamond/ellipsisArc resize is broken at the model level
   (phantom props write).
2. Multi-select resize/rotate only touches the first selected shape.
3. Shift-aspect-ratio resize mis-anchors corner handles
   (`pointerInteractionManager.ts:493-506`).
4. Rotated shapes resize via unrotated AABB → distortion.
5. Escape "cancel interaction" is dead: `escapePressed` never set,
   no Escape shortcut (`pointerInteractionManager.ts:216-225`).
6. Hit-testing is O(n) per pointer event (`renderer.ts:406`); no index.
7. Pan/zoom rebuilds the entire rough.js scene on every tick
   (`mouseManager.ts:116-117, 142-143`).
8. Duplicate/paste preserves `boundTextId` without copying bound text
   (`shapeLifecycle.ts:139-159`).
9. Text editing is a DOM textarea overlay scaled by `1/zoom` font-size
   without zoom-aware positioning (`inputHandler.ts:93-112`); bound text
   repositions x/y only, no rotation propagation (`textManager.ts:101-122`).
10. Client 413 on oversized snapshot rows → autosave retries forever
    (`autoSaveManager.ts:104-108`); image data stays in rows (512 KB cap).
11. Remote shape-diff clears the local selection
    (`webSocketSyncManager.ts:83`).
12. ws-backend broadcasts with zero payload validation / structure
    checks; in-memory `clients` set O(all) per message.
13. HTTP snapshot save ignores `room.adminId` despite "admin only" docs
    (`room.ts:177-196`) — only autosave 409-merge does.
14. Clipboard import (`webSocketSyncManager.ts:oursClipboard`) constructs
    a partial shape shape for rects without `strokeColor`, etc.

---

## 2. Target architecture

Single responsibility per layer, today and with the new product UI:

```text
                 CoDraw Product UI
                        │
         ┌──────────────┼──────────────┐
         ↓              ↓              ↓
      Toolbar       Inspector       Canvas
         │              │              │
         └──────────────┼──────────────┘
                        ↓
                 Editor State            (source of truth: id → Shape)
                        ↓
              Selection / Interaction     (selection = transformable set)
                        ↓
              Shape Transform System      (moves/resizes/rotates/flips;
                                          single shape AND selection)
                        ↓
                Shape Geometry            (@repo/shapes: per-type model +
                                          bounds + hit-test, single owner)
                        ↓
                   Rendering               (layered: bg/grid/shapes/overlay)
```

Key rules:

1. **Geometry is owned by `@repo/shapes`.** No `switch (shape.type)`
   outside the package; no `(shape as any)` writes anywhere in frontend
   code. Per-type modules own their model + bounds + hit-test + clip;
   `utils.ts` composes (contains/render bounds), `transform.ts` applies
   operations typed on the `Shape` union.
2. **Selection transforms, not single-shape special cases.** A resize/
   rotate/flip is computed once per selection against a shared selection
   coordinate system; each member maps its own bounds through the same
   affine (see build-plan Phase 3 for exact semantics).
3. **Rendering layers.** Background/grid → shapes → overlay (selection,
   handles, cursor) so pan/zoom re-blits the shape layer instead of
   rebuilding the rough.js scene.
4. **Interactions are a state machine.** idle → pointerDown →
   dragging/resizing/rotating/creating/editing → Escape cancels the
   current transient op (restores pre-op snapshot).
5. **Sync keeps local state consistent.** Remote diffs merge into state,
   never clear/stale local selection; ws relay validates payloads; rooms
   scale via pub/sub.
6. **Text is a first-class citizen.** Editable in container space,
   inherits transforms, measured once, cacheable.

---

## 3. Transition records

### 3.1 — Reconciling the per-shape-type storage models (Phase 2)

**Before:** callers wrote `(shape as any).x/.y/.width/.height` for every
type on move/resize/flip. Center-anchored shapes (circle, diamond,
ellipsisArc) silently ignored these writes (phantom props), point shapes
were never resized by handle drags at all.

**Decision:** normalize to a bounds-first contract:

- Shape = geometry (per type) + style + `rotation` + `boundTextId`.
- All shapes expose a **bounding rectangle** (`Bounds = x/y/w/h`) from
  which every transform is computed; per-type modules stay the single
  owners of their own internal fields (points[], radius, …).
- `transform.ts` writes type-correct fields: box shapes get
  `x/y/w/h`, center shapes get `centerX/centerY` (+`radius` for circle,
  `width/height` for diamond/ellipsisArc), point shapes get
  `points[]`-mapped; normalization (abs of negatives) lives once in the
  package.

**Result:** single source for getShapeBounds/getShapeCenter (delegates
to per-type getters — kills the utils/per-type drift); transform
functions type-safe from day 1; frontend `inputHandler` imports
`translateShape`/`offsetShapeCopy` from the package; the interaction
layer (resize/rotate/flip, selection) consumes the same functions since
Phase 3.

### 3.2 — Bounds semantics (Phase 2)

- `getShapeBounds` returns the **rotation-aware** AABB (what selection
  boxes/handles are drawn on and hit-tested against);
  `getLocalBounds` returns the **unrotated** geometry frame that
  transforms operate in. Resize/rotate/flip act in the local frame;
  rendered selection and hit-testing use the AABB.
- Text bounds are wrap-height-sensitive at the moment; a measurement
  cache is Phase 4.

### 3.3 — Rendering pipeline (planned, Phase 6)

Rough.js scene rebuilt per frame when cache invalidated. Pan/zoom must
invalidate only the shape layer; overlay and grid stay independent.
(Transition decided, not yet implemented.)

### 3.4 — Text editing (Phase 4)

DOM textarea overlay stays (it is the editor for now), with two fixes:

- **Zoom-aware surface:** the overlay is positioned via
  `viewport.getScreenCoords` and font/min-size scaled by `1/zoom`
  (`syncTextOverlay`); `textManager.syncTextOverlayPosition()` re-syncs
  the overlay from its stored world anchor on every viewport change
  (wheel, space-pan, pinch, zoom commands/shortcuts), so the caret/box
  tracks the shape even mid-edit.
- **Container-space bound text:** `updateBoundText` inherits the
  container's rotation and flip re-anchors + re-inherits, so labels
  stay with the box at any orientation.
- **Inline label/name editors:** arrow labels and frame names edit
  through the same textarea via an `onCommit` callback instead of
  `prompt()`.

### 3.5 — Selection ownership (Phase 3)

Selection now owns its transform ops end-to-end:

- Single-shape handle resize runs in the shape's **local frame** (pointer
  mapped by `-rotation` around the shape center; anchor fixed on the
  opposite corner/edge; Shift keeps aspect on corner handles) and is
  applied via `resizeShape`.
- Multi-select shows one selection bounding box (renderer
  `drawSelection`) and resizes via `resizeSelection` (each member's
  bounds mapped through the shared affine). Multi-select members with
  existing rotation are approximated by AABB-proportional scaling
  (documented).
- Rotation via `rotateSelection` around the selection center; the lever
  remains single-selection-only, hit-tested at its drawn position (was
  erroneously hit-tested near the shape center).
- Escape is `PointerInteractionManager.handleEscape()`, bound as an
  `edit:escape` shortcut: mid-drag/resize/rotate restores the
  pre-operation snapshot (no undo entry), cancels drag-select, discards
  in-progress shape/polyline drawing, otherwise deselects. Crop mode also
  cancels on Escape.
- Flip uses `flipSelection`/`flipShape` (mirrors bounds around the
  selection center, negates rotation, swaps text alignment; symmetric
  shapes only negate rotation).
- Duplicate/paste copy bound text shapes together with their container
  so `boundTextId` never dangles.
- Remote `shape-diff`/shape-add prune stale selection ids instead of
  clearing the selection (full-state still clears wholesale).
- Inspector still reads the first selected shape's style; union-of-
  selection styles is a Phase 5 item.

### 3.6 — Text measurement (Phase 4)

Text measurement was recomputed per frame in `getTextBounds`, the
renderer, and hit-testing. It is now cached in
`@repo/shapes/textMeasurement.ts` keyed by
`(fontSize, fontFamily, bold, italic, text)` — a 5000-entry cap with
wholesale clear. Cache correctness relies on the offscreen canvas font
being set identically to the render path (same string shape); the cache
lives in the package so every consumer shares it.

### 3.7 — Bold/italic keyboard handling (Phase 4, deviation)

The plan wanted selection-scoped bold/italic inside the text editor;
a plain `<textarea>` cannot style a selection. Delivered: Ctrl/Cmd+B/I
toggle **editor-global** bold/italic while editing (preventDefault'd on
the textarea keydown, committed to the shape on finish). Selection-
scoped rich text is deferred to the Phase 5 editor revamp.

---

## 4. Performance & isolation notes (current)

- Renderer caches rough.js scene; invalidation on state/pan change.
- Web workers offload heavy work (pointer interactions, ws sync).
- `structuredClone` of full `lastSyncedShapes` per sync — cheap synonym
  for coalescing introduced in Phase 6 by diffing a dirty set.
- HTML canvas rendering path (not SVG); CSS `transform` overlay for
  selection; text overlay at font-size = 1/zoom.
