/**
 * Shared utilities for shape modules.
 *
 * These functions operate on the generic `Shape` type and are
 * used by the engine and renderer.
 */

import type { Shape } from "./shape";
import type { Point, Bounds } from "./types";
import { defaultStyle } from "./types";
import { getRectBounds } from "./rect";
import { getCircleBounds } from "./circle";
import { getEllipsisArcBounds } from "./ellipsisArc";
import { getPencilBounds } from "./pencil";
import { getDiamondBounds } from "./diamond";
import { getArrowBounds } from "./arrow";
import { getLineBounds } from "./line";
import { getTextBounds } from "./text";
import { getImageBounds } from "./image";
import { getEraserBounds } from "./eraser";
import { getStickyNoteBounds } from "./stickyNote";
import { getFrameBounds } from "./frame";

/**
 * Compute the shortest distance from a point to a line segment.
 * Used for hit-testing pencil strokes, lines, and arrows.
 *
 * @param p - The test point
 * @param a - Start of the line segment
 * @param b - End of the line segment
 * @returns Distance in canvas units
 */
export function distToSegment(p: Point, a: Point, b: Point): number {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const apx = p[0] - a[0];
    const apy = p[1] - a[1];
    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) {
        return Math.sqrt(apx * apx + apy * apy);
    }
    let t = (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * abx;
    const cy = a[1] + t * aby;
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Rotate a point around a center by the given angle (radians).
 *
 * @param point - The point to rotate
 * @param cx - Center X coordinate
 * @param cy - Center Y coordinate
 * @param angle - Rotation angle in radians
 * @returns The rotated point
 */
export function rotatePointAround(point: Point, cx: number, cy: number, angle: number): Point {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point[0] - cx;
    const dy = point[1] - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/**
 * Compute the un-rotated (local) axis-aligned bounding box for any shape.
 *
 * Delegates to each shape module's own bounds getter so bounds are never
 * defined in two places. Returns the raw geometry bounds, ignoring the
 * shape's `rotation`; use {@link getShapeBounds} for the rotation-aware
 * variant (the rendered AABB).
 *
 * The local bounds are the frame transforms operate in: `resizeShape`
 * maps `from -> to` against these, so a single rotated shape resized from
 * its handles stays correct in its own frame.
 */
export function getLocalBounds(shape: Shape): Bounds | null {
    switch (shape.type) {
        case "rect":
            return getRectBounds(shape);
        case "circle":
            return getCircleBounds(shape);
        case "ellipsisArc":
            return getEllipsisArcBounds(shape);
        case "diamond":
            return getDiamondBounds(shape);
        case "pencil":
            return getPencilBounds(shape);
        case "eraser":
            return getEraserBounds(shape);
        case "arrow":
            return getArrowBounds(shape);
        case "line":
            return getLineBounds(shape);
        case "text":
            return getTextBounds(shape);
        case "image":
            return getImageBounds(shape);
        case "stickyNote":
            return getStickyNoteBounds(shape);
        case "frame":
            return getFrameBounds(shape);
        default:
            return null;
    }
}

/**
 * Compute the rotation pivot (center) of any shape.
 *
 * Used for rendering and hit-testing rotated shapes. Matches the center
 * used by the rotation handle.
 *
 * @param shape - The shape to measure
 * @returns The center point of the shape
 */
export function getShapeCenter(shape: Shape): Point {
    const b = getLocalBounds(shape);
    if (!b) return [0, 0];
    return [b.x + b.w / 2, b.y + b.h / 2];
}

/**
 * Compute the axis-aligned bounding box for any shape.
 *
 * For rotated shapes, returns the bounding box of the rotated geometry
 * (the corners of the un-rotated box rotated around the shape center).
 * Handles all shape types including pencil/eraser strokes (which use
 * the bounding box of their point array) and text (estimated from
 * character count × font size).
 *
 * @param shape - The shape to measure
 * @returns Bounding box, or `null` if the shape has no renderable area
 */
export function getShapeBounds(shape: Shape): Bounds | null {
    const base = getLocalBounds(shape);
    const rotation = shape.rotation;
    if (!base || !rotation) return base;

    const center = getShapeCenter(shape);
    const cx = center[0]!;
    const cy = center[1]!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const corners: Array<Point> = [
        [base.x, base.y],
        [base.x + base.w, base.y],
        [base.x + base.w, base.y + base.h],
        [base.x, base.y + base.h],
    ];
    for (const corner of corners) {
        const rotated = rotatePointAround(corner, cx, cy, rotation);
        const rx = rotated[0]!;
        const ry = rotated[1]!;
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Ensure every shape in the array has a `style` property.
 *
 * Shapes loaded from legacy data or external sources may lack a style;
 * this fills in {@link defaultStyle} for any that do not.
 *
 * @param shapes - Array of shapes to normalize
 * @param isDark - Current theme; shapes filled in with the theme's default style
 * @returns New array with all shapes guaranteed to have a style
 */
export function ensureShapesHaveStyle(shapes: Shape[], isDark = false): Shape[] {
    return shapes.map((s) => {
        if (!s.style) {
            s.style = defaultStyle(isDark);
        }
        return s;
    });
}
