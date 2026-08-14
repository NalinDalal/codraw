/**
 * Sticky note shape definition and utilities.
 *
 * A sticky note is a colored rectangle with text content.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Sticky note shape variant.
 *
 * - `x`, `y` — top-left corner in canvas coordinates
 * - `width`, `height` — dimensions in canvas units
 * - `noteColor` — background color of the note
 * - `text` — text content
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface StickyNoteShape {
    type: "stickyNote";
    /** Top-left X coordinate */
    x: number;
    /** Top-left Y coordinate */
    y: number;
    /** Width of the note */
    width: number;
    /** Height of the note */
    height: number;
    /** Background color of the note */
    noteColor: string;
    /** Text content */
    text: string;
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
    /** ID of a bound text shape inside this sticky note */
    boundTextId?: string;
}

/**
 * Create a sticky note shape with default style applied.
 *
 * @param x - Top-left X coordinate
 * @param y - Top-left Y coordinate
 * @param width - Width in canvas units
 * @param height - Height in canvas units
 * @param noteColor - Background color of the note
 * @param text - Text content
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link StickyNoteShape} instance
 */
export function createStickyNote(
    x: number,
    y: number,
    width: number,
    height: number,
    noteColor: string,
    text: string,
    style?: ShapeStyle,
): StickyNoteShape {
    return {
        type: "stickyNote",
        x,
        y,
        width,
        height,
        noteColor,
        text,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for a sticky note.
 *
 * @param shape - The sticky note shape
 * @returns Bounding box in canvas coordinates
 */
export function getStickyNoteBounds(shape: StickyNoteShape): Bounds {
    return {
        x: shape.x,
        y: shape.y,
        w: shape.width,
        h: shape.height,
    };
}

/**
 * Check whether a point lies inside the sticky note.
 *
 * @param point - Test point [x, y]
 * @param shape - The sticky note shape
 * @returns `true` if the point is within the note bounds
 */
export function hitTestStickyNote(point: Point, shape: StickyNoteShape): boolean {
    const b = getStickyNoteBounds(shape);
    return (
        point[0] >= b.x &&
        point[0] <= b.x + b.w &&
        point[1] >= b.y &&
        point[1] <= b.y + b.h
    );
}
