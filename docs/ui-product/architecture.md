# CoDraw Editor UI & Interaction Architecture

This document records the actual CoDraw editor system after the UI/editor
revamp. It is not aspirational: every component, state field, and rule
described here exists in the current codebase.

For the phased rebuild plan, see [build-plan.md](./build-plan.md).
For incident history, see [../incidents.md](../incidents.md).

---

## Why This Document Exists

CoDraw's editor is built from many small pieces: a canvas renderer, shape
geometry package, interaction managers, React chrome, and a WebSocket
collaboration layer. Each piece has its own conventions, and without a
shared reference it is easy to reintroduce the same inconsistencies that
the revamp eliminated.

This document exists so that future contributors can answer three questions
without reading hundreds of files:

1. **Where does this state live?** (one source of truth per concept)
2. **How does this interaction work?** (canonical flow, not a special case)
3. **What should I not change?** (established rules and anti-patterns)

---

## Previous System

Before the revamp, CoDraw's UI and editor were assembled from independently
styled controls and ad-hoc state mutations.

### UI before the revamp

- **Top bar** — multiple competing surfaces: toolbar, zoom controls,
  history controls, and a mobile dock each rendered their own floating
  chrome with slightly different border, shadow, and background classes.
- **Toolbar** — tool buttons were styled inline at each call site. Active
  state, hover state, disabled state, tooltip behavior, and keyboard
  shortcut display were each hand-coded per button.
- **Properties panel** — property sections, rows, color swatches, sliders,
  and inputs each had their own spacing and typography. Sections felt like
  a settings dashboard rather than contextual editor chrome.
- **Zoom controls** — rendered as a self-contained popover with its own
  button markup, duplicate hover/active classes, and a separate shortcut
  Kbd implementation.
- **Context menus** — each context menu (canvas, shape, toolbar) rendered
  its own `<button>` rows with duplicated icon/label/hint markup and
  separate hover/active/focus classes.
- **Shared primitives** — no canonical menu row, no shared button family,
  no shared surface grammar. Every panel reinvented the same patterns.

### Editor before the revamp

- **Element model** — `Shape` union had per-type geometry fields, but
  callers mutated shapes through `(shape as any)` writes. Circle, diamond,
  and ellipsisArc stored center-based geometry (`centerX/centerY`), while
  rectangles stored corner-based geometry (`x/y/width/height`).
- **Selection state** — `selectedIds` was a `Set<string>` scattered across
  `GameContext`, with no canonical owner for selection transforms.
- **Bounds** — `getShapeBounds` existed per type, but was recomputed
  independently in 6+ places with different formulas.
- **Hit testing** — O(n) linear scan on every pointer event. No spatial
  index, no screen-space culling.
- **Transformations** — resize, rotate, and flip were dispatched by
  `switch (shape.type)` at every call site. Multi-select resize/rotate
  only touched the first selected shape.
- **Text editing** — DOM textarea overlay with zoom-unaware positioning.
  Bound text repositioned x/y only, with no rotation propagation.
- **Tool state** — `selectedTool` lived on `GameContext` but was mutated
  by toolbar clicks, keyboard shortcuts, and programmatic tool changes
  through different code paths.

### Problems observed

| Area | Problem |
|------|---------|
| Toolbar | Controls had inconsistent dimensions, active states, spacing, and tooltip behavior. |
| Inspector | Felt like a settings dashboard — too visually heavy for contextual editing. |
| Selection | Mixed ownership: `selectedIds` mutated by managers, React components, and keyboard shortcuts. |
| Shapes | Bounds leaked into shape interaction. Resize wrote rectangular fields onto circular/diamond geometry. |
| Text | DOM textarea was a second source of truth for text content. |
| Top bar | Multiple competing surfaces made the canvas lose visual hierarchy. |
| Hit testing | O(n) per pointer event made large canvases sluggish. |
| Cache invalidation | Viewport-only and overlay-only changes triggered full rough.js scene rebuilds. |
| Collaboration | Large images stored as data URLs in snapshot rows caused 413 errors. Trash was in-memory only. |

---

## Design Principles

1. **One source of truth per concept.** State is owned by exactly one
   module. Consumers read it; they do not write it.
2. **Geometry is owned by `@repo/shapes`.** No `switch (shape.type)`
   outside the package. No `(shape as any)` geometry writes in the frontend.
3. **Bounds are not the shape.** Bounds are the selection/transform
   coordinate system. Shape geometry is the actual visual/interactive form.
4. **Selection is a transformable entity.** Single and multi-select share
   the same resize/rotate/flip contract.
5. **Interactions are a state machine.** `idle → pointerDown →
   dragging/resizing/rotating/creating/editing → Escape cancels`.
6. **Rendering is layered.** Background → grid → shapes → overlay (selection,
   handles, cursors). Pan/zoom re-blits; only shape mutations rebuild.
7. **Text is first-class.** Editing surface is screen-space DOM; canonical
   text data lives in canvas coordinates. One measurement cache, one
   commit path.
8. **Sync preserves local intent.** Remote diffs merge into state; they
   never clear local selection. Conflict resolution is explicit.

