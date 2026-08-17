/**
 * Unified shape transform layer.
 *
 * Every operation here is typed on the generic `Shape` union — no caller
 * ever dispatches on `shape.type` to move, resize, rotate, or flip an
 * element. Per-shape storage models (corner-anchored boxes, center-anchored
 * circles/diamonds/arcs, point-based strokes) are handled internally per
 * type, but callers only deal with [Bounds] rectangles.
 *
 * Bounds contract
 * ---------------
 * - `Bounds` are always axis-aligned and normalized: non-negative `w`/`h`,
 *   `x`/`y` at the minimum corner. Negative dimensions (mirror-resize by
 *   dragging past an anchor) are normalized here; explicit mirroring is
 *   available via {@link flipShape} / {@link flipSelection}.
 * - `getShapeBounds` remains the canonical way to read a shape's current
 *   unrotated bounds (see `utils.ts`).
 */

import type { Shape } from "./shape";
import type { Point, Bounds } from "./types";
import { getShapeBounds, rotatePointAround } from "./utils";

/** Normalize a bounds rect to non-negative size with `x`/`y` at the min corner. */
function normalizeBounds(b: Bounds): Bounds {
    let { x, y, w, h } = b;
    if (w < 0) {
        x += w;
        w = -w;
    }
    if (h < 0) {
        y += h;
        h = -h;
    }
    return { x, y, w, h };
}

/**
 * Move a shape by a delta in canvas coordinates.
 *
 * Adjusts all positional fields by `[dx, dy]`. Used during drag operations
 * and arrow-key nudging.
 *
 * @param shape - The shape to move (mutated in place)
 * @param dx - Horizontal displacement in canvas units
 * @param dy - Vertical displacement in canvas units
 */
export function translateShape(shape: Shape, dx: number, dy: number): void {
    switch (shape.type) {
        case "rect":
        case "text":
        case "image":
        case "stickyNote":
        case "frame": {
            shape.x += dx;
            shape.y += dy;
            break;
        }
        case "circle":
        case "ellipsisArc":
        case "diamond": {
            shape.centerX += dx;
            shape.centerY += dy;
            break;
        }
        case "pencil":
        case "eraser": {
            for (const pt of shape.points) {
                pt[0] += dx;
                pt[1] += dy;
            }
            break;
        }
        case "arrow":
        case "line": {
            shape.startX += dx;
            shape.startY += dy;
            shape.endX += dx;
            shape.endY += dy;
            if (shape.type === "line" && shape.points) {
                for (const pt of shape.points) {
                    pt[0] += dx;
                    pt[1] += dy;
                }
            }
            break;
        }
    }
}

/**
 * Apply a uniform offset to a shape copy (used after paste).
 *
 * Accepts a single `offset` for both axes, or separate `dx`/`dy`.
 *
 * @param copy - A cloned shape to offset (mutated in place)
 * @param offset - Distance to shift in both X and Y directions
 * @param dy - Optional Y-only offset; defaults to `offset`
 */
export function offsetShapeCopy(copy: Shape, offset: number, dy?: number): void {
    translateShape(copy, offset, dy ?? offset);
}

/**
 * Resize a shape by mapping its current bounds through a target bounds.
 *
 * `from` is the shape's bounds at the start of the operation (typically
 * `getShapeBounds(shape)` captured before the drag) and `to` is the
 * desired new bounds — e.g. computed from a drag handle by the
 * interaction layer. Works for single-shape handle drags and
 * multi-select alike (see {@link resizeSelection}).
 *
 * Semantics per type:
 * - Box shapes (rect, text, image, stickyNote, frame): fields written
 *   directly to `to` (normalized); text also scales its font size
 *   proportionally.
 * - Circle: keeps its circular aspect — radius = `min(to.w, to.h) / 2`,
 *   centered in `to`.
 * - Diamond / ellipsisArc: width/height = `to.w`/`to.h`, centered in `to`.
 * - Point shapes (pencil, eraser, arrow, line): every point is mapped
 *   through the same bounds affine `from -> to`.
 *
 * Negative `to` dimensions are normalized (mirror-resize is a later
 * refinement; use {@link flipShape} for explicit mirroring).
 *
 * @param shape - The shape to resize (mutated in place)
 * @param from - The shape's current bounds
 * @param to - The target bounds
 */
