/**
 * Shared utilities for shape modules.
 *
 * These functions operate on the generic `Shape` type and are
 * used by the engine and renderer.
 */

import type { Shape } from "./shape";
import type { Point, Bounds } from "./types";
import { defaultStyle } from "./types";
import { measureMultilineText } from "./textMeasurement";

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
 * Compute the un-rotated axis-aligned bounding box for any shape.
 *
 * This is the raw geometry bounds; see {@link getShapeBounds} for the
 * rotation-aware variant.
 */
function getUnrotatedBounds(shape: Shape): Bounds | null {
    switch (shape.type) {
        case "rect": {
            const x = Math.min(shape.x, shape.x + shape.width);
            const y = Math.min(shape.y, shape.y + shape.height);
            return { x, y, w: Math.abs(shape.width), h: Math.abs(shape.height) };
        }
        case "circle": {
            const r = Math.abs(shape.radius);
            return {
                x: shape.centerX - r,
                y: shape.centerY - r,
                w: r * 2,
                h: r * 2,
            };
        }
        case "ellipsisArc": {
            const hw = Math.abs(shape.width) / 2;
            const hh = Math.abs(shape.height) / 2;
            return {
                x: shape.centerX - hw,
                y: shape.centerY - hh,
                w: hw * 2,
                h: hh * 2,
            };
        }
        case "diamond": {
            return {
                x: shape.centerX - shape.width / 2,
                y: shape.centerY - shape.height / 2,
                w: shape.width,
                h: shape.height,
            };
        }
        case "pencil":
        case "eraser": {
            if (shape.points.length === 0) return null;
            let minX = Infinity,
                maxX = -Infinity,
                minY = Infinity,
                maxY = -Infinity;
            for (const p of shape.points) {
                if (p[0] < minX) minX = p[0];
                if (p[0] > maxX) maxX = p[0];
                if (p[1] < minY) minY = p[1];
                if (p[1] > maxY) maxY = p[1];
            }
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        case "arrow":
        case "line": {
            if (shape.type === "line" && shape.points && shape.points.length > 0) {
                let minX = Infinity,
                    minY = Infinity,
                    maxX = -Infinity,
                    maxY = -Infinity;
                for (const p of shape.points) {
                    if (p[0] < minX) minX = p[0];
                    if (p[1] < minY) minY = p[1];
                    if (p[0] > maxX) maxX = p[0];
                    if (p[1] > maxY) maxY = p[1];
                }
                return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            }
            return {
                x: Math.min(shape.startX, shape.endX),
                y: Math.min(shape.startY, shape.endY),
                w: Math.abs(shape.endX - shape.startX),
                h: Math.abs(shape.endY - shape.startY),
            };
        }
        case "text": {
            let textWidth: number;
            const lines = shape.text.split("\n");
            try {
                const measured = measureMultilineText(
                    shape.text,
                    shape.fontSize,
                    shape.fontFamily || "Arial",
                    shape.bold,
                    shape.italic,
                );
                textWidth = measured.width;
            } catch {
                const boldFactor = shape.bold ? 1.15 : 1;
                textWidth = lines.reduce((max, l) => Math.max(max, l.length), 0) * (shape.fontSize * 0.6) * boldFactor;
            }
            return {
                x: shape.x,
                y: shape.y,
                w: textWidth,
                h: lines.length * shape.fontSize * 1.25,
            };
        }
        case "image":
        case "stickyNote":
        case "frame": {
            return {
                x: shape.x,
                y: shape.y,
                w: shape.width,
                h: shape.height,
            };
        }
        default: {
            return null;
        }
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
    const b = getUnrotatedBounds(shape);
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
    const base = getUnrotatedBounds(shape);
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
 * @returns New array with all shapes guaranteed to have a style
 */
export function ensureShapesHaveStyle(shapes: Shape[]): Shape[] {
    return shapes.map((s) => {
        if (!s.style) {
            s.style = defaultStyle();
        }
        return s;
    });
}