---

## Geometry vs Bounds

This is the foundational architectural rule.

```text
Element Geometry
       ↓
Actual visual/interactive shape

Element Bounds
       ↓
Axis-aligned geometric bounds

Selection UI
       ↓
Visual representation of current selection

Interaction Geometry
       ↓
Hit testing / resize / transform / editing
```

**Bounds are not the shape.**

- A diamond has diamond geometry and rectangular axis-aligned bounds.
- An ellipse has ellipse geometry and rectangular axis-aligned bounds.
- An arrow has line/path geometry and bounds derived from its endpoints.
- Freehand has point/path geometry and bounds derived from those points.
- Text has text geometry and measured bounds.
- Bound text lives in container space and inherits the container's transform.

Confusing these concepts produces incorrect hit testing and makes the
editor feel as though every object is fundamentally a rectangle.

Excalidraw itself uses rectangular bounds in parts of its selection/transform
system. The important architectural principle is not "remove rectangles,"
but "do not confuse bounds with element geometry."

### Canonical geometry pipeline

```text
                    POINTER
                       │
                       ▼
              ┌─────────────────┐
              │  Hit Testing    │
              │                 │
              │ 1. broad-phase  │
              │    AABB pre-check
              │ 2. spatial grid │
              │    index lookup
              │ 3. shape-aware  │
              │    precise test │
              └────────┬────────┘
                       │
                       ▼
                   SELECTED
                       │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
    Selection Visualization    Transformation
             │                     │
             ▼                     ▼
       bounding rectangle       actual geometry
       + handles                + rotation
       (unchanged)              + scale
```

1. **Broad phase** — `getShapeBounds(shape)` returns the rotation-aware AABB.
   Fast rejection for pointers outside the shape's rotated bounds.
2. **Spatial grid index** — a grid-based spatial index (`renderer.ts`)
   caches cell membership keyed by the shapes array reference + length.
   Only cells overlapping the pointer are probed, reducing O(n) scans.
3. **Shape-aware precise test** — dispatched by type:
   - `rect`, `image`, `stickyNote`, `frame`, `text` — AABB
   - `circle` — center/radius distance
   - `diamond` — `|dx|/(w/2) + |dy|/(h/2) ≤ 1`
   - `ellipsisArc` — ellipse equation `(dx/rx)² + (dy/ry)² ≤ 1`
   - `arrow` — segment distance + arrowhead triangle hit
   - `line` — segment distance (single or polyline)
   - `pencil`, `eraser` — distance to stroke segments
4. **Rotation** — test point is inverse-rotated around the shape center
   before the shape-specific test.

### Selection visualization

The selection UI is intentionally rectangular. It is the selection's
transform coordinate system, not a claim that the shape itself is a
rectangle.

- **Single selection** — dashed rectangle around `getShapeBounds(shape)` +
  8 resize handles + rotation lever 24 units above top-center.
- **Multi-select** — combined bounds box with 8 shared handles, no rotation.
- **Rubber-band drag** — bounds overlap test.

---

## Editor State

The canonical editor state lives in `GameContext` (`draw/gameContext.ts`).
No other module owns these fields.

| State | Owner | Type | Description |
|-------|-------|------|-------------|
| `existingShapes` | `GameContext` | `Shape[]` | Flat array of all shapes on the canvas. |
| `selectedIds` | `GameContext` | `Set<string>` | IDs of currently selected shapes. |
| `selectedTool` | `GameContext` | `Tool \| string` | Active drawing/selection tool. |
| `_previousTool` | `GameContext` | `Tool \| string` | Tool restored when exiting hand mode. |
| `viewport` | `GameContext` | `Viewport` | Pan/zoom state. |
| `currentStyle` | `GameContext` | `ShapeStyle` | Default style for new shapes. |
| `_styleCustomized` | `GameContext` | `boolean` | Whether user has customized style from default. |
| `isDark` | `GameContext` | `boolean` | Active theme. |
| `undoManager` | `GameContext` | `UndoManager` | Diff-based undo/redo stack (capped at 100). |
| `trash` | `GameContext` | `Shape[]` | Deleted shapes pending recovery. Also persisted in snapshots. |
| `lastSyncedShapes` | `GameContext` | `Map<string, Shape>` | Last-synced snapshot for diff computation. Maintained incrementally. |
| `lastSavedVersion` | `GameContext` | `number` | Server version at last successful save. |
| `cropMode` | `GameContext` | `boolean` | Image crop mode active flag. |
| `cropShapeId` | `GameContext` | `string \| null` | ID of shape currently being cropped. |
| `cropRect` | `GameContext` | `{x,y,w,h} \| null` | Current crop rectangle in canvas coords. |
| `cropDragCorner` | `GameContext` | `number \| null` | Corner index being dragged during crop. |
| `cropStartRect` | `GameContext` | `{x,y,w,h} \| null` | Crop rectangle at start of drag. |
| `laserPosition` | `GameContext` | `{x,y} \| null` | Laser pointer position. |
| `laserColor` | `GameContext` | `string` | Laser pointer color. |
| `laserSize` | `GameContext` | `number` | Laser pointer size. |
| `gridSize` | `GameContext` | `number` | Grid spacing in canvas units (default 20). |
| `snapToGrid` | `GameContext` | `boolean` | Whether shapes snap to grid on drag. |
| `snapToObjects` | `GameContext` | `boolean` | Whether shapes snap to other shape edges. |
| `stayAfterDraw` | `GameContext` | `boolean` | Keep tool active after committing a shape. |
| `zenMode` | `GameContext` | `boolean` | Hide chrome for distraction-free drawing. |
| `viewMode` | `GameContext` | `boolean` | Read-only view mode (no selection/edit). |
| `_locked` | `GameContext` | `boolean` | Canvas lock state (no selection/drag). |
| `_handMode` | `GameContext` | `boolean` | Hand (pan) mode active flag. |
| `_background` | `GameContext` | `CanvasBackground` | Canvas background style (dots/grid/blank + color). |
| `_backgroundCustom` | `GameContext` | `boolean` | Whether user has customized background. |
| `alignmentGuides` | `GameContext` | `Array<{x?: number; y?: number}>` | Active alignment guide lines during drag. |
| `cssWidth` | `GameContext` | `number` | Logical canvas width in CSS pixels. |
| `cssHeight` | `GameContext` | `number` | Logical canvas height in CSS pixels. |
| `dpr` | `GameContext` | `number` | Device pixel ratio, capped at 2. |

