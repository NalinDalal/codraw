/**
 * Circle shape definition and utilities.
 *
 * A circle is defined by its center point and radius.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Circle shape variant.
 *
 * - `centerX`, `centerY` — center point in canvas coordinates
 * - `radius` — radius in canvas units
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians (applied to stroke, not geometry)
 * - `url?` — optional web link opened on double-click
 */
export interface CircleShape {
    type: "circle";
    /** Center X coordinate */
    centerX: number;
    /** Center Y coordinate */
    centerY: number;
    /** Radius in canvas units */
    radius: number;
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
}

/**
 * Create a circle shape with default style applied.
 *
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @param radius - Radius in canvas units
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link CircleShape} instance
 */
export function createCircle(
    centerX: number,
    centerY: number,
    radius: number,
    style?: ShapeStyle,
): CircleShape {
    return {
        type: "circle",
        centerX,
        centerY,
        radius,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for a circle.
 *
 * @param shape - The circle shape
 * @returns Bounding box in canvas coordinates
 */
export function getCircleBounds(shape: CircleShape): Bounds {
    const r = Math.abs(shape.radius);
    return {
        x: shape.centerX - r,
        y: shape.centerY - r,
        w: r * 2,
        h: r * 2,
    };
}

/**
 * Check whether a point lies inside or on the circle.
 *
 * @param point - Test point [x, y]
 * @param shape - The circle shape
 * @returns `true` if the point is within the circle
 */
export function hitTestCircle(point: Point, shape: CircleShape): boolean {
    const dx = point[0] - shape.centerX;
    const dy = point[1] - shape.centerY;
    const r = Math.abs(shape.radius);
    return dx * dx + dy * dy <= r * r;
}
