# CoDraw Build Plan

A phased rebuild plan produced from an audit of the current engine (see
[architecture.md](./architecture.md) for the full current-state + target
analysis). Work is sequenced so that each phase lands on top of correct
foundations: geometry before interaction, interaction before UI.

## Sequencing

```text
Phase 1   Audit + architecture documentation            ✅ done
          ↓
Phase 2   Unified shape geometry / bounds / transforms   ✅ done
          ↓
Phase 3   Selection + resize + rotate + hit testing      ✅ done
          ↓
Phase 4   Text architecture                              ✅ done
          ↓
Phase 5   UI / editor-system revamp                      ← next
          ↓
Phase 6   Performance + collaboration hardening
```

Do **not** start the UI revamp (Phase 5) before Phases 2–3 are stable:
the UI would otherwise present an interaction model that is still
internally broken.

---

## Phase 1 — Audit + architecture documentation (done)

- Read-through audit of the engine, managers, backends, shape package,
  and app wiring.
- Findings catalogued in [architecture.md](./architecture.md) — including
  the confirmed-broken behaviors listed below, which seed later phases.
- Confirmed headline problem: CoDraw has a shared `Shape` abstraction at
  the manager level but **no unified geometry/transform abstraction
  underneath it**. Operations are dispatched by `switch (shape.type)` at
  every call site (`moveShape`, resize, `hitTest`, `flipShape`,
  `shapesEqual`, `offsetShapeCopy`, bounds), which is the root of the
  per-type drift bugs.

---

## Phase 2 — Unified shape geometry / bounds / transforms

**Goal:** nothing about geometry or transforms is dispatched by type
outside `@repo/shapes`. The package exposes one canonical contract and a
selection-level transform primitive.

### Scope

1. **`packages/shapes/transform.ts` (new)**
   - `translateShape(shape, dx, dy)` — uniform move.
   - `resizeShape(shape, from: Bounds, to: Bounds)` — bounds-mapped
     resize. Works for single-shape handle drags and multi-select alike
     (each shape maps its own `from` bounds through the same affine).
   - `rotateShape(shape, deltaAngle)` / `rotateShapeAround(shape, cx, cy, deltaAngle)`.
   - `flipShape(shape, horizontal)` — geometry mirror + `rotation`
     negation. Circle/diamond/ellipsisArc are symmetric: geometry
     unchanged, rotation negated.
   - `offsetShapeCopy(shape, dx, dy)` — clone + offset (paste/duplicate).
   - All functions normalize negative dimensions (box shapes stored as
     min-corner + abs size); renderer normalization stays but becomes
     redundant.
2. **`packages/shapes/utils.ts`** — `getShapeBounds` / `getShapeCenter`
   delegate to the per-type `getXBounds` helpers already defined in each
   shape module, eliminating the duplicated `getUnrotatedBounds` switch
   as a drift source.
3. **Frontend adoption** — `inputHandler.ts` loses its local
   `moveShape` / `offsetShapeCopy`; import from `@repo/shapes`.
   Consumers (`shapeArrangement`, `shapeLifecycle`, `shortcutRegistry`,
   `pointerInteractionManager`, `clipboardManager`) updated once.

### Acceptance

- No `switch (shape.type)` for geometry/transform outside the shapes
  package.
- No `(shape as any).x/.y/.width/.height` writes remain **anywhere** in
  the frontend (Phase 3 removes the resize-path offender; Phase 2 makes
  the write path possible to do typed).
- `tsc --noEmit` green for `@repo/shapes` and `apps/frontend`.

---

## Phase 3 — Selection + resize + rotate + hit testing ✅ done

**Goal:** a selection is a transformable entity, not
`[...selectedIds][0]`.

**Delivered:** handle resize via `resizeShape`/`resizeSelection`
(single-shape resize in the shape's local frame; multi-select resize
through the shared selection affine; anchor-fixed corner/edge math with
Shift-aspect on corners); rotation via `rotateSelection` around the
selection center; Escape state machine (`handleEscape`, bound as
`edit:escape`, plus crop-mode cancel); flip via `flipSelection`
(rotation-aware, text-alignment swap); duplicate/paste copy bound text;
remote diffs prune stale selection ids instead of clearing; multi-select
renders one selection box with shared handles. All shape types resize
correctly — circle stays circular, diamond/ellipsisArc keep center
anchoring.

### Core concept

```text
Element transform        transform ONE shape
Selection transform      transform MANY shapes around a shared
                         selection coordinate system
```

`resizeSelection(shapes, fromBounds, toBounds)` computes each member
shape's own from-bounds and maps all of them through the shared affine
(from Phase 2). `rotateSelection(shapes, center, delta)` and
`flipSelection` follow the same pattern.

### Scope (bug list this phase fixes)