### Transient interaction state

Transient state (drag, resize, rotate, crop, select) lives in
`PointerInteractionManager` (`draw/managers/pointerInteractionManager.ts`),
not in `GameContext`. It is reset at the start of each pointer gesture
and cleared on Escape.

| State | Location | Description |
|-------|----------|-------------|
| `isDragging` | `PointerInteractionManager` | Shape drag in progress. |
| `isSelecting` | `PointerInteractionManager` | Rubber-band drag-select in progress. |
| `isResizing` | `PointerInteractionManager` | Handle drag resize in progress. |
| `isRotating` | `PointerInteractionManager` | Rotation lever drag in progress. |
| `dragStartShapes` | `PointerInteractionManager` | Snapshot of shapes before current drag op. |
| `resizeStartBounds` | `PointerInteractionManager` | Bounds at start of resize. |
| `resizeHandle` | `PointerInteractionManager` | Handle index being dragged (-1 = none). |
| `resizeShiftKey` | `PointerInteractionManager` | Shift key state at resize start. |
| `rotateStartAngle` | `PointerInteractionManager` | Angle at start of rotation. |
| `startX` / `startY` | `PointerInteractionManager` | Pointer position at gesture start. |
| `clicked` | `PointerInteractionManager` | Whether pointer down was a click (no move). |
| `isPanning` | `PointerInteractionManager` | Space-bar pan in progress. |
| `spacePressed` | `PointerInteractionManager` | Space bar held down. |
| `polylinePoints` | `PointerInteractionManager` | Points accumulated for polyline tool. |
| `isDrawingPolyline` | `PointerInteractionManager` | Polyline tool active flag. |

### Editor state consumers

- **React components** read state through callbacks and context. They do
  not mutate `GameContext` directly.
- **Managers** read and write `GameContext` through the injected API
  interfaces (`GameContext` properties + manager-specific methods).
- **Renderer** reads `existingShapes`, `selectedIds`, `viewport`, and
  `isDark` through `RenderManagerApi`.

---

## Selection System

### Single selection

Clicking a shape selects it. The selection UI is a rectangular bounds box
with 8 resize handles and a rotation lever. The selection detection is
shape-aware (see Geometry vs Bounds).

### Multi-selection

Shift-click adds to `selectedIds`. Rubber-band drag adds all shapes whose
bounds overlap the drag rectangle.

Multi-select renders one combined bounds box with 8 shared handles. No
rotation lever for multi-select.

### Selection transforms

Single-shape handle resize runs in the shape's **local frame** (pointer
mapped by `-rotation` around the shape center; anchor fixed on the opposite
corner/edge; Shift keeps aspect on corner handles) and is applied via
`resizeShape`.

Multi-select resize uses `resizeSelection(shapes, fromBounds, toBounds)`,
which computes each member's own from-bounds and maps all of them through
the shared affine.

Rotation uses `rotateSelection(shapes, center, delta)` around the selection
center.

Flip uses `flipSelection`/`flipShape` (mirrors bounds around the selection
center, negates rotation, swaps text alignment; symmetric shapes only
negate rotation).

### Escape

Escape is bound as `edit:escape`. Behavior:

- Mid-drag/resize/rotate: restore pre-operation snapshot (no undo entry).
- Mid-drag-select: cancel selection.
- Mid shape/polyline drawing: discard in-progress shape.
- Text editing open: close text overlay.
- Idle with selection: clear selection.
- Crop mode: cancel crop.

### Click-away

Clicking on empty canvas space clears selection.

---

## Tool System

### Tool definitions

