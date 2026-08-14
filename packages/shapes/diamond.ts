/**
 * Diamond/rhombus shape definition and utilities.
 *
 * A diamond is defined by its center point and width/height.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Diamond shape variant.
 *
 * - `centerX`, `centerY` — center point in canvas coordinates
 * - `width` — full width of the diamond
 * - `height` — full height of the diamond
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface DiamondShape {
    type: "diamond";
    /** Center X coordinate */
    centerX: number;
    /** Center Y coordinate */
    centerY: number;
    /** Bounding-box width */
    width: number;
    /** Bounding-box height */
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
    /** ID of a bound text shape inside this diamond */
    boundTextId?: string;
}

/**
 * Create a diamond shape with default style applied.
 *
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @param width - Full width in canvas units
 * @param height - Full height in canvas units
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link DiamondShape} instance
 */
export function createDiamond(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    style?: ShapeStyle,
): DiamondShape {
    return {
        type: "diamond",
        centerX,
        centerY,
        width,
        height,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for a diamond.
 *
 * @param shape - The diamond shape
 * @returns Bounding box in canvas coordinates
 */
export function getDiamondBounds(shape: DiamondShape): Bounds {
    return {
        x: shape.centerX - shape.width / 2,
        y: shape.centerY - shape.height / 2,
        w: shape.width,
        h: shape.height,
    };
}

/**
 * Check whether a point lies inside the diamond.
 *
 * Uses the diamond's bounding box for hit-testing.
 *
 * @param point - Test point [x, y]
 * @param shape - The diamond shape
 * @returns `true` if the point is within the diamond bounds
 */
export function hitTestDiamond(point: Point, shape: DiamondShape): boolean {
    const b = getDiamondBounds(shape);
    return (
        point[0] >= b.x &&
        point[0] <= b.x + b.w &&
        point[1] >= b.y &&
        point[1] <= b.y + b.h
    );
}
