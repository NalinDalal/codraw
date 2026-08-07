/**
 * Ellipsis arc shape definition and utilities.
 *
 * An elliptical arc is defined by its center point, bounding box
 * dimensions, and start/end angles.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Ellipsis arc shape variant.
 *
 * - `centerX`, `centerY` — center of the ellipse in canvas coordinates
 * - `width` — bounding-box width (horizontal axis)
 * - `height` — bounding-box height (vertical axis)
 * - `startAngle` — arc start angle in radians (0 = right, PI/2 = bottom)
 * - `endAngle` — arc end angle in radians
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface EllipsisArcShape {
    type: "ellipsisArc";
    /** Center X coordinate */
    centerX: number;
    /** Center Y coordinate */
    centerY: number;
    /** Bounding-box width (horizontal axis) */
    width: number;
    /** Bounding-box height (vertical axis) */
    height: number;
    /** Arc start angle in radians (0 = right, PI/2 = bottom) */
    startAngle: number;
    /** Arc end angle in radians */
    endAngle: number;
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
 * Create an ellipsis arc shape with default style applied.
 *
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @param width - Bounding-box width
 * @param height - Bounding-box height
 * @param startAngle - Arc start angle in radians
 * @param endAngle - Arc end angle in radians
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link EllipsisArcShape} instance
 */
export function createEllipsisArc(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    startAngle: number,
    endAngle: number,
    style?: ShapeStyle,
): EllipsisArcShape {
    return {
        type: "ellipsisArc",
        centerX,
        centerY,
        width,
        height,
        startAngle,
        endAngle,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for an ellipsis arc.
 *
 * @param shape - The ellipsis arc shape
 * @returns Bounding box in canvas coordinates
 */
export function getEllipsisArcBounds(shape: EllipsisArcShape): Bounds {
    const hw = Math.abs(shape.width) / 2;
    const hh = Math.abs(shape.height) / 2;
    return {
        x: shape.centerX - hw,
        y: shape.centerY - hh,
        w: hw * 2,
        h: hh * 2,
    };
}

/**
 * Check whether a point is inside the ellipsis arc bounding box.
 *
 * @param point - Test point [x, y]
 * @param shape - The ellipsis arc shape
 * @returns `true` if the point is within the bounding box
 */
export function hitTestEllipsisArc(point: Point, shape: EllipsisArcShape): boolean {
    const b = getEllipsisArcBounds(shape);
    return (
        point[0] >= b.x &&
        point[0] <= b.x + b.w &&
        point[1] >= b.y &&
        point[1] <= b.y + b.h
    );
}