Tools are defined in `components/canvasTools.tsx` and split into two
arrays: `CORE_TOOLS` (always visible in the toolbar) and `MORE_TOOLS`
(behind a "More" popover). Each tool has:

| Field | Description |
|-------|-------------|
| `id` | Unique tool identifier (e.g. `"select"`, `"rect"`, `"pencil"`). |
| `label` | Human-readable name for tooltips and the shortcuts panel. |
| `icon` | Lucide icon component or inline SVG rendered in the toolbar. |
| `shortcut` | Keyboard shortcut string (e.g. `"V"`, `"R"`, `"P"`). |

`ToolManager.setTool(toolId)` is the single entry point for tool changes.
It updates `context.selectedTool`, fires `toolChangeCallback` so the
toolbar React state stays in sync, resets transient pointer state
(`isDragging`, `isResizing`, etc.), and commits any in-progress shape.

### Toolbar contract

The toolbar renders tools via `MainToolbar.tsx` using the canonical
`IconButton` and `Tooltip` primitives from `components/ui.tsx`. Each tool
button shows an icon, tooltip on hover (label + shortcut), active state
when selected, and disabled state when applicable. Tools that do not
expose properties (`select`, `hand`, `eraser`, `eyedropper`, `laser`,
`image`) hide the contextual properties popover.

New tools must be added to `CORE_TOOLS` or `MORE_TOOLS` in
`components/canvasTools.tsx` with a matching keyboard shortcut in
`shortcutRegistry.ts` routing through `Game.setTool()`.

### Tool groups

Tools are grouped in the toolbar with visual separators:

- Selection tools: Select, Hand
- Drawing tools: Rectangle, Diamond, Ellipse, Line, Arrow, Pencil, Eraser
- Media tools: Text, Image
- Utility: Eyedropper, Laser pointer

---

## Properties System

### Contextual property selection

Properties are selected based on editor state:

```text
Selection
   ↓
Element type
   ↓
Property schema
   ↓
Shared property controls
   ↓
Element update
```

### Common properties

All shapes share:
- Stroke color
- Background color
- Stroke width
- Opacity
- Fill style (solid / hatch / cross-hatch)

### Shape-specific properties

| Shape | Specific properties |
|-------|---------------------|
| Text | Font family, font size, bold, italic, text align |
| Arrow | Arrowhead size, label |
| Frame | Name |
| StickyNote | Note color, text |
| Image | Crop mode |
| Diamond | (none beyond common) |
| Circle | (none beyond common) |

### Adding a new property

1. Add the field to `ShapeStyle` or the shape-specific type in
   `packages/shapes/types.ts`.
2. Add the control to `ShapeStyleSection.tsx` using the shared
   `ColorSwatch`, `Slider`, or `Input` primitives.
3. The control's `onChange` calls `onStyleChange(updates)`, which the
   canvas wrapper routes to `game.updateShapeStyle(updates)`.
4. Undo/redo is automatic: `updateShapeStyle` pushes a diff before
   applying.

---

## Text Architecture

### Text creation

Text is created by the `text` tool or by double-clicking empty canvas.
The shape is committed to `existingShapes` with type `"text"` and the
initial content.

### Editing surface

Text editing uses a plain DOM `<textarea>` positioned in screen space.
The overlay is:

- Positioned via `viewport.getScreenCoords(shape.x, shape.y)`.
- Font-scaled by `1/zoom` so the caret size stays constant.
- Auto-growing while typing.
- Re-synced on every viewport mutation via `textManager.syncTextOverlayPosition()`.
- Arrow labels and frame names use inline editors via `shapeEdit.ts`
  instead of `window.prompt`.

Commit/cancel:
- **Enter** (without Shift): commit.
- **Escape**: cancel.
- **Blur**: commit.

### Canonical text data

The canonical text content lives in the `TextShape.text` field in
`existingShapes`. The DOM textarea is a transient editing surface. There
is exactly one source of truth for text content.

### Bound text

Bound text lives in container space. `updateBoundText` inherits the
container's rotation and flip triggers re-anchor + rotation inheritance.
The container holds `boundTextId`; the text shape is a separate entry in
`existingShapes`. `boundTextId` is declared on all 12 shape interfaces
in `packages/shapes/types.ts` so the discriminated union narrows correctly.

### Measurement

Text measurement is cached in `@repo/shapes/textMeasurement.ts` keyed by
`(text, fontSize, fontFamily, bold, italic)`. Cap: 5000 entries. Cache is
wholesale-cleared on font/style changes.

### Keyboard behavior

Ctrl/Cmd+B/I toggle **editor-global** bold/italic while the text overlay
is open (preventDefault'd on the textarea keydown, committed to the shape
on finish). Selection-scoped rich text is deferred.

---

## Shape Architecture

### Shape hierarchy

```text
Shape
 ├── BoxShape           rect, image, stickyNote, frame
 ├── CenterShape        circle, diamond, ellipsisArc
 ├── LinearElement      arrow, line
 ├── PathElement        pencil, eraser
 └── TextElement        text
```

### Per-shape contract

Every shape type module in `packages/shapes/` exports:

