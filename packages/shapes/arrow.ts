/**
 * Arrow shape definition and utilities.
 *
 * An arrow is a line segment with a triangular arrowhead at the end.
 * It may have optional start/end bindings to other shapes.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";
import { distToSegment } from "./utils";

/**
 * Arrow shape variant.
 *
 * - `startX`, `startY` — start point in canvas coordinates
 * - `endX`, `endY` — end point in canvas coordinates
 * - `arrowHeadSize` — arrowhead size in pixels
 * - `startBinding?` — ID of the shape the arrow's start is bound to
 * - `endBinding?` — ID of the shape the arrow's end is bound to
 * - `label?` — optional text label displayed at the arrow's midpoint
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface ArrowShape {
    type: "arrow";
    /** Start point X */
    startX: number;
    /** Start point Y */
    startY: number;
    /** End point X */
    endX: number;
    /** End point Y */
    endY: number;
    /** Arrowhead size in pixels */
    arrowHeadSize: number;
    /** ID of the shape the arrow's start is bound to, if any */
    startBinding?: string;
    /** ID of the shape the arrow's end is bound to, if any */
    endBinding?: string;
    /** Optional text label displayed at the arrow's midpoint */
    label?: string;
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
 * Create an arrow shape with default style applied.
 *
 * @param startX - Start point X
 * @param startY - Start point Y
 * @param endX - End point X
 * @param endY - End point Y
 * @param arrowHeadSize - Arrowhead size in pixels
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link ArrowShape} instance
 */
export function createArrow(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    arrowHeadSize: number,
    style?: ShapeStyle,
): ArrowShape {
    return {
        type: "arrow",
        startX,
        startY,
        endX,
        endY,
        arrowHeadSize,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for an arrow.
 *
 * @param shape - The arrow shape
 * @returns Bounding box in canvas coordinates
 */
export function getArrowBounds(shape: ArrowShape): Bounds {
    return {
        x: Math.min(shape.startX, shape.endX),
        y: Math.min(shape.startY, shape.endY),
        w: Math.abs(shape.endX - shape.startX),
        h: Math.abs(shape.endY - shape.startY),
    };
}

/**
 * Check whether a point is near the arrow line segment.
 *
 * @param point - Test point [x, y]
 * @param shape - The arrow shape
 * @param tolerance - Maximum distance to consider a hit (default 10)
 * @returns `true` if the point is within tolerance of the arrow line
 */
export function hitTestArrow(point: Point, shape: ArrowShape, tolerance = 10): boolean {
    return distToSegment(point, [shape.startX, shape.startY], [shape.endX, shape.endY]) < tolerance;
}
