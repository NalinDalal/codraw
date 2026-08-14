/**
 * Eraser shape definition and utilities.
 *
 * An eraser shape records a stroke path used for hit-testing
 * to remove intersecting shapes. It is not rendered directly.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Eraser shape variant.
 *
 * - `points` — points along the eraser path
 * - `strokeWidth` — width of the eraser stroke
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface EraserShape {
    type: "eraser";
    /** Points along the eraser path */
    points: Point[];
    /** Width of the eraser stroke */
    strokeWidth: number;
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
    /** ID of a bound text shape inside this eraser stroke (unused, reserved for future) */
    boundTextId?: string;
}

/**
 * Create an eraser shape.
 *
 * @param points - Points along the eraser path
 * @param strokeWidth - Width of the eraser stroke
 * @returns A new {@link EraserShape} instance
 */
export function createEraser(points: Point[], strokeWidth: number): EraserShape {
    return {
        type: "eraser",
        points,
        strokeWidth,
    };
}

/**
 * Compute the bounding box for an eraser stroke.
 *
 * Returns `null` if the stroke has no points.
 *
 * @param shape - The eraser shape
 * @returns Bounding box in canvas coordinates, or `null` if empty
 */
export function getEraserBounds(shape: EraserShape): Bounds | null {
    if (shape.points.length === 0) return null;
    const xs = shape.points.map((p) => p[0]);
    const ys = shape.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
    };
}