| Export | Description |
|--------|-------------|
| `getShapeBounds(shape)` | Axis-aligned bounding box (rotation-aware). |
| `getShapeCenter(shape)` | Center point for transforms. |
| `hitTestXxx(point, shape)` | Shape-specific point-in-geometry test. |
| `translateShape(shape, dx, dy)` | Move by delta. |
| `resizeShape(shape, from, to)` | Bounds-mapped resize. |
| `rotateShapeAround(shape, cx, cy, angle)` | Rotate around a point. |
| `flipShape(shape, horizontal)` | Mirror geometry + negate rotation. |

### Rendering

All shapes render through `renderShape()` in `draw/renderer.ts`, which
delegates to Rough.js. The renderer does not switch on `shape.type` for
geometry; it only switches for drawing parameters (stroke, fill, roughness).

### Serialization

Shapes are serialized as JSON for WebSocket diff and HTTP snapshot. Image
data URLs are extracted into the `ImageAsset` table so snapshots stay
under the 512KB DB row cap. Trash is persisted alongside shapes in
snapshots.

---

## Visual System

### Surface grammar

| Token | Value | Usage |
|-------|-------|-------|
| `canvas` | `#fafafa` / `#131217` | Background behind the drawing area. |
| `card` / `elevated` | `#ffffff` / `#1d222b` | Floating surfaces (toolbars, panels, popovers). `card` is for page-level surfaces; `elevated` is for floating chrome. |
| `muted` | `#f3f4f6` / `#22262f` | Input backgrounds, inactive surfaces. |
| `border-subtle` | `rgba(0,0,0,0.06)` / `rgba(255,255,255,0.08)` | Panel and surface borders. |
| `primary` | `#2563eb` / `#60a5fa` | Accent color for active states, selection handles, focus rings. |
| `text-secondary` | `#4b5563` / `rgba(255,255,255,0.70)` | Secondary text in panels and menus. |

### Control sizes

| Control | Size | Notes |
|---------|------|-------|
| Toolbar button | 36×36px | Compact, keyboard-first. |
| Panel button | h-7 (28px) | Secondary actions in panels. |
| Slider thumb | 12px diameter | Accent ring, hover scale 110%, active scale 125%. |
| Color swatch | 20×20px | Selected state: ring + scale 105%. |
| Kbd chip | 20×18px | Mono font, text-10 (10px). |
| Input (sm) | px-2 py-1 | Default panel input. |
| Input (md) | px-3 py-2 | Larger forms. |
| Input (lg) | px-3 py-1.5 | Inline editors. |

### Spacing

| Scale | Usage |
|-------|-------|
| `gap-1.5` (6px) | Tight icon+label spacing in buttons. |
| `gap-2.5` (10px) | Menu row icon+label spacing. |
| `px-3` (12px) | Panel horizontal padding. |
| `py-2` (8px) | Menu row vertical padding. |
| `py-1.5` (6px) | Compact button vertical padding. |
| `mb-3` (12px) | Section spacing in panels. |
| `my-1.5` (6px) | Divider spacing. |

### Typography

| Token | Value | Usage |
|-------|-------|-------|
| `text-10` | 0.625rem (10px) | Kbd chips, small labels. |
| `text-11` | 0.6875rem (11px) | Section labels, slider values. |
| `text-sm` | 0.875rem (14px) | Menu rows, panel buttons. |
| `text-xs` | 0.75rem (12px) | Secondary text. |
| `font-mono` | System mono | Kbd chips, code. |

### States

| State | Implementation |
|-------|----------------|
| Hover | `hover:bg-hover dark:hover:bg-hover-dark` |
| Active/pressed | `active:bg-active dark:active:bg-active-dark`, `active:scale-[0.97]` on buttons |
| Focus-visible | `focus-visible:ring-2 focus-visible:ring-primary/40` |
| Disabled | `disabled:opacity-40 disabled:cursor-not-allowed` |
| Selected | `bg-selected dark:bg-selected-dark`, `ring-1 ring-highlight` on swatches |
| Danger | `text-danger dark:text-danger-dark`, `hover:bg-danger/10` |

### Motion

| Token | Value | Usage |
|-------|-------|-------|
| `duration-fast` | 150ms | Buttons, swatches, menus. |
| `ease-spring` | cubic-bezier(0.32, 0.72, 0, 1) | Interactive elements. |
| `ease-skid` | cubic-bezier(0.16, 1, 0.3, 1) | Slider thumb, scrubbery. |
| `motion-reduce:transition-none` | — | Respects `prefers-reduced-motion`. |

---

## UI Primitives

All canonical UI primitives live in `apps/frontend/components/ui.tsx`.
(`packages/ui` only has `Button` and `Card`; the editor does not import
from `@repo/ui`.)

### Surface tokens

```ts
SURFACE   // rounded-xl, border, bg-elevated, shadow-soft
PANEL     // rounded-xl, border, bg-elevated, shadow-float, backdrop-blur
```

Use `SURFACE` for small chrome (toolbars, zoom controls). Use `PANEL` for
larger surfaces (popovers, side panels, menus).

### MenuRow

