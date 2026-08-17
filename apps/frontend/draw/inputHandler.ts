/**
 * Input handling utilities for text editing, shape movement, and clipboard.
 *
 * This module extracts the DOM-heavy input logic (textarea overlay for
 * text editing, shape offset calculations) out of the main Game class
 * to keep it focused on canvas coordination.
 *
 * @module inputHandler
 */

import { Shape } from "@repo/shapes";
import { TEXTAREA_TEXT, TEXTAREA_FOCUS, pick } from "./colorSystem";

/**
 * Callbacks required by the text editing overlay.
 * These let {@link startTextEdit} interact with the Game engine
 * without importing it directly.
 */
export interface TextEditCallbacks {
    /** Remove the existing textarea overlay from the DOM */
    removeTextOverlay: () => void;
    /** Push the current shape state onto the undo stack before editing */
    pushUndo: (prev: Shape[]) => void;
    /** Sync the shape array to the canvas cache after editing */
    syncShapes: () => void;
    /** Commit a newly created text shape to the canvas */
    commitShape: (shape: Shape) => void;
    /** Set the "clicked" flag on the Game engine */
    setClicked: (v: boolean) => void;
    /** Invalidate the shape cache and redraw */
    invalidateAndRedraw?: () => void;
    /** Called when existing text is cleared (deleted) */
    onTextCleared?: (textIndex: number) => void;
    /** Called when text editing is cancelled (Escape) */
    onTextEditCancelled?: () => void;
    /**
     * Called with the final text instead of the normal shape commit/update
     * path. Used when editing non-text targets (arrow labels, frame names).
     */
    onCommit?: (text: string) => void;
}

export interface TextOverlayViewport {
    screenX: number;
    screenY: number;
    zoom: number;
}

export interface TextOverlayFont {
    weight: string;
    italic: string;
    family: string;
}

/**
 * Position, scale, and size the text editing overlay for the current viewport.
 *
 * The font is scaled by `1/zoom` relative to canvas units so the overlay text
 * visually matches the rendered shape at any zoom level, and the box grows
 * with its content (or the minimum scaled size).
 */
export function syncTextOverlay(
    ta: HTMLTextAreaElement,
    viewport: TextOverlayViewport,
    baseFontSize: number,
    font: TextOverlayFont,
) {
    const scale = viewport.zoom || 1;
    ta.style.left = `${viewport.screenX}px`;
    ta.style.top = `${viewport.screenY}px`;
    ta.style.font = `${font.italic}${font.weight}${baseFontSize * scale}px ${font.family}`;
    const minWidth = 30 * scale;
    const minHeight = 24 * scale;
    ta.style.minWidth = `${minWidth}px`;
    ta.style.minHeight = `${minHeight}px`;
    ta.style.width = `${Math.max(minWidth, ta.scrollWidth)}px`;
    ta.style.height = `${Math.max(minHeight, ta.scrollHeight)}px`;
}

export interface TextStyleOptions {
    bold?: boolean;
    italic?: boolean;
    fontFamily?: string;
    fontSize?: number;
    textAlign?: "left" | "center" | "right";
}

/**
 * Create and display an inline textarea overlay for text editing.
 *
 * Positions a transparent textarea over the canvas at the specified
 * coordinates, pre-filled with existing text (if editing) or empty
 * (if creating new text).
 *
 * The textarea handles:
 * - **Enter** (without Shift) — commit the text
 * - **Escape** — cancel the edit
 * - **Blur** — commit the text
 *
 * @param canvasX - X position in canvas coordinates
 * @param canvasY - Y position in canvas coordinates
 * @param screenX - X position in screen (client) coordinates
 * @param screenY - Y position in screen (client) coordinates
 * @param zoom - Current viewport zoom level
 * @param isDark - Whether dark mode is active (determines text color)
 * @param existingText - Pre-filled text for editing existing shapes, or `undefined` for new text
 * @param existingIndex - Index in the shapes array if editing, or `undefined` for new text
 * @param callbacks - Game engine callbacks for committing/canceling the edit
 * @param shapes - Current shape array (cloned before mutation)
 * @param textStyle - Formatting options for new text shapes
 * @returns The created textarea element, or `null` if creation failed
 */
