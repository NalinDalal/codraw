/**
 * Runtime validation for the `Shape` union.
 *
 * Shapes arriving over WebSocket or from HTTP snapshots are untrusted
 * input; {@link isValidShape} checks the structural invariants every
 * shape must satisfy before the server relays or persists them.
 *
 * @module validation
 */

import type { Shape } from "./shape";

/** Known shape type discriminants. */
const SHAPE_TYPES = new Set([
    "rect",
    "circle",
    "ellipsisArc",
    "pencil",
    "diamond",
    "arrow",
    "line",
    "text",
    "image",
    "eraser",
    "stickyNote",
    "frame",
]);

/** Per-type required numeric (or string) fields that must be finite. */
const NUMERIC_FIELDS: Record<string, string[]> = {
    rect: ["x", "y", "width", "height"],
    circle: ["centerX", "centerY", "radius"],
    ellipsisArc: ["centerX", "centerY", "width", "height", "startAngle", "endAngle"],
    diamond: ["centerX", "centerY", "width", "height"],
    pencil: ["points"],
    arrow: ["startX", "startY", "endX", "endY", "arrowHeadSize"],
    line: ["points"],
    text: ["x", "y", "fontSize", "text"],
    image: ["x", "y", "width", "height", "imageData"],
    eraser: ["points", "strokeWidth"],
    stickyNote: ["x", "y", "width", "height", "noteColor", "text"],
    frame: ["x", "y", "width", "height", "name"],
};

/** Whether a value is a finite number (including within arrays of points). */
function isFiniteNumber(v: unknown): boolean {
    return typeof v === "number" && Number.isFinite(v);
}

/** Whether a value is an array of `[x, y]` finite pairs. */
function isPointArray(v: unknown): boolean {
    if (!Array.isArray(v)) return false;
    if (v.length === 0) return false;
    for (const p of v) {
        if (!Array.isArray(p) || p.length < 2) return false;
        if (!isFiniteNumber(p[0]) || !isFiniteNumber(p[1])) return false;
    }
    return true;
}

/**
 * Structural validation for a single shape.
 *
 * Checks the type discriminant, a finite non-empty `id` (string, no
 * whitespace, sane length), finite numeric geometry, and the per-type
 * required fields. Extra/unknown fields are tolerated so clients can
 * carry optional data; missing or malformed required fields are rejected.
 *
 * @param value - The untrusted value to check
 * @returns `true` if the shape satisfies the `Shape` structural contract
 */
export function isValidShape(value: unknown): value is Shape {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const s = value as Record<string, unknown>;
    if (typeof s.id !== "string" || s.id.length === 0 || s.id.length > 64) return false;
    if (/\s/.test(s.id)) return false;
    if (typeof s.type !== "string" || !SHAPE_TYPES.has(s.type)) return false;

    const required = NUMERIC_FIELDS[s.type];
    if (!required) return false;
    for (const field of required) {
        const v = s[field];
        if (field === "points") {
            if (!isPointArray(v)) return false;
        } else if (field === "startAngle" || field === "endAngle") {
            if (!isFiniteNumber(v)) return false;
        } else if (field === "text" || field === "name") {
            if (typeof v !== "string") return false;
        } else if (field === "noteColor" || field === "imageData") {
            if (typeof v !== "string") return false;
        } else {
            if (!isFiniteNumber(v)) return false;
        }
    }

    if (s.rotation !== undefined && !isFiniteNumber(s.rotation)) return false;
    return true;
}

/**
 * Filter an untrusted array down to valid shapes.
 *
 * Used by the WebSocket relay and snapshot endpoints; invalid entries
 * are dropped rather than poisoning the room state.
 *
 * @param values - Untrusted array from the wire
 * @returns Only the entries passing {@link isValidShape}
 */
export function filterValidShapes(values: unknown): Shape[] {
    if (!Array.isArray(values)) return [];
    const out: Shape[] = [];
    for (const v of values) {
        if (isValidShape(v)) out.push(v);
    }
    return out;
}