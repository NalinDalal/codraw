/**
 * Shared utilities for shape modules.
 *
 * These functions operate on the generic `Shape` type and are
 * used by the engine and renderer.
 */

import type { Shape } from "./shape";
import type { Point, Bounds } from "./types";
import { defaultStyle } from "./types";

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
 * Compute the axis-aligned bounding box for any shape.
 *
 * Handles all shape types including pencil/eraser strokes (which use
 * the bounding box of their point array) and text (estimated from
 * character count × font size).
 *
 * @param shape - The shape to measure
 * @returns Bounding box, or `null` if the shape has no renderable area
 */
export function getShapeBounds(shape: Shape): Bounds | null {
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
            const textWidth = shape.text.length * (shape.fontSize * 0.6);
            return {
                x: shape.x,
                y: shape.y - shape.fontSize,
                w: textWidth,
                h: shape.fontSize,
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
