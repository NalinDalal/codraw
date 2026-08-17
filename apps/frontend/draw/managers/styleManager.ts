import { ShapeStyle, CanvasBackground, defaultStyle } from "@repo/shapes";
import { CANVAS_BG, pick } from "../colorSystem";
import type { GameContext } from "../gameContext";

/** Capabilities the StyleManager needs from the owning Game instance. */
export interface StyleManagerApi {
    invalidateCache(): void;
    clearCanvas(): void;
}

/**
 * Theme, drawing style, and canvas background state.
 *
 * Owns the theme-change callback and manages the current drawing style
 * and background configuration in the shared context. Theme switches
 * only retune defaults when the user has not customized style or
 * background.
 */
export class StyleManager {
    private themeChangeCallback: ((isDark: boolean) => void) | null = null;

    constructor(
        private context: GameContext,
        private api: StyleManagerApi,
    ) {}

    /** Register a callback fired when the theme changes. */
    setThemeChangeCallback(cb: (isDark: boolean) => void) {
        this.themeChangeCallback = cb;
    }

    /**
     * The default solid canvas background color for the active theme.
     * Matches the `--canvas-background` design token in globals.css so
     * the canvas and the app frame share the same environment color.
     */
    canvasBackgroundColor(): string {
        return pick(CANVAS_BG, this.context.isDark);
    }

    /**
     * Switch between dark and light theme.
     * Updates the default stroke color and canvas background (only when
     * the user has not customized the background) and re-renders.
     * Never modifies existing shapes or collaboration state.
     * @param isDark - `true` for dark mode, `false` for light
     */
    setTheme(isDark: boolean) {
        this.context.isDark = isDark;
        if (!this.context._styleCustomized) {
            this.context.currentStyle = defaultStyle(this.context.isDark);
        }
        if (!this.context._backgroundCustom && this.context._background.type === "solid") {
            this.context._background = { type: "dots", color: this.canvasBackgroundColor(), dotSize: 1.5, spacing: 20 };
        }
        this.themeChangeCallback?.(this.context.isDark);
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /**
     * Update the current drawing style (applied to newly created shapes).
     * @param style - The new default style
     */
    setCurrentStyle(style: ShapeStyle) {
        this.context.currentStyle = style;
        this.context._styleCustomized = JSON.stringify(style) !== JSON.stringify(defaultStyle(this.context.isDark));
    }

    getStyle(): ShapeStyle {
        return this.context.currentStyle;
    }

    /**
     * Cycle through the available background styles:
     * solid → dots → crosses → plain → solid
     */
    cycleBackground() {
        const bg = this.context._background;
        let next: CanvasBackground;
        if (bg.type === "solid") {
            next = { type: "dots", color: bg.color, dotSize: 3, spacing: 20 };
        } else if (bg.type === "dots") {
            next = { type: "crosses", color: bg.color, crossSize: 3, spacing: 20 };
        } else if (bg.type === "crosses") {
            next = { type: "plain" };
        } else {
            next = { type: "solid", color: this.canvasBackgroundColor() };
        }
        this.setBackground(next);
    }

    /**
     * Set the canvas background style.
     * Marks the background as user-customized so theme changes stop
     * tracking it (the user's chosen background wins over the theme).
     * @param background - The new background configuration
     */
    setBackground(background: CanvasBackground) {
        this.context._background = background;
        this.context._backgroundCustom = true;
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /**
     * Toggle between dark and light theme (Alt+Shift+D).
     *
     * Mirrors the TopBar toggle: flips the document class, persists the
     * preference, and re-syncs the engine's style defaults.
     */
    toggleTheme() {
        const next = !this.context.isDark;
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("theme", next ? "dark" : "light");
        this.setTheme(next);
    }
}