```tsx
<MenuRow
  icon={Icon}
  onClick={handleClick}
  active={isActive}
  disabled={isDisabled}
  danger={isDanger}
  hint={<Kbd>Ctrl+Z</Kbd>}
  chevron={<ChevronRight />}
  iconClassName="w-4 h-4 text-icon-secondary"
  labelClassName="font-medium"
>
  Label text
</MenuRow>
```

Canonical row for popovers, app menus, and context menus. Covers: icon
slot, label, optional trailing Kbd hint, optional trailing chevron/submenu
indicator, active/selected state, disabled state, danger state.

### Button

```tsx
<Button variant="primary|secondary|ghost|danger" onClick={...} disabled={...}>
  Icon + Label
</Button>
```

Four-variant button family. Primary is the filled accent action. Secondary
is the bordered default. Ghost is transparent until hover. Danger is
destructive.

### Kbd

```tsx
<Kbd>Ctrl+Z</Kbd>
```

Keyboard hint chip for tooltips, menus, and shortcut lists.

### Slider

```tsx
<Slider
  label="Opacity"
  valueText="100%"
  min={0} max={1} step={0.01}
  value={opacity}
  onChange={setOpacity}
/>
```

Compact slider row with accent-colored active track, circular thumb with
accent ring, and value text aligned right.

### SectionLabel

```tsx
<SectionLabel id="stroke-section">Stroke</SectionLabel>
```

Canonical section label for inspectors and panels.

### Divider

```tsx
<Divider />
```

Subtle horizontal divider for separating sections within panels.

### ColorSwatch

```tsx
<ColorSwatch
  color="#ff0000"
  selected={isSelected}
  onClick={() => onColorChange("#ff0000")}
  label="Red"
/>
```

Circular color swatch with selected ring state. Supports `"transparent"`
special value.

### Input

```tsx
<Input
  value={text}
  onChange={setText}
  placeholder="Enter text..."
  size="sm|md|lg"
/>
```

Compact input with three sizes, muted fill, border, focus ring.

### useEscapeToClose

```tsx
useEscapeToClose(onClose, isOpen);
```

Close-on-Escape hook for overlays, dialogs, and panels.

### useFocusTrap

```tsx
useFocusTrap(dialogRef, isActive);
```

Focus trap for true modals. Remembers previously focused element and
wraps Tab within the modal.

---

## Managers

The editor is decomposed into focused manager modules. Each manager owns
a single concern and communicates through the injected `GameContext` and
API interfaces. Managers never cross-import each other.

| Manager | File | Owns |
|---------|------|------|
| `PointerInteractionManager` | `pointerInteractionManager.ts` | Pointer dispatch, gesture state, tool-specific down/move/up |
| `MouseManager` | `mouseManager.ts` | `mousedown`/`mouseup`/`mousemove`/`dblclick`/wheel |
| `TouchManager` | `touchManager.ts` | Pinch-zoom, two-finger pan, double-tap text edit |
| `KeyboardManager` | `keyboardManager.ts` | Shortcut dispatch from `shortcutRegistry.ts` |
| `ToolManager` | `toolManager.ts` | Tool switching, hand mode, canvas lock |
| `NavigationManager` | `navigationManager.ts` | Zoom/pan/fit, minimap, frame slides, shape search |
| `TextManager` | `textManager.ts` | Text editing overlay, sync, bound text |
| `ShapeManager` | `shapeManager.ts` | Shape lifecycle (commit, delete, duplicate) |
| `ShapeArrangement` | `shapeArrangement.ts` | Group/ungroup, z-order, alignment, distribution |
| `ShapeStyle` | `shapeStyle.ts` | Per-shape style mutations |
| `ArrowManager` | `arrowManager.ts` | Arrow label editing, arrowhead size |
| `ImageManager` | `imageManager.ts` | Image insertion, crop mode, IndexedDB preload |
| `ClipboardManager` | `clipboardManager.ts` | Copy/paste, paste listener lifecycle |
| `RenderManager` | `renderManager.ts` | Cache invalidation, dirty-rect, layer rebuild |
| `AutoSaveManager` | `autoSaveManager.ts` | Debounced persistence, 409 merge, backoff |
| `WebSocketSyncManager` | `webSocketSyncManager.ts` | Diff sync, presence, cursor, staleness filter |
| `CursorManager` | `cursorManager.ts` | Local cursor broadcast, coalescing by movement threshold |
| `HistoryManager` | `historyManager.ts` | Undo/redo stack, trash change notification |
| `ExportManager` | `exportManager.ts` | PNG/SVG/JSON export |
| `StyleManager` | `styleManager.ts` | Default style, theme-aware stroke defaults |
| `LaserManager` | `laserManager.ts` | Laser pointer lifecycle |
| `LibraryManager` | `libraryManager.ts` | Shape library CRUD, import/export |
| `MermaidManager` | `mermaidManager.ts` | Mermaid flowchart import |
| `PluginManager` | `pluginManager.ts` | Plugin load/unload, custom tool registry |

---

## Collaboration Architecture

### WebSocket protocol

