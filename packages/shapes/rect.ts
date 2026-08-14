/**
 * Rectangle shape definition and utilities.
 *
 * A rectangle is axis-aligned by its top-left corner (`x`, `y`)
 * and dimensions (`width`, `height`). Negative width/height are
 * normalized by the renderer.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Rectangle shape variant.
 *
 * - `x`, `y` — top-left corner in canvas coordinates
 * - `width`, `height` — dimensions; may be negative if drawn right-to-left or bottom-to-top
 * - `style?` — optional per-shape visual style; falls back to {@link defaultStyle}
 * - `groupId?` — grouping identifier for multi-shape groups
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, the shape cannot be selected or moved
 * - `rotation?` — rotation in radians around the shape center
 * - `url?` — optional web link opened on double-click
 */
export interface RectShape {
    type: "rect";
    /** Top-left X coordinate */
    x: number;
    /** Top-left Y coordinate */
    y: number;
    /** Width (may be negative if drawn right-to-left) */
    width: number;
    /** Height (may be negative if drawn bottom-to-top) */
    height: number;
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
    /** ID of a bound text shape inside this rectangle */
    boundTextId?: string;
}

/**
 * Create a rectangle shape with default style applied.
 *
 * @param x - Top-left X coordinate
 * @param y - Top-left Y coordinate
 * @param width - Width in canvas units
 * @param height - Height in canvas units
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link RectShape} instance
 */
export function createRect(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: ShapeStyle,
): RectShape {
    return {
        type: "rect",
        x,
        y,
        width,
        height,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the axis-aligned bounding box for a rectangle.
 *
 * Accounts for negative width/height by taking min/max of corners.
 *
 * @param shape - The rectangle shape
 * @returns Bounding box in canvas coordinates
 */
export function getRectBounds(shape: RectShape): Bounds {
    const x = Math.min(shape.x, shape.x + shape.width);
    const y = Math.min(shape.y, shape.y + shape.height);
    return {
        x,
        y,
        w: Math.abs(shape.width),
        h: Math.abs(shape.height),
    };
}

/**
 * Check whether a point lies inside the rectangle.
 *
 * @param point - Test point [x, y]
 * @param shape - The rectangle shape
 * @returns `true` if the point is within the rectangle bounds
 */
export function hitTestRect(point: Point, shape: RectShape): boolean {
    const b = getRectBounds(shape);
    return (
        point[0] >= b.x &&
        point[0] <= b.x + b.w &&
        point[1] >= b.y &&
        point[1] <= b.y + b.h
    );
}
