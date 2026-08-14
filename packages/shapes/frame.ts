/**
 * Frame shape definition and utilities.
 *
 * A frame is a labeled rectangular container used for organizing
 * shapes, particularly in presentation mode.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Frame shape variant.
 *
 * - `x`, `y` — top-left corner in canvas coordinates
 * - `width`, `height` — dimensions in canvas units
 * - `name` — label for the frame
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface FrameShape {
    type: "frame";
    /** Top-left X coordinate */
    x: number;
    /** Top-left Y coordinate */
    y: number;
    /** Width of the frame */
    width: number;
    /** Height of the frame */
    height: number;
    /** Name/label for the frame */
    name: string;
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
    /** ID of a bound text shape inside this frame */
    boundTextId?: string;
}

/**
 * Create a frame shape with default style applied.
 *
 * @param x - Top-left X coordinate
 * @param y - Top-left Y coordinate
 * @param width - Width in canvas units
 * @param height - Height in canvas units
 * @param name - Label for the frame
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link FrameShape} instance
 */
export function createFrame(
    x: number,
    y: number,
    width: number,
    height: number,
    name: string,
    style?: ShapeStyle,
): FrameShape {
    return {
        type: "frame",
        x,
        y,
        width,
        height,
        name,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for a frame.
 *
 * @param shape - The frame shape
 * @returns Bounding box in canvas coordinates
 */
export function getFrameBounds(shape: FrameShape): Bounds {
    return {
        x: shape.x,
        y: shape.y,
        w: shape.width,
        h: shape.height,
    };
}

/**
 * Check whether a point lies inside the frame.
 *
 * @param point - Test point [x, y]
 * @param shape - The frame shape
 * @returns `true` if the point is within the frame bounds
 */
export function hitTestFrame(point: Point, shape: FrameShape): boolean {
    const b = getFrameBounds(shape);
    return (
        point[0] >= b.x &&
        point[0] <= b.x + b.w &&
        point[1] >= b.y &&
        point[1] <= b.y + b.h
    );
}