The WebSocket backend (`apps/ws-backend/index.ts`) uses Bun's native
`ServerWebSocket` with per-room `publish`/`subscribe` topics. Message types:

| Message | Direction | Description |
|---------|-----------|-------------|
| `join_room` | Client→Server | Join a room (validates room exists in DB) |
| `leave_room` | Client→Server | Leave a room |
| `chat` | Client→Server | Send and persist a chat message |
| `shape-diff` | Client→Server | Broadcast shape changes (added/modified/removed + per-shape versions) |
| `cursor` | Client→Server | Broadcast pointer position with server-assigned color |
| `presence` | Server→Client | Join/leave/list notifications |
| `shape-diff-ack` | Server→Client | Authoritative versions for a diff (staleness filter) |
| `re_auth` | Client→Server | Proactive token refresh without dropping socket |

### Guest mode

The WS backend supports token-less guest connections. Anyone with a room
link can join and draw without authentication. Guests get a stable
client-generated `guestId` (validated `[a-zA-Z0-9-]{8,64}`) so their
cursor color and identity survive reconnects within a session. Guests
broadcast live but are not persisted (chat messages require auth).

### Presence and cursors

Server-assigned cursor colors are stable per member while in the room,
derived from a hash of the user ID modulo a 10-color palette. Cursor
broadcasts are coalesced by movement threshold in `CursorManager` to
reduce unnecessary WS messages.

### Rate limits and payload limits

- Per-IP WebSocket upgrade rate limit: 30 connections/min
- Per-room per-connection message rate limit: 150 messages / 10s
- Max shapes per shape-diff array: 2000
- Max WebSocket message size: 1 MB
- Max chat message text: 64 KB

### Auth and sessions

Authentication uses httpOnly cookies for the HTTP path and a 5-minute
WebSocket token (also httpOnly) for the WS upgrade. Server-side sessions
are stored in the Prisma `Session` table with indexes on `userId`,
`token`, and `expiresAt`. The frontend fetches a fresh WS token every
4 minutes via `re_auth` so sessions don't expire mid-session.

---

## Image Handling

### Client-side

Images are inserted via file picker (`ImageManager`) and cached in an
LRU `ImageCache` (`imageCache.ts`) backed by IndexedDB (`codraw-image-cache`).
The cache key is the base64 content (data URL prefix stripped) so identical
images with different MIME types share entries. Max cache size: 50 images.

Image crop mode uses a corner-draggable rectangle overlay rendered by
`renderManager.ts`.

### Server-side

Large images are extracted from snapshot payloads into the `ImageAsset`
table (keyed by UUID) before the snapshot is written to the `Chat` table.
Shapes reference images by asset ID; the actual bytes live in the
`ImageAsset` table. This keeps snapshot rows under the 512KB DB row cap.
On load, the HTTP backend re-hydrates asset IDs back into data URLs before
sending the snapshot to the client.

---

## Performance & Isolation

- **Spatial grid index** — `renderer.ts` maintains a grid-based spatial
  index for hit testing. The index is cached keyed by shapes array
  reference + length and rebuilt only when the shape set changes.
- **Dirty-rect rendering** — only shapes intersecting the changed region
  redraw. Pan/zoom re-blits; only shape mutations rebuild the Rough.js
  scene.
- **Layer caching** — shapes are grouped into layers (background, grid,
  shapes, overlay). Only the active layer redraws during interaction.
- **Cursor coalescing** — `CursorManager` batches cursor broadcasts by
  movement threshold so tiny mouse movements don't flood the WebSocket.
- **Frame highlight caching** — `RenderManager` caches frame highlight
  geometry to avoid redundant shape iteration on every frame.
- **Cache invalidation scoped** — `invalidateCache()` is no longer called
  on viewport-only or overlay-only changes; only actual scene mutations
  trigger a full rebuild.

---

## Chrome Layout

Floating chrome is coordinated by `ChromeSlots` (`chromeSlots.ts`),
which defines named anchor regions (`topCenter`, `topLeft`, `topRight`,
`bottomLeft`, `bottomRight`) so panels don't overlap. The `Canvas.tsx`
component uses a single `activePanel` state machine instead of 7+
independent booleans to track which overlay is open.

---

## Anti-Patterns

Do not reintroduce these patterns:

- **Do not create one-off toolbar button styles.** Use the `IconButton`
  primitive. Inconsistent dimensions and states are the result.
- **Do not create a second selection state.** `selectedIds` in `GameContext`
  is the single source of truth.
- **Do not use rectangular bounds as shape geometry.** Bounds are the
  selection/transform coordinate system. Shape geometry is the actual form.
- **Do not implement shape-specific behavior by duplicating the entire
  selection system.** Use `resizeShape`/`rotateShape`/`flipShape` from
  `@repo/shapes/transform.ts`.
- **Do not make DOM text a second source of truth.** The canonical text
  content lives in `TextShape.text`. The DOM textarea is a transient
  editing surface.
- **Do not create another design-token system.** The surface grammar
  (`SURFACE`, `PANEL`) and Tailwind tokens in `tailwind.config.ts` are
  sufficient.