export function startTextEdit(
    worldX: number,
    worldY: number,
    screenX: number,
    screenY: number,
    zoom: number,
    isDark: boolean,
    existingText: string | undefined,
    existingIndex: number | undefined,
    callbacks: TextEditCallbacks,
    shapes: Shape[],
    textStyle?: TextStyleOptions,
): HTMLTextAreaElement | null {
    callbacks.setClicked(false);
    callbacks.removeTextOverlay();
    const scale = zoom || 1;
    const size = textStyle?.fontSize || 20;
    const textAlign = textStyle?.textAlign || "left";
    const font: TextOverlayFont = {
        weight: textStyle?.bold ? "bold " : "",
        italic: textStyle?.italic ? "italic " : "",
        family: textStyle?.fontFamily || "Arial",
    };
    const ta = document.createElement("textarea");
    ta.value = existingText ?? "";
    ta.placeholder = existingText === undefined ? "Type here..." : "";
    const textAlignCss = textAlign === "center" ? "center" : textAlign === "right" ? "right" : "left";
    ta.style.cssText = `
      position: fixed;
      color: ${pick(TEXTAREA_TEXT, isDark)};
      background: transparent;
      border: 1.5px dashed ${pick(TEXTAREA_FOCUS, isDark)};
      outline: none;
      padding: 2px;
      resize: none;
      overflow: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      z-index: 50;
      caret-color: ${pick(TEXTAREA_TEXT, isDark)};
      text-align: ${textAlignCss};
    `;
    document.body.appendChild(ta);
    syncTextOverlay(ta, { screenX, screenY, zoom: scale }, size, font);
    ta.focus();
    ta.select();

    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        const text = ta.value.replace(/\s+$/, "");
        ta.removeEventListener("blur", finish);
        callbacks.removeTextOverlay();
        if (callbacks.onCommit) {
            callbacks.onCommit(text);
            callbacks.setClicked(false);
            return;
        }
        if (!text) {
            if (existingIndex !== undefined) {
                callbacks.onTextCleared?.(existingIndex);
            }
            return;
        }
        if (existingIndex !== undefined) {
            const prev = structuredClone(shapes);
            const shape = shapes[existingIndex];
            if (shape && shape.type === "text") {
                shape.text = text;
                shape.bold = !!font.weight;
                shape.italic = !!font.italic;
                callbacks.pushUndo(prev);
                callbacks.syncShapes();
            }
        } else {
            callbacks.commitShape({
                type: "text",
                x: worldX,
                y: worldY,
                text,
                fontSize: size,
                bold: !!font.weight,
                italic: !!font.italic,
                fontFamily: textStyle?.fontFamily,
                textAlign: textStyle?.textAlign || "left",
            });
        }
        callbacks.setClicked(false);
    };

    ta.addEventListener("blur", finish);
    ta.addEventListener("input", () => {
        ta.style.width = `${Math.max(30 * scale, ta.scrollWidth)}px`;
        ta.style.height = `${Math.max(24 * scale, ta.scrollHeight)}px`;
    });
    ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            ta.removeEventListener("blur", finish);
            callbacks.removeTextOverlay();
            callbacks.setClicked(false);
            callbacks.onTextEditCancelled?.();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
            e.preventDefault();
            font.weight = font.weight ? "" : "bold ";
            syncTextOverlay(ta, { screenX, screenY, zoom: scale }, size, font);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
            e.preventDefault();
            font.italic = font.italic ? "" : "italic ";
            syncTextOverlay(ta, { screenX, screenY, zoom: scale }, size, font);
            return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish();
        }
    });
    return ta;
}

/**
 * Remove the text editing textarea overlay from the DOM.
 *
 * Safe to call with `null` — simply returns in that case.
 *
 * @param textEditOverlay - The textarea element to remove, or `null`
 */
export function removeTextOverlayFn(textEditOverlay: HTMLTextAreaElement | null) {
    if (textEditOverlay) {
        textEditOverlay.remove();
    }
}
