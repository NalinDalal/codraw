/**
 * Text shape definition and utilities.
 *
 * A text shape is a text label at a position with font styling.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";
import { measureMultilineText } from "./textMeasurement";

/**
 * Text shape variant.
 *
 * - `x`, `y` — text anchor position (baseline left for left-aligned,
 *   horizontal center for center-aligned, right for right-aligned)
 * - `text` — the text content
 * - `fontSize` — font size in pixels
 * - `bold?` — bold weight
 * - `italic?` — italic style
 * - `fontFamily?` — font family name
 * - `textAlign?` — horizontal alignment: "left" | "center" | "right"
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians
 * - `url?` — optional web link opened on double-click
 */
export interface TextShape {
    type: "text";
    /** Text anchor X (position depends on textAlign) */
    x: number;
    /** Text anchor Y (baseline top) */
    y: number;
    /** The text content */
    text: string;
    /** Font size in pixels */
    fontSize: number;
    /** Bold weight */
    bold?: boolean;
    /** Italic style */
    italic?: boolean;
    /** Font family name */
    fontFamily?: string;
    /** Horizontal alignment */
    textAlign?: "left" | "center" | "right";
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
    /** ID of a container shape this text is bound to (unused for standalone text) */
    boundTextId?: string;
}

/**
 * Create a text shape with default style applied.
 *
 * @param x - Text anchor X (baseline left)
 * @param y - Text anchor Y (baseline top)
 * @param text - The text content
 * @param fontSize - Font size in pixels
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link TextShape} instance
 */
export function createText(
    x: number,
    y: number,
    text: string,
    fontSize: number,
    style?: ShapeStyle,
): TextShape {
    return {
        type: "text",
        x,
        y,
        text,
        fontSize,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for a text shape.
 *
 * Uses actual canvas text measurement when available for accurate width.
 * The text anchor `x/y` is the top-left of the first line (matches
 * `ctx.textBaseline = "top"` used by the renderer).
 *
 * @param shape - The text shape
 * @returns Bounding box in canvas coordinates
 */
export function getTextBounds(shape: TextShape): Bounds {
    let textWidth: number;
    let textHeight: number;
    try {
        const measured = measureMultilineText(
            shape.text,
            shape.fontSize,
            shape.fontFamily || "Arial",
            shape.bold,
            shape.italic,
        );
        textWidth = measured.width;
        textHeight = measured.height;
    } catch {
        const lines = shape.text.split("\n");
        const boldFactor = shape.bold ? 1.15 : 1;
        textWidth = lines.reduce((max, l) => Math.max(max, l.length), 0) * (shape.fontSize * 0.6) * boldFactor;
        textHeight = lines.length * shape.fontSize * 1.25;
    }
    const align = shape.textAlign || "left";
    let x = shape.x;
    if (align === "center") x = shape.x - textWidth / 2;
    else if (align === "right") x = shape.x - textWidth;
    return {
        x,
        y: shape.y,
        w: textWidth,
        h: textHeight,
    };
}

/**
 * Check whether a point lies within the text bounding box.
 *
 * @param point - Test point [x, y]
 * @param shape - The text shape
 * @returns `true` if the point is within the text bounds
 */
export function hitTestText(point: Point, shape: TextShape): boolean {
    const b = getTextBounds(shape);
    return (
        point[0] >= b.x &&
        point[0] <= b.x + b.w &&
        point[1] >= b.y &&
        point[1] <= b.y + b.h
    );
}
