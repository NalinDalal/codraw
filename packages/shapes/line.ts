/**
 * Line shape definition and utilities.
 *
 * A line is a simple line segment between two points, or a
 * multi-point polyline.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";
import { distToSegment } from "./utils";

/**
 * Line shape variant.
 *
 * - `startX`, `startY` — start point (legacy, for two-point lines)
 * - `endX`, `endY` — end point (legacy, for two-point lines)
 * - `points?` — ordered list of [x, y] points for multi-point lines
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface LineShape {
    type: "line";
    /** Start point X (legacy, kept for two-point lines) */
    startX: number;
    /** Start point Y (legacy, kept for two-point lines) */
    startY: number;
    /** End point X (legacy, kept for two-point lines) */
    endX: number;
    /** End point Y (legacy, kept for two-point lines) */
    endY: number;
    /** Ordered list of [x, y] points for multi-point lines */
    points?: Point[];
    /** Optional per-shape visual style */
    style?: ShapeStyle;
    /** Grouping identifier for multi-shape groups */
    groupId?: string;
    /** Unique ID assigned on commit */
    id?: string;
    /** When true, the shape cannot be selected or moved */
    locked?: boolean;
    /** Rotation in radians around the shape center */
    rotation?: number;
    /** Optional web link opened on double-click */
    url?: string;
    /** ID of a bound text shape inside this line (unused, reserved for future) */
    boundTextId?: string;
}

/**
 * Create a line shape with default style applied.
 *
 * @param startX - Start point X
 * @param startY - Start point Y
 * @param endX - End point X
 * @param endY - End point Y
 * @param points - Optional multi-point path
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link LineShape} instance
 */
export function createLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    points?: Point[],
    style?: ShapeStyle,
): LineShape {
    return {
        type: "line",
        startX,
        startY,
        endX,
        endY,
        points,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for a line.
 *
 * For multi-point lines, uses the point array bounds.
 *
 * @param shape - The line shape
 * @returns Bounding box in canvas coordinates
 */
export function getLineBounds(shape: LineShape): Bounds {
    if (shape.points && shape.points.length > 0) {
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

/**
 * Check whether a point is near the line segment.
 *
 * @param point - Test point [x, y]
 * @param shape - The line shape
 * @param tolerance - Maximum distance to consider a hit (default 10)
 * @returns `true` if the point is within tolerance of the line
 */
export function hitTestLine(point: Point, shape: LineShape, tolerance = 10): boolean {
    if (shape.points && shape.points.length > 1) {
        for (let i = 1; i < shape.points.length; i++) {
            if (distToSegment(point, shape.points[i - 1]!, shape.points[i]!) < tolerance) {
                return true;
            }
        }
        return false;
    }
    return distToSegment(point, [shape.startX, shape.startY], [shape.endX, shape.endY]) < tolerance;
}
