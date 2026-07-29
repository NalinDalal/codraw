/**
 * Input handling utilities for text editing, shape movement, and clipboard.
 *
 * This module extracts the DOM-heavy input logic (textarea overlay for
 * text editing, shape offset calculations) out of the main Game class
 * to keep it focused on canvas coordination.
 *
 * @module inputHandler
 */

import { Shape } from "./shapes";

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
 * @param zoom - Current viewport zoom level
 * @param panX - Current viewport pan X
 * @param panY - Current viewport pan Y
 * @param isDark - Whether dark mode is active (determines text color)
 * @param existingText - Pre-filled text for editing existing shapes, or `undefined` for new text
 * @param existingIndex - Index in the shapes array if editing, or `undefined` for new text
 * @param callbacks - Game engine callbacks for committing/canceling the edit
 * @param shapes - Current shape array (cloned before mutation)
 * @returns The created textarea element, or `null` if creation failed
 */
export function startTextEdit(
    canvasX: number,
    canvasY: number,
    zoom: number,
    panX: number,
    panY: number,
    isDark: boolean,
    existingText: string | undefined,
    existingIndex: number | undefined,
    callbacks: TextEditCallbacks,
    shapes: Shape[],
): HTMLTextAreaElement | null {
    callbacks.setClicked(false);
    callbacks.removeTextOverlay();
    const screenX = canvasX * zoom + panX;
    const screenY = (canvasY - 16) * zoom + panY;
    const ta = document.createElement("textarea");
    ta.value = existingText ?? "";
    ta.style.cssText = `
      position: fixed;
      left: ${screenX}px;
      top: ${screenY}px;
      font: 20px Arial;
      color: ${isDark ? "white" : "black"};
      background: transparent;
      border: 1px dashed rgba(59,130,246,0.5);
      outline: none;
      padding: 2px;
      resize: none;
      overflow: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      min-width: 30px;
      min-height: 24px;
      z-index: 50;
      caret-color: ${isDark ? "white" : "black"};
    `;
    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        const text = ta.value.trim();
        ta.removeEventListener("blur", finish);
        callbacks.removeTextOverlay();
        if (!text) return;
        if (existingIndex !== undefined) {
            const prev = structuredClone(shapes);
            const shape = shapes[existingIndex];
            if (shape && shape.type === "text") {
                shape.text = text;
                callbacks.pushUndo(prev);
                callbacks.syncShapes();
            }
        } else {
            callbacks.commitShape({
                type: "text",
                x: canvasX,
                y: canvasY,
                text,
                fontSize: 20,
            });
        }
        callbacks.setClicked(false);
    };

    ta.addEventListener("blur", finish);
    ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            ta.removeEventListener("blur", finish);
            callbacks.removeTextOverlay();
            callbacks.setClicked(false);
        } else if (e.key === "Enter" && !e.shiftKey) {
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

/**
 * Apply a uniform offset to a shape copy (used after paste).
 *
 * Shifts all positional fields by `[offset, offset]` so pasted shapes
 * appear slightly offset from the originals.
 *
 * @param copy - A cloned shape to offset (mutated in place)
 * @param offset - Distance to shift in both X and Y directions
 */
export function offsetShapeCopy(copy: Shape, offset: number) {
    if (copy.type === "rect") {
        copy.x += offset;
        copy.y += offset;
    } else if (copy.type === "circle") {
        copy.centerX += offset;
        copy.centerY += offset;
    } else if (copy.type === "pencil") {
        copy.points = copy.points.map(([x, y]: [number, number]) => [x + offset, y + offset]);
    } else if (copy.type === "diamond") {
        copy.centerX += offset;
        copy.centerY += offset;
    } else if (copy.type === "arrow" || copy.type === "line") {
        copy.startX += offset;
        copy.startY += offset;
        copy.endX += offset;
        copy.endY += offset;
    } else if (copy.type === "text") {
        copy.x += offset;
        copy.y += offset;
    } else if (copy.type === "image") {
        copy.x += offset;
        copy.y += offset;
    }
}

/**
 * Move a shape by a delta in canvas coordinates.
 *
 * Adjusts all positional fields by `[dx, dy]`. Used during drag operations
 * and arrow-key nudging.
 *
 * @param shape - The shape to move (mutated in place)
 * @param dx - Horizontal displacement in canvas units
 * @param dy - Vertical displacement in canvas units
 */
export function moveShape(shape: Shape, dx: number, dy: number) {
    if (shape.type === "rect") {
        shape.x += dx;
        shape.y += dy;
    } else if (shape.type === "circle") {
        shape.centerX += dx;
        shape.centerY += dy;
    } else if (shape.type === "diamond") {
        shape.centerX += dx;
        shape.centerY += dy;
    } else if (shape.type === "pencil") {
        for (const pt of shape.points) {
            pt[0] += dx;
            pt[1] += dy;
        }
    } else if (shape.type === "arrow" || shape.type === "line") {
        shape.startX += dx;
        shape.startY += dy;
        shape.endX += dx;
        shape.endY += dy;
    } else if (shape.type === "text" || shape.type === "image") {
        shape.x += dx;
        shape.y += dy;
    } else if (shape.type === "eraser") {
        for (const pt of shape.points) {
            pt[0] += dx;
            pt[1] += dy;
        }
    }
}
