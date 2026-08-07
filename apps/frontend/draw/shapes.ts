/**
 * 2D coordinate point as an [x, y] tuple.
 * Used for pencil stroke vertices and geometric calculations.
 */
export type Point = [number, number];

/**
  * All available drawing tools in the toolbar.
  * - `"select"` — Selection and move tool
  * - `"rect"` — Rectangle
  * - `"circle"` — Circle / ellipse
  * - `"diamond"` — Diamond / rhombus
  * - `"arrow"` — Arrow with configurable arrowhead
  * - `"line"` — Straight line
  * - `"text"` — Click-to-place text
  * - `"pencil"` — Freehand drawing
  * - `"image"` — Image insertion via file picker
  * - `"eraser"` — Erase intersecting shapes
  * - `"eyedropper"` — Pick a color from an existing shape on the canvas
  */
export type Tool =
    | "select"
    | "circle"
    | "rect"
    | "pencil"
    | "diamond"
    | "arrow"
    | "line"
    | "text"
    | "image"
    | "eraser"
    | "eyedropper"
    | "ellipsisArc"
    | "stickyNote"
    | "frame";

/**
 * Visual style properties applied to every shape.
 * Each shape carries its own style; the PropertiesPanel lets users edit these.
 */
export interface ShapeStyle {
    /** Stroke (outline) color as a hex string or `"transparent"` */
    strokeColor: string;
    /** Fill / background color as a hex string or `"transparent"` */
    backgroundColor: string;
    /** Stroke width in canvas units (0.5–8) */
    strokeWidth: number;
    /** Rough.js roughness value (0 = smooth, 1–5 = increasingly hand-drawn) */
    roughness: number;
    /** Opacity from 0.1 (10%) to 1.0 (100%) */
    opacity: number;
}

/**
 * Create a default shape style appropriate for the current theme.
 * @param isDark - Whether dark mode is active (determines default stroke color)
 * @returns A fresh {@link ShapeStyle} with neutral defaults
 */
export function defaultStyle(isDark = true): ShapeStyle {
    return {
        strokeColor: isDark ? "#ffffff" : "#000000",
        backgroundColor: "transparent",
        strokeWidth: 1.5,
        roughness: 0,
        opacity: 1,
    };
}

/**
 * Discriminated union of all shape types.
 *
 * Every variant shares common optional fields:
 * - `style?` — per-shape visual style
 * - `groupId?` — grouping identifier for multi-shape groups
 * - `id?` — unique ID assigned on commit (used for sync and undo)
 *
 * Shape variants:
 * - **rect** — axis-aligned rectangle by top-left corner + dimensions
 * - **circle** — circle by center + radius
 * - **pencil** — freehand stroke as an ordered list of points
 * - **diamond** — rhombus by center + width/height
 * - **arrow** — line segment with a triangular arrowhead
 * - **line** — simple line segment
 * - **text** — text label at a position with font size
 * **image** — embedded raster image with source data URL
 * - **eraser** — eraser stroke (used for hit-testing, not rendered)
 */
export type Shape =
    | {
        type: "rect";
        /** Top-left X coordinate */
        x: number;
        /** Top-left Y coordinate */
        y: number;
        /** Width (may be negative if drawn right-to-left) */
        width: number;
        /** Height (may be negative if drawn bottom-to-top) */
        height: number;
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
        type: "circle";
        /** Center X coordinate */
        centerX: number;
        /** Center Y coordinate */
        centerY: number;
        /** Radius in canvas units */
        radius: number;
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
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
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
        type: "pencil";
        /** Ordered list of [x, y] points forming the freehand stroke */
        points: Point[];
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
        type: "diamond";
        /** Center X coordinate */
        centerX: number;
        /** Center Y coordinate */
        centerY: number;
        /** Bounding-box width */
        width: number;
        /** Bounding-box height */
        height: number;
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
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
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
        type: "line";
        /** Start point X (legacy, kept for two-point lines) */
        startX: number;
        /** Start point Y (legacy, kept for two-point lines) */
        startY: number;
        /** End point X (legacy, kept for two-point lines) */
        endX: number;
        /** End point Y (legacy, kept for two-point lines) */
        endY: number;
        /** Ordered list of [x, y] points for multi-point lines */
        points?: Point[];
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
        type: "text";
        /** Text anchor X (baseline left) */
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
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
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
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
        type: "eraser";
        /** Points along the eraser path */
        points: Point[];
        /** Width of the eraser stroke */
        strokeWidth: number;
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
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
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    }
    | {
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
        style?: ShapeStyle;
        groupId?: string;
        id?: string;
        locked?: boolean;
        rotation?: number;
        /** Optional web link opened on double-click */
        url?: string;
    };

/**
 * Axis-aligned bounding box in canvas coordinates.
 */
export interface Bounds {
    /** Left edge X */
    x: number;
    /** Top edge Y */
    y: number;
    /** Width */
    w: number;
    /** Height */
    h: number;
}

