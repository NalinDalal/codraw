/**
 * Image shape definition and utilities.
 *
 * An image shape embeds a raster image by its data URL.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Image shape variant.
 *
 * - `x`, `y` — top-left corner in canvas coordinates
 * - `width`, `height` — rendered dimensions in canvas units
 * - `imageData` — base64 data URL of the image source
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface ImageShape {
    type: "image";
    /** Top-left X coordinate */
    x: number;
    /** Top-left Y coordinate */
    y: number;
    /** Rendered width in canvas units */
    width: number;
    /** Rendered height in canvas units */
    height: number;
    /** Base64 data URL of the image source */
    imageData: string;
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
    /** ID of a bound text shape inside this image (unused, reserved for future) */
    boundTextId?: string;
}

/**
 * Create an image shape with default style applied.
 *
 * @param x - Top-left X coordinate
 * @param y - Top-left Y coordinate
 * @param width - Rendered width in canvas units
 * @param height - Rendered height in canvas units
 * @param imageData - Base64 data URL of the image source
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link ImageShape} instance
 */
export function createImage(
    x: number,
    y: number,
    width: number,
    height: number,
    imageData: string,
    style?: ShapeStyle,
): ImageShape {
    return {
        type: "image",
        x,
        y,
        width,
        height,
        imageData,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for an image.
 *
 * @param shape - The image shape
 * @returns Bounding box in canvas coordinates
 */
export function getImageBounds(shape: ImageShape): Bounds {
    return {
        x: shape.x,
        y: shape.y,
        w: shape.width,
        h: shape.height,
    };
}

/**
 * Check whether a point lies inside the image bounds.
 *
 * @param point - Test point [x, y]
 * @param shape - The image shape
 * @returns `true` if the point is within the image bounds
 */
export function hitTestImage(point: Point, shape: ImageShape): boolean {
    const b = getImageBounds(shape);
    return (
        point[0] >= b.x &&
        point[0] <= b.x + b.w &&
        point[1] >= b.y &&
        point[1] <= b.y + b.h
    );
}
