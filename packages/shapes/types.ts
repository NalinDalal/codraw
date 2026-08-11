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
        strokeColor: isDark ? "#e5e7eb" : "#000000",
        backgroundColor: "transparent",
        strokeWidth: 1.5,
        roughness: 0,
        opacity: 1,
        fillStyle: "solid",
    };
}

export type CanvasBackground =
    | { type: "solid"; color: string }
    | { type: "dots"; color: string; dotSize: number; spacing: number }
    | { type: "crosses"; color: string; crossSize: number; spacing: number }
    | { type: "plain" };