/**
 * Describes the difference between two shape arrays for undo/redo.
 * Maps are keyed by shape ID for O(1) lookups.
 */
export interface ShapeDiff {
    /** Shapes present in the new state but not in the previous state */
    added: Map<string, Shape>;
    /** Shapes present in the previous state but not in the new state */
    removed: Map<string, Shape>;
    /** Shapes that exist in both states but differ */
    modified: Map<string, { prev: Shape; next: Shape }>;
}

/**
 * Ensure every shape in the array has a `style` property.
 * Shapes loaded from legacy data or external sources may lack a style;
 * this fills in {@link defaultStyle} for any that do.
 *
 * @param shapes - Array of shapes to normalize
 * @returns New array with all shapes guaranteed to have a style
 */
export function ensureShapesHaveStyle(shapes: Shape[]): Shape[] {
    return shapes.map((s) => {
        if (!s.style) {
            s.style = defaultStyle();
        }
        return s;
    });
}

/**
 * Compute the shortest distance from a point to a line segment.
 * Used for hit-testing pencil strokes, lines, and arrows.
 *
 * @param p - The test point
 * @param a - Start of the line segment
 * @param b - End of the line segment
 * @returns Distance in canvas units
 */
export function distToSegment(p: Point, a: Point, b: Point): number {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const apx = p[0] - a[0];
    const apy = p[1] - a[1];
    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) {
        return Math.sqrt(apx * apx + apy * apy);
    }
    let t = (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * abx;
    const cy = a[1] + t * aby;
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the axis-aligned bounding box for any shape.
 *
 * Handles all shape types including pencil/eraser strokes (which use
 * the bounding box of their point array) and text (estimated from
 * character count × font size).
 *
 * @param shape - The shape to measure
 * @returns Bounding box, or `null` if the shape has no renderable area
 *   (e.g. an empty pencil stroke)
 */
export function getShapeBounds(
    shape: Shape,
): Bounds | null {
    if (shape.type === "rect") {
        const x = Math.min(shape.x, shape.x + shape.width);
        const y = Math.min(shape.y, shape.y + shape.height);
        return { x, y, w: Math.abs(shape.width), h: Math.abs(shape.height) };
    } else if (shape.type === "circle") {
        return {
            x: shape.centerX - Math.abs(shape.radius),
            y: shape.centerY - Math.abs(shape.radius),
            w: Math.abs(shape.radius) * 2,
            h: Math.abs(shape.radius) * 2,
        };
    } else if (shape.type === "ellipsisArc") {
        return {
            x: shape.centerX - Math.abs(shape.width) / 2,
            y: shape.centerY - Math.abs(shape.height) / 2,
            w: Math.abs(shape.width),
            h: Math.abs(shape.height),
        };
    } else if (shape.type === "diamond") {
        return {
            x: shape.centerX - shape.width / 2,
            y: shape.centerY - shape.height / 2,
            w: shape.width,
            h: shape.height,
        };
    } else if (shape.type === "pencil" && shape.points.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of shape.points) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else if (shape.type === "arrow" || shape.type === "line") {
        if (shape.type === "line" && shape.points && shape.points.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of shape.points) {
                if (p[0] < minX) minX = p[0];
                if (p[1] < minY) minY = p[1];
                if (p[0] > maxX) maxX = p[0];
                if (p[1] > maxY) maxY = p[1];
            }
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        return {
            x: Math.min(shape.startX, shape.endX),
            y: Math.min(shape.startY, shape.endY),
            w: Math.abs(shape.endX - shape.startX),
            h: Math.abs(shape.endY - shape.startY),
        };
    } else if (shape.type === "text") {
        const textWidth = shape.text.length * (shape.fontSize * 0.6);
        return {
            x: shape.x,
            y: shape.y - shape.fontSize,
            w: textWidth,
            h: shape.fontSize,
        };
    } else if (shape.type === "image") {
        return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
    } else if (shape.type === "stickyNote") {
        return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
    } else if (shape.type === "frame") {
        return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
    } else if (shape.type === "eraser" && shape.points.length > 0) {
        const xs = shape.points.map((p) => p[0]);
        const ys = shape.points.map((p) => p[1]);
        return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys),
        };
    }
    return null;
}

/**
 * Canvas background style.
 *
 * - `"solid"` — A flat fill color (default for dark/light themes)
 * - `"dots"` — A grid of small dots at regular intervals
 * - `"crosses"` — A grid of small cross marks at regular intervals
 * - `"plain"` — No background (transparent)
 */
export type CanvasBackground =
    | { type: "solid"; color: string }
    | { type: "dots"; color: string; dotSize: number; spacing: number }
    | { type: "crosses"; color: string; crossSize: number; spacing: number }
    | { type: "plain" };

/** A named collection of shapes saved as a library item */
export interface LibraryItem {
    id: string;
    name: string;
    shapes: Shape[];
    createdAt: number;
}

/** A library containing multiple shape collections */
export interface Library {
    id: string;
    name: string;
    items: LibraryItem[];
    createdAt: number;
}