- **Do not add arbitrary floating panels.** Use the canonical surface
  tokens and the existing `ChromeSlots` layout system.
- **Do not bypass the shared property primitives.** Use `ColorSwatch`,
  `Slider`, `Input`, `SectionLabel` from `components/ui.tsx`.
- **Do not modify collaboration serialization casually.** Image data must
  go through `ImageAsset`. Snapshot rows must stay under 512KB. Trash is
  now persisted in snapshots; don't bypass that path.

---

## How to Extend the System

### Adding a new drawing tool

1. Add the tool ID to the `Tool` type in `packages/shapes/types.ts`.
2. Add tool metadata (`id`, `label`, `icon`, `shortcut`) to
   `CORE_TOOLS` or `MORE_TOOLS` in `components/canvasTools.tsx`.
3. Register the keyboard shortcut in `shortcutRegistry.ts` routing through
   `Game.setTool()`.
4. Add the tool button to `MainToolbar.tsx` (or `MobileToolDock.tsx`)
   using the `IconButton` primitive.
5. Implement the tool's interaction lifecycle in
   `PointerInteractionManager` (pointer down/move/up handlers).

### Adding a new shape

1. Add the shape type to the `Shape` union in `packages/shapes/types.ts`.
2. Create `packages/shapes/xxx.ts` implementing the per-shape contract:
   `getShapeBounds`, `getShapeCenter`, `hitTestXxx`, `translateShape`,
   `resizeShape`, `rotateShapeAround`, `flipShape`.
3. Register the type in `packages/shapes/index.ts`.
4. Add rendering logic in `draw/renderer.ts` `renderShape()`.
5. Add hit-test dispatch in `draw/renderer.ts` `hitTest()`.
6. Add `boundTextId?: string` to the shape interface so the discriminated
   union narrows correctly for bound text.
7. Add property controls in `ShapeStyleSection.tsx` if the shape has
   type-specific properties.
8. Add serialization support in `packages/shapes/validation.ts` if the
   shape has new required fields.

### Adding a new property

1. Add the field to `ShapeStyle` or the shape-specific type in
   `packages/shapes/types.ts`.
2. Add the control to `ShapeStyleSection.tsx` using the shared primitives
   (`ColorSwatch`, `Slider`, `Input`).
3. The control's `onChange` calls `onStyleChange(updates)`, which the
   canvas wrapper routes to `game.updateShapeStyle(updates)`.
4. Undo/redo is automatic.

### Adding a new text behavior

1. Text editing state lives in `TextManager` (`draw/managers/textManager.ts`).
2. The canonical text data lives in `TextShape.text` in `existingShapes`.
3. The DOM textarea is created/destroyed by `startTextEdit`/`removeTextOverlay`.
4. For inline editing (arrow labels, frame names), use `shapeEdit.ts`
   which mounts a textarea and commits via `onCommit`.
5. Any new text behavior must update the `TextShape` and commit through
   `onCommit`. Do not store text state in the DOM.

---

## Incident History

See [../incidents.md](../incidents.md) for the full incident log.

Relevant incidents to this architecture:

- **Incident 1: Canvas Blur on HiDPI/Retina Displays** — led to the
  logical/physical dimension separation (`cssWidth`/`cssHeight`/`dpr`).
- **Incident 3: Cache Canvas Clear Rect Used Physical Instead of Logical
  Dimensions** — reinforced the rule that transformed contexts must use
  logical coordinates.
- **Shape-aware hit testing** (Phase 2–3) — diamond and ellipsisArc were
  previously selected via AABB, producing incorrect click detection.

---

## Verification Checklist

Before merging UI/editor changes, verify:

- [ ] `bun lint` passes.
- [ ] `bun check-types` passes.
- [ ] No new `switch (shape.type)` outside `@repo/shapes`.
- [ ] No `(shape as any)` geometry writes in the frontend.
- [ ] New tools are added to `CORE_TOOLS` or `MORE_TOOLS` in
      `components/canvasTools.tsx` with a shortcut.
- [ ] New shapes implement the full per-shape contract in `@repo/shapes`
      and declare `boundTextId?: string`.
- [ ] Selection transforms work for single and multi-select.
- [ ] Text editing commits to `TextShape.text`, not DOM state.
- [ ] Cache invalidation is only called on actual scene changes, not
      viewport/overlay changes.
- [ ] Snapshot rows stay under 512KB (images go through `ImageAsset`).
- [ ] Trash changes notify `trashChangeCallback` (don't poll).

---

## Future Work

- **Spatial index** — grid-based spatial index for hit testing is
  implemented; can be extended with R-tree for very large canvases.
- **Lasso selection** — not yet implemented.
- **CRDT merge** — last-write-wins is acceptable for current scale but
  would be replaced by Yjs/Automerge for multi-user conflict resolution.
- **Image sanitization** — server-side Sharp validation for uploaded images.
- **Automated tests** — Vitest for shape math, Playwright for integration.
- **WebSocket scaling** — Redis pub/sub for cross-instance broadcast
  (current `publish`/`subscribe` is per-process only).
