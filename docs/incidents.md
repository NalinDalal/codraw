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

## Lessons Learned

1. **Share canvas setup code.** `HeroBoard.tsx` had the correct DPR pattern. Drawing engines should extract canvas-sizing logic into a shared utility so marketing and production code cannot drift.

2. **Separate logical and physical dimensions early.** Coupling coordinate math to `canvas.width` creates a hidden dependency that prevents DPR fixes. A canvas engine should own its logical size from day one.

3. **Add fields to the full union type.** When extending a shared discriminated union, all members must declare the new property, even if it is unused, or narrowing by `type` will not expose it.

4. **Verify cache canvas transforms.** Any context that receives `setTransform(dpr, ...)` must have all its sizing/clearing calls use logical coordinates, or you get subtle ghosting that only appears after resize.
