export type Point = [number, number];

export interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface ShapeStyle {
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    roughness: number;
    opacity: number;
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
    };
}

export type CanvasBackground =
    | { type: "solid"; color: string }
    | { type: "dots"; color: string; dotSize: number; spacing: number }
    | { type: "crosses"; color: string; crossSize: number; spacing: number }
    | { type: "plain" };
