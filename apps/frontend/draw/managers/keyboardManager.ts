import type { GameContext } from "../gameContext";
import { createShortcutRegistry, type KeyboardManagerApi } from "./shortcutRegistry";

/**
 * Keyboard shortcut handling.
 *
 * Thin dispatcher over a data-driven shortcut registry. Global filters
 * (text edit overlay, input elements, view mode, crop mode) are applied
 * before the registry is consulted; individual shortcuts no longer
 * need to call `preventDefault()` themselves.
 */
export class KeyboardManager {
    private readonly shortcuts = createShortcutRegistry();

    private keyDownHandler = (e: KeyboardEvent) => {
        if (this.context.textManager.hasTextEditOverlay) return;

        const target = e.target as HTMLElement | null;
        if (
            target?.tagName === "INPUT" ||
            target?.tagName === "TEXTAREA" ||
            target?.isContentEditable
        ) {
            return;
        }

        if (this.context.viewMode) {
            const isNav =
                e.code === "Space" ||
                ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Escape"].includes(e.key) ||
                ((e.ctrlKey || e.metaKey) && ["0", "=", "+", "-"].includes(e.key)) ||
                (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && ["1", "2"].includes(e.key)) ||
                (e.altKey && !e.ctrlKey && !e.metaKey && ["z", "r", "s"].includes(e.key.toLowerCase()));
            if (!isNav) return;
        }

        if (this.context.cropMode) {
            if (e.key === "Enter") {
                e.preventDefault();
                this.context.cropMode = false;
                this.context.cropDragCorner = null;
                this.context.cropStartRect = null;
                this.api.clearCanvas();
            }
            return;
        }

        if (e.code === "Space") {
            e.preventDefault();
            this.api.setSpacePressed(true);
            return;
        }

        for (const shortcut of this.shortcuts) {
            if (shortcut.match(e, this.context)) {
                e.preventDefault();
                shortcut.action(this.context, this.api, e);
                return;
            }
        }
    };

    private keyUpHandler = (e: KeyboardEvent) => {
        if (e.code === "Space" && !this.context._handMode) {
            this.api.setSpacePressed(false);
        }
    };

    constructor(
        private context: GameContext,
        private api: KeyboardManagerApi,
    ) {}

    init() {
        window.addEventListener("keydown", this.keyDownHandler);
        window.addEventListener("keyup", this.keyUpHandler);
    }

    destroy() {
        window.removeEventListener("keydown", this.keyDownHandler);
        window.removeEventListener("keyup", this.keyUpHandler);
    }
}