1. **Circle / diamond / ellipsisArc resize is broken at the model
   level** — `pointerInteractionManager.ts:519-539` writes
   `(shape as any).x/.y/.width/.height` onto shapes that store
   `centerX/centerY/radius` (circle) or `centerX/centerY + w/h`;
   phantom props mean circle resize does nothing and diamond/arc
   reposition is lost. Replaced by `resizeShape`.
2. **Multi-select resize/rotate touches only the first selected
   shape** (`pointerInteractionManager.ts:519, 548`) — replaced by
   selection transforms.
3. **Shift-aspect-ratio resize mis-anchors corner handles**
   (`pointerInteractionManager.ts:493-506`) — `to` bounds are computed
   from the fixed opposite corner; the anchor never moves.
4. **Rotated shapes resize via unrotated AABB → distortion.** Resize
   must map the rotated geometry: either transform the unrotated
   geometry then recompute rotation, or accept bounds-proportional
   scaling as documented behavior with correct visual math.
5. **Escape/cancel interaction** — `escapePressed` is never set true
   anywhere; the registry has no Escape shortcut (dead branch at
   `pointerInteractionManager.ts:216-225`). Escape becomes part of the
   interaction state machine:

   ```text
   idle → pointerDown → dragging/resizing/rotating/creating/editing
        → Escape → cancel current transient operation
        → restore pre-operation state (dragStartShapes snapshot)
   ```

   Plus: Escape deselects when idle, closes the text overlay.

6. **Handle hit-testing incl. rotation lever** moved onto the selection
   bounds (rotation lever exists only for single selection today —
   chooses to keep that restriction or extend per Excalidraw parity).
7. **Flip ignores circle/diamond/ellipsisArc/rotation**
   (`shapeStyle.ts:24-66`) — uses Phase 2 `flipShape`.
8. **Duplicate/paste preserves `boundTextId` without copying the bound
   text** (`shapeLifecycle.ts:139-159`) — copies must duplicate bound
   text shapes (or clear the binding).
9. **Selection cleared on any remote shape-diff**
   (`webSocketSyncManager.ts:83`) — decisions: keep selection, drop
   stale ids only; remote user's selection stays independent.

### Acceptance

- Resize/rotate/flip work for every shape type and for multi-select.
- Shift-drag keeps aspect ratio with a fixed anchor.
- Circle stays a circle under corner drags.
- Escape cancels any transient operation and restores pre-drag state.
- Hit-testing a rotated shape is correct in the shape's local space
  (already true for `hitTest` via `rotatePointAround` — regression-guard
  it).

---

## Phase 4 — Text architecture ✅ done

**Goal:** replace the DOM textarea overlay with a text-editing system
that understands zoom, bounds, and bound-text.

**Delivered:** zoom-aware textarea (`1/zoom` font scaling, zoom-scaled
min size, auto-grow while typing, and `syncTextOverlayPosition()` hooked
into every viewport mutation path — wheel, space-pan, pinch, navigation
zoom ops, shortcut zoom) so the caret/box tracks the shape at any zoom,
including while pan/zoom happens mid-edit. Bound text now lives in
container space: `updateBoundText` inherits the container's rotation and
flip triggers re-anchor + rotation inheritance. Text measurement is
cached per (text, fontSize, family, bold, italic) in
`@repo/shapes/textMeasurement.ts` (cap 5000, wholesale clear). Arrow
labels and frame names use inline editors instead of `prompt()` via a
new `onCommit` textarea callback (blur/Enter commit, Escape cancels,
empty clears). Ctrl/Cmd+B/I toggle bold/italic inside the editor
(preventDefault'd; the registry filter already skips global shortcuts
while the overlay is open).

### Core concept

```text
Text overlay in screen space, scaled by 1/zoom
Bound text in container space, inheriting transform
Measure once per (text, font config), cache it
```

The textarea stays a plain DOM textarea but is positioned via
`viewport.getScreenCoords` and styled via `syncTextOverlay` with
`font-size × zoom`; pan/zoom handlers call
`textManager.syncTextOverlayPosition()` which re-derives screen coords
from the stored world anchor.

### Scope (bug list this phase fixes)

1. **Zoom-aware editing** — textarea is positioned in screen space and
   font-scaled by `1/zoom` (today: `inputHandler.ts:93-112` positions the
   textarea at unscaled font size; at high zoom the caret/box doesn't
   track the shape).
2. **First-class bound-text** — today `boundTextId` is a string on the
   container and `updateBoundText` (textManager.ts:101-122) repositions
   x/y only; rotation is not propagated, container resize math is only
   "recenter". Text should live in container space and inherit
   transform (Excalidraw container-text model).
3. **Measure once** — text measurement is recomputed in
   `getTextBounds`, renderer, and hit-test each frame; cache per
   (text, fontSize, family, bold, italic).