export function resizeShape(shape: Shape, from: Bounds, to: Bounds): void {
    const target = normalizeBounds(to);
    const fromW = from.w || 1;
    const fromH = from.h || 1;
    const sx = target.w / fromW;
    const sy = target.h / fromH;

    switch (shape.type) {
        case "rect":
        case "image":
        case "stickyNote":
        case "frame": {
            shape.x = target.x;
            shape.y = target.y;
            shape.width = target.w;
            shape.height = target.h;
            break;
        }
        case "text": {
            shape.x += target.x - from.x;
            shape.y += target.y - from.y;
            shape.fontSize = Math.max(1, shape.fontSize * Math.min(sx, sy));
            break;
        }
        case "circle": {
            shape.centerX = target.x + target.w / 2;
            shape.centerY = target.y + target.h / 2;
            shape.radius = Math.min(target.w, target.h) / 2;
            break;
        }
        case "diamond":
        case "ellipsisArc": {
            shape.centerX = target.x + target.w / 2;
            shape.centerY = target.y + target.h / 2;
            shape.width = target.w;
            shape.height = target.h;
            break;
        }
        case "pencil":
        case "eraser": {
            for (const p of shape.points) {
                p[0] = target.x + ((p[0] - from.x) / fromW) * target.w;
                p[1] = target.y + ((p[1] - from.y) / fromH) * target.h;
            }
            break;
        }
        case "arrow":
        case "line": {
            const map = (px: number, py: number): Point => [
                target.x + ((px - from.x) / fromW) * target.w,
                target.y + ((py - from.y) / fromH) * target.h,
            ];
            const start = map(shape.startX, shape.startY);
            const end = map(shape.endX, shape.endY);
            shape.startX = start[0];
            shape.startY = start[1];
            shape.endX = end[0];
            shape.endY = end[1];
            if (shape.type === "line" && shape.points) {
                for (const p of shape.points) {
                    const mapped = map(p[0], p[1]);
                    p[0] = mapped[0];
                    p[1] = mapped[1];
                }
            }
            if (shape.type === "arrow") {
                const scale = Math.min(sx, sy);
                shape.arrowHeadSize = Math.max(5, shape.arrowHeadSize * scale);
            }
            break;
        }
    }
}

/**
 * Resize a set of shapes (a selection) through a shared bounds affine.
 *
 * The selection's bounds at drag start (`from`) are mapped to the target
 * bounds (`to`); each member shape's own bounds are mapped through the
 * same affine, then {@link resizeShape} applies the result to that shape.
 *
 * @param shapes - The selected shapes (mutated in place)
 * @param from - The selection bounds at the start of the operation
 * @param to - The target selection bounds
 */
export function resizeSelection(shapes: Shape[], from: Bounds, to: Bounds): void {
    const target = normalizeBounds(to);
    const fromW = from.w || 1;
    const fromH = from.h || 1;
    const sx = target.w / fromW;
    const sy = target.h / fromH;
    for (const shape of shapes) {
        const b = getShapeBounds(shape);
        if (!b) continue;
        const mapped: Bounds = {
            x: target.x + ((b.x - from.x) / fromW) * target.w,
            y: target.y + ((b.y - from.y) / fromH) * target.h,
            w: b.w * sx,
            h: b.h * sy,
        };
        resizeShape(shape, b, mapped);
    }
}

/**
 * Rotate a shape around its own center by a delta angle (radians).
 *
 * @param shape - The shape to rotate (mutated in place)
 * @param deltaAngle - Angle delta in radians
 */
export function rotateShape(shape: Shape, deltaAngle: number): void {
    shape.rotation = (shape.rotation ?? 0) + deltaAngle;
}

/**
 * Rotate a shape around an arbitrary center by a delta angle (radians).
 *
 * The shape's own center orbits the given center, and the shape's
 * rotation value is incremented — exact for every shape type, rotated or
 * not. Use at the selection level via {@link rotateSelection}.
 *
 * @param shape - The shape to rotate (mutated in place)
 * @param cx - Orbit center X
 * @param cy - Orbit center Y
 * @param deltaAngle - Angle delta in radians
 */
