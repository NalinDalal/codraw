export type Point = [number, number];

export interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Fill pattern used when a shape has a background color (Excalidraw parity). */
export type FillStyle = "solid" | "hachure" | "cross-hatch";

export interface ShapeStyle {
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    roughness: number;
    opacity: number;
    /**
     * Fill pattern applied over `backgroundColor`. Omitted on shapes
     * persisted before this field existed; treat as `"solid"`.
     */
    fillStyle?: FillStyle;
}

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
    | "frame"
    | "laser"
    | "constantPen";

export function defaultStyle(isDark = true): ShapeStyle {
    return {
        strokeColor: DEFAULT_STROKE,
        backgroundColor: isDark ? DEFAULT_FILL_DARK : DEFAULT_FILL_LIGHT,
        strokeWidth: 2,
        roughness: 1,
        opacity: 1,
        fillStyle: "solid",
    };
}

/** Sentinel value meaning "use the current theme's default stroke color". */
export const DEFAULT_STROKE = "__theme_default__";

/** Default hand-drawn fill: soft blue tint, theme-aware. */
export const DEFAULT_FILL_LIGHT = "#dbe7fb";
export const DEFAULT_FILL_DARK = "#2a3852";

/**
 * Resolve a shape's effective stroke color.
 *
 * If the shape uses {@link DEFAULT_STROKE}, returns the current theme's
 * default stroke. Otherwise returns the shape's explicit stroke color.
 */
export function resolveStrokeColor(style: ShapeStyle | undefined, isDark: boolean): string {
    const raw = style?.strokeColor ?? DEFAULT_STROKE;
    return raw === DEFAULT_STROKE ? (isDark ? "#e5e7eb" : "#1f2937") : raw;
}

export type CanvasBackground =
    | { type: "solid"; color: string }
    | { type: "dots"; color: string; dotSize: number; spacing: number }
    | { type: "crosses"; color: string; crossSize: number; spacing: number }
    | { type: "plain" };
