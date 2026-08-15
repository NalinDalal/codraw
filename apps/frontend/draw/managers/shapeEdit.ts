import { getShapeBounds, TextShape } from "@repo/shapes";
import type { GameContext } from "../gameContext";

/** Callbacks the shared shape editor needs from the owning manager. */
export interface ShapeEditApi {
    startTextEdit(x: number, y: number, text: string | undefined, index: number | undefined, style: any): void;
    syncShapes(): void;
    invalidateCache(): void;
    clearCanvas(): void;
    notifySelection(): void;
}

/**
 * Open the editor appropriate for a shape that was double-clicked/tapped.
 *
 * Text shapes open the inline text editor; arrow/frame shapes prompt for
 * a label/name; container shapes open the editor for their bound text (or
 * create one at the center); URL shapes open the link. Shared by mouse
 * double-click and touch double-tap so the behavior stays in one place.
 */
export function openShapeEditor(context: GameContext, hit: number, api: ShapeEditApi): void {
    const shape = context.existingShapes[hit];

    if (shape.type === "text") {
        api.startTextEdit(shape.x, shape.y, shape.text, hit, {
            bold: shape.bold,
            italic: shape.italic,
            fontFamily: shape.fontFamily,
            fontSize: shape.fontSize,
            textAlign: shape.textAlign || "left",
        });
        return;
    }

    if (shape.type === "arrow") {
        const label = prompt("Enter arrow label:", shape.label ?? "");
        if (label !== null) {
            const prev = structuredClone(context.existingShapes);
            shape.label = label || undefined;
            context.undoManager.push(prev, context.existingShapes);
            api.invalidateCache();
            api.clearCanvas();
            api.syncShapes();
        }
        return;
    }

    if (shape.type === "frame") {
        const name = prompt("Frame name:", shape.name ?? "");
        if (name !== null) {
            const prev = structuredClone(context.existingShapes);
            shape.name = name || `Frame ${context.existingShapes.filter(s => s.type === "frame").length + 1}`;
            context.undoManager.push(prev, context.existingShapes);
            api.invalidateCache();
            api.clearCanvas();
            api.syncShapes();
            api.notifySelection();
        }
        return;
    }

    if (["rect", "circle", "diamond", "ellipsisArc", "stickyNote"].includes(shape.type)) {
        const bounds = getShapeBounds(shape);
        if (!bounds) return;
        const centerX = bounds.x + bounds.w / 2;
        const centerY = bounds.y + bounds.h / 2;
        if (shape.boundTextId) {
            const textShape = context.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
            if (textShape) {
                const ts = textShape as TextShape;
                const idx = context.existingShapes.indexOf(textShape);
                api.startTextEdit(ts.x, ts.y, ts.text, idx, {
                    bold: ts.bold,
                    italic: ts.italic,
                    fontFamily: ts.fontFamily,
                    fontSize: ts.fontSize,
                    textAlign: ts.textAlign || "left",
                });
                return;
            }
            delete shape.boundTextId;
        }
        context.textManager.pendingBoundTextContainerId = shape.id!;
        api.startTextEdit(centerX, centerY, undefined, undefined, {
            fontSize: 20,
            textAlign: "center",
        });
        return;
    }

    if (shape.url) {
        window.open(shape.url, "_blank", "noopener,noreferrer");
    }
}