export function rotateShapeAround(shape: Shape, cx: number, cy: number, deltaAngle: number): void {
    const b = getShapeBounds(shape);
    if (!b) return;
    const ownCx = b.x + b.w / 2;
    const ownCy = b.y + b.h / 2;
    const [nx, ny] = rotatePointAround([ownCx, ownCy], cx, cy, deltaAngle);
    translateShape(shape, nx - ownCx, ny - ownCy);
    shape.rotation = (shape.rotation ?? 0) + deltaAngle;
}

/** Rotate a set of shapes around a shared center (selection rotation). */
export function rotateSelection(shapes: Shape[], cx: number, cy: number, deltaAngle: number): void {
    for (const shape of shapes) {
        rotateShapeAround(shape, cx, cy, deltaAngle);
    }
}

/**
 * Flip a shape in place (mirror around its own vertical/horizontal center
 * axis). Symmetric shapes (circle, diamond, ellipsisArc) keep their
 * geometry — only the rotation sign flips, which mirrors the rendered
 * result of rotated shapes.
 *
 * @param shape - The shape to flip (mutated in place)
 * @param horizontal - `true` mirrors left-right, `false` top-bottom
 */
export function flipShape(shape: Shape, horizontal: boolean): void {
    const b = getShapeBounds(shape);
    if (!b) return;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    switch (shape.type) {
        case "rect":
        case "image":
        case "stickyNote":
        case "frame": {
            if (horizontal) {
                shape.x = 2 * cx - b.x - b.w;
            } else {
                shape.y = 2 * cy - b.y - b.h;
            }
            break;
        }
        case "text": {
            if (horizontal) {
                shape.x = 2 * cx - b.x - b.w;
                if (shape.textAlign === "left") shape.textAlign = "right";
                else if (shape.textAlign === "right") shape.textAlign = "left";
            } else {
                shape.y = 2 * cy - b.y - b.h;
            }
            break;
        }
        case "arrow":
        case "line": {
            const mirror = (px: number, py: number): Point =>
                horizontal ? [2 * cx - px, py] : [px, 2 * cy - py];
            const start = mirror(shape.startX, shape.startY);
            const end = mirror(shape.endX, shape.endY);
            shape.startX = start[0];
            shape.startY = start[1];
            shape.endX = end[0];
            shape.endY = end[1];
            if (shape.type === "line" && shape.points) {
                for (const p of shape.points) {
                    const m = mirror(p[0], p[1]);
                    p[0] = m[0];
                    p[1] = m[1];
                }
            }
            break;
        }
        case "pencil":
        case "eraser": {
            for (const p of shape.points) {
                if (horizontal) p[0] = 2 * cx - p[0];
                else p[1] = 2 * cy - p[1];
            }
            break;
        }
        case "circle":
        case "ellipsisArc":
        case "diamond": {
            // Geometry is symmetric; mirroring only affects rotation.
            break;
        }
    }

    // Mirroring reverses the sign of any rotation.
    if (shape.rotation) {
        shape.rotation = -shape.rotation;
    }
}

/**
 * Flip a set of shapes as one selection: each shape's bounds mirror
 * around the selection center axis, and each shape is flipped around its
 * own center.
 *
 * @param shapes - The selected shapes (mutated in place)
 * @param horizontal - `true` mirrors left-right, `false` top-bottom
 */
export function flipSelection(shapes: Shape[], horizontal: boolean): void {
    const selection = getShapesBounds(shapes);
    if (!selection) return;
    const selCx = selection.x + selection.w / 2;
    const selCy = selection.y + selection.h / 2;
    for (const shape of shapes) {
        const b = getShapeBounds(shape);
        if (!b) continue;
        const ownCx = b.x + b.w / 2;
        const ownCy = b.y + b.h / 2;
        const targetCx = horizontal ? 2 * selCx - ownCx : ownCx;
        const targetCy = horizontal ? ownCy : 2 * selCy - ownCy;
        translateShape(shape, targetCx - ownCx, targetCy - ownCy);
        flipShape(shape, horizontal);
    }
}

/**
 * Compute the combined axis-aligned bounds of a set of shapes.
 *
 * @param shapes - The shapes to measure
 * @returns The bounding box of all shapes, or `null` if none are
 *          measurable
 */
export function getShapesBounds(shapes: Shape[]): Bounds | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (const shape of shapes) {
        const b = getShapeBounds(shape);
        if (!b) continue;
        found = true;
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    if (!found) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}