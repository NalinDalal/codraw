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
    /** ID of a bound text shape inside this arrow (unused, reserved for future) */
    boundTextId?: string;
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
 * Check whether a point hits the arrow.
 *
 * Tests both the line segment and the triangular arrowhead at the end.
 *
 * @param point - Test point [x, y]
 * @param shape - The arrow shape
 * @param tolerance - Maximum distance to consider a hit on the line (default 10)
 * @returns `true` if the point hits the arrow line or head
 */
export function hitTestArrow(point: Point, shape: ArrowShape, tolerance = 10): boolean {
    if (distToSegment(point, [shape.startX, shape.startY], [shape.endX, shape.endY]) < tolerance) {
        return true;
    }
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;
    const angle = Math.atan2(dy, dx);
    const headLen = shape.arrowHeadSize;
    const a1 = angle - Math.PI / 6;
    const a2 = angle + Math.PI / 6;
    const p1: Point = [shape.endX, shape.endY];
    const p2: Point = [shape.endX - headLen * Math.cos(a1), shape.endY - headLen * Math.sin(a1)];
    const p3: Point = [shape.endX - headLen * Math.cos(a2), shape.endY - headLen * Math.sin(a2)];
    return pointInTriangle(point, p1, p2, p3);
}

function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
    const d1 = sign(p, a, b);
    const d2 = sign(p, b, c);
    const d3 = sign(p, c, a);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
}

function sign(p: Point, a: Point, b: Point): number {
    return (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
}
