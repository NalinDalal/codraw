/**
 * Single source of truth for colors drawn on <canvas>.
 *
 * Tailwind tokens (tailwind.config.ts) only reach DOM elements — canvas 2D
 * drawing reads literal values. Keep this file in sync with the token block
 * by value; never sprinkle raw canvas color literals elsewhere.
 *
 * Every theme-aware entry is a { light, dark } pair; read with `pick()`.
 */

export interface ThemePair {
    light: string;
    dark: string;
}

/** Pick the value for the current theme. */
export const pick = (pair: ThemePair, isDark: boolean) => (isDark ? pair.dark : pair.light);

/* ---- canvas surface + grid (mirrors `canvas`/`canvas-dark` tokens) ---- */

export const CANVAS_BG: ThemePair = { light: "rgb(250, 250, 250)", dark: "rgb(19, 18, 23)" };
export const GRID_DOT: ThemePair = { light: "rgba(0, 0, 0, 0.12)", dark: "rgba(255, 255, 255, 0.12)" };
export const GRID_CROSS: ThemePair = { light: "rgba(0, 0, 0, 0.12)", dark: "rgba(255, 255, 255, 0.12)" };

/* ---- default shape stroke (mirrors foreground-ish chroma per theme) ---- */

export const DEFAULT_STROKE: ThemePair = { light: "#000000", dark: "#e5e7eb" };

/* ---- selection chrome (mirrors `highlight` / `highlight-dark`) ---- */

export const SELECTION_OUTLINE: ThemePair = { light: "rgba(37, 99, 235, 0.85)", dark: "rgba(96, 165, 250, 0.9)" };
export const SELECTION_HANDLE: ThemePair = { light: "#2563eb", dark: "#60a5fa" };
export const SELECTION_LEVER: ThemePair = { light: "rgba(37, 99, 235, 0.85)", dark: "rgba(96, 165, 250, 0.9)" };
export const SELECTION_BAND_FILL: ThemePair = { light: "rgba(37, 99, 235, 0.06)", dark: "rgba(96, 165, 250, 0.08)" };
export const SELECTION_GUIDE: ThemePair = { light: "rgba(37, 99, 235, 0.5)", dark: "rgba(96, 165, 250, 0.5)" };
export const SELECTION_FAINT: ThemePair = { light: "rgba(37, 99, 235, 0.4)", dark: "rgba(96, 165, 250, 0.4)" };
export const TEXTAREA_FOCUS: ThemePair = { light: "rgba(37, 99, 235, 0.5)", dark: "rgba(96, 165, 250, 0.5)" };

/* ---- frame chrome ---- */

export const FRAME_LABEL_BG: ThemePair = { light: "#2563eb", dark: "#60a5fa" };
export const FRAME_LABEL_TEXT: ThemePair = { light: "#ffffff", dark: "#071120" };
export const FRAME_LABEL_TEXT_ON_COLOR = "#ffffff";
export const LINK_BADGE_BG: ThemePair = { light: "#2563eb", dark: "#60a5fa" };
export const LINK_BADGE_TEXT: ThemePair = { light: "#ffffff", dark: "#071120" };

/* ---- sticky notes (paper pastels — theme-independent by design) ---- */

export const STICKY_NOTES = ["#fff9b1", "#ff8a80", "#82b1ff", "#b9f6ca", "#ea80fc"] as const;
export const STICKY_TEXT = "#111318";
export const STICKY_SHADOW = "rgba(0, 0, 0, 0.2)";

/* ---- image placeholder ---- */

export const IMAGE_PLACEHOLDER_BG: ThemePair = { light: "rgba(0, 0, 0, 0.06)", dark: "rgba(255, 255, 255, 0.08)" };
export const IMAGE_PLACEHOLDER_BORDER: ThemePair = { light: "rgba(0, 0, 0, 0.12)", dark: "rgba(255, 255, 255, 0.18)" };
export const IMAGE_PLACEHOLDER_TEXT: ThemePair = { light: "rgba(0, 0, 0, 0.35)", dark: "rgba(255, 255, 255, 0.45)" };

/* ---- presence / overlays ---- */

/** Remote-cursor + spray-paint palette. Shared by Canvas.tsx auth + guest paths. */
export const CURSOR_PALETTE = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#84cc16",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#6366f1",
    "#a855f7",
    "#ec4899",
] as const;

export const LASER_DEFAULT = "#ef4444";
export const CURSOR_TEXT = "#ffffff";
export const LASER_RING = "#ffffff";
export const CROP_DIM = "rgba(0, 0, 0, 0.5)";

/* ---- export & present-mode backgrounds (must match what users see) ---- */

export const EXPORT_BG: ThemePair = { light: "rgb(250, 250, 250)", dark: "rgb(19, 18, 23)" };
export const PRESENT_SLIDE_BG: ThemePair = { light: "#ffffff", dark: "#17161c" };
export const PRESENT_FALLBACK_FILL: ThemePair = { light: "#fafafa", dark: "#17161c" };
export const PRESENT_FALLBACK_TEXT: ThemePair = { light: "#1f2937", dark: "rgba(255, 255, 255, 0.92)" };
export const TEXTAREA_TEXT: ThemePair = { light: "#000000", dark: "#ffffff" };