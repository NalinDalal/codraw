/**
 * Pencil/freehand shape definition and utilities.
 *
 * A pencil stroke is an ordered list of [x, y] points forming
 * a freehand path.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";
import { distToSegment } from "./utils";

/**
 * Pencil shape variant.
 *
 * - `points` — ordered list of [x, y] points forming the freehand stroke
 * - `style?` — optional per-shape visual style
 * - `constantWidth?` — when true, render with native canvas `lineTo` and uniform stroke width
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface PencilShape {
    type: "pencil";
    /** Ordered list of [x, y] points forming the freehand stroke */
    points: Point[];
    /** Optional per-shape visual style */
    style?: ShapeStyle;
    /** When true, render with native canvas `lineTo` and uniform stroke width */
    constantWidth?: boolean;
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
    /** ID of a bound text shape inside this pencil stroke (unused, reserved for future) */
    boundTextId?: string;
}

/**
 * Create a pencil shape with default style applied.
 *
 * @param points - Ordered list of [x, y] points
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @param constantWidth - When true, use uniform stroke width rendering
 * @returns A new {@link PencilShape} instance
 */
export function createPencil(
    points: Point[],
    style?: ShapeStyle,
    constantWidth?: boolean,
): PencilShape {
    return {
        type: "pencil",
        points,
        style: style ?? defaultStyle(),
        constantWidth,
    };
}

/**
 * Compute the bounding box for a pencil stroke.
 *
 * Returns `null` if the stroke has no points.
 *
 * @param shape - The pencil shape
 * @returns Bounding box in canvas coordinates, or `null` if empty
 */
export function getPencilBounds(shape: PencilShape): Bounds | null {
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

/**
 * Check whether a point is near the pencil stroke.
 *
 * Uses a configurable tolerance (default 10px) for proximity testing.
 *
 * @param point - Test point [x, y]
 * @param shape - The pencil shape
 * @param tolerance - Maximum distance to consider a hit (default 10)
 * @returns `true` if the point is within tolerance of any segment
 */
export function hitTestPencil(point: Point, shape: PencilShape, tolerance = 10): boolean {
    for (let i = 1; i < shape.points.length; i++) {
        const dist = distToSegment(point, shape.points[i - 1]!, shape.points[i]!);
        if (dist < tolerance) return true;
    }
    return false;
}