4. **Remove `prompt()`** — arrow labels and frame names
   (`shapeEdit.ts:40, 90`) get inline editors.
5. **Multi-line + selection styling keyboard handling** — Bold/italic
   apply to the selection inside the editor, not as editor-global
   toggles.

### Acceptance

- Text editing at any zoom keeps caret and box aligned with the shape.
- Bound text inherits container transforms (move, resize, rotate,
  flip).
- Ctrl/Cmd+B/I reroute to the text editor when open; the registry
  filter (`keyboardManager.ts:16`) already skips shortcuts while the
  overlay is open — extends to the new editor.

### Delivered deviations (documented)

- Scope item 5: a plain `<textarea>` cannot style a selection, so
  Ctrl/Cmd+B/I toggle **editor-global** bold/italic (committed to the
  shape on finish). Selection-scoped rich styling is deferred to the
  Phase 5 editor-system revamp (or a contenteditable/Lexical editor).
- Rotated + left/right-aligned bound text rotates around its own
  measured center, which sits slightly off the container's rotation
  center; center-aligned text (the creation default) tracks exactly.

---

## Phase 5 — UI / editor-system revamp

**Goal:** the product UI sits on top of the corrected model:

```text
                CoDraw Product UI
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
     Toolbar       Inspector       Canvas
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                Editor State
                       ↓
             Selection / Interaction
                       ↓
             Shape Transform System
                       ↓
               Shape Geometry
                       ↓
                  Rendering
```

Flags from the earlier UI brief (kept here as pointers):

- Toolbar/Inspector/StatusBar shell refinement, cohesive visual
  language, motion consistency, density balance, multi-select inspector
  (apply styles to N shapes), keyboard-first usage, live tooltips,
  Excalidraw-parity affordances.
- Do **not** restyle panels whose underlying interaction model is
  still broken (e.g. properties that only show the first selected
  shape's style).

### Acceptance

- UI behavior matches the interaction model shipped in Phases 2–3.
- All tool/shortcut affordances documented in `ShortcutsPanel` match
  actual behavior (audit gap: `misc:background` (B) conflicts with the
  `tool:rect` (R) convention; Tab is always `preventDefault()`'d —
  regression-check accessibility).

---

## Phase 6 — Performance + collaboration hardening

### Performance

1. **Pan/zoom must not rebuild the shape scene** — wheel/pan handlers
   call `invalidateCache()` (`mouseManager.ts:116-117, 142-143`), forcing
   a full rough.js scene rebuild every tick. Split layers: background →
   grid → shapes → overlays; pan/zoom re-blit, not re-render.
2. **Spatial index for hit-testing** — `hitTest` is O(n) per pointer
   event (`renderer.ts:406`); grid-index shapes (or screen-space culling)
   for large canvases.
3. **Stop `structuredClone` on every sync** — `lastSyncedShapes` clones
   the full array on each `syncShapes()`; diff against a cheap dirty-set
   instead.
4. **Undo memory** — pushes per arrow-key nudge; coalesce key-repeat
   nudges into one step.

### Collaboration

1. **Presence** — peers list + join/leave events; guests get stable
   identities; cursor colors allocated server-side or persisted per
   user.
2. **Shape-diff validation + rate limits** — ws-backend relays
   `shape-diff` with zero payload validation; add per-room per-connection
   message limits and shape schema checks (reject shapes that are not
   valid `Shape` unions).
3. **Scalable broadcast** — in-memory `clients` set with O(all)
   scan per message (`ws-backend/index.ts:291-296`); move to Bun
   pub/sub (`server.publish/subscribe`) so multiple instances join the
   same room.
4. **Concurrent editing of the same shape** — live diff apply is
   last-writer-wins with no merge (only autosave merges via 409);
   adopt a per-shape version/author field or CRDT-lite convergence for
   non-server instances.
5. **Snapshot overwrite semantics** — HTTP snapshot save does **not**
   verify `room.adminId` despite "admin only" docs
   (`room.ts:177-196`); either enforce it or document editors-can-save
   and make 409 merging the primary path.
6. **6. Large-image autosave failure** — 512 KB DB row cap returns 413
   and auto-save retries forever (`autoSaveManager.ts:104-108`); store
   images in object storage and keep data URLs out of snapshot rows.
7. **Trash** — unbounded in-memory, not persisted, no trash change
   notification on undo (`historyManager.ts:37-46`); cap, persist, and
   notify symmetrically.

---

## Definition of done (repo-level)

- `pnpm/bun turbo build` green across packages + apps.
- No new `switch (shape.type)` outside `@repo/shapes`.
- No `(shape as any)` geometry writes in the frontend.
- Each phase lands with its acceptance criteria met and the docs
  updated (`architecture.md` transition records).
