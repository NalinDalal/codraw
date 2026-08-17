import { Shape, getShapeBounds } from "@repo/shapes";
import { shapeById, type ShapeManagerApi } from "./shapeLifecycle";
import type { GameContext } from "../gameContext";

/**
 * Shape styling operations: flip, lock/unlock, copy/paste style.
 *
 * All operations mutate the shared shapes array in context and record an
 * undo entry; rendering and websocket sync happen through the injected
 * api so the manager stays pure shape logic.
 */
export class ShapeStyleManager {
    private copiedStyle: Partial<import("@repo/shapes").ShapeStyle> | null = null;

    /**
     * Flip all selected shapes horizontally or vertically in place.
     *
     * Shapes are mirrored around the center of their own bounding box
     * (point-based shapes mirror their points, box-based shapes mirror
     * their origin). Bound to Shift+H / Shift+V.
     *
     * @param horizontal - `true` to flip left-right, `false` top-bottom
     */
    flipSelectedShapes(horizontal: boolean) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape || shape.locked) continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            if (horizontal) {
                if (shape.type === "arrow") {
                    shape.startX = 2 * cx - shape.startX;
                    shape.endX = 2 * cx - shape.endX;
                } else if ((shape.type === "line" || shape.type === "pencil") && shape.points) {
                    for (const p of shape.points) p[0] = 2 * cx - p[0];
                    if (shape.type === "line") {
                        shape.startX = 2 * cx - shape.startX;
                        shape.endX = 2 * cx - shape.endX;
                    }
                } else if (shape.type === "rect" || shape.type === "image" || shape.type === "stickyNote" || shape.type === "frame") {
                    shape.x = 2 * cx - shape.x - shape.width;
                }
            } else {
                if (shape.type === "arrow") {
                    shape.startY = 2 * cy - shape.startY;
                    shape.endY = 2 * cy - shape.endY;
                } else if ((shape.type === "line" || shape.type === "pencil") && shape.points) {
                    for (const p of shape.points) p[1] = 2 * cy - p[1];
                    if (shape.type === "line") {
                        shape.startY = 2 * cy - shape.startY;
                        shape.endY = 2 * cy - shape.endY;
                    }
                } else if (shape.type === "rect" || shape.type === "image" || shape.type === "stickyNote" || shape.type === "frame") {
                    shape.y = 2 * cy - shape.y - shape.height;
                }
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Lock selected shapes so they cannot be moved or edited.
     *
     * Locked shapes are skipped by hit-testing, drag operations,
     * and deletion. They remain visible on the canvas.
     */
    lockShapes() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (shape) shape.locked = true;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Unlock selected shapes so they can be moved and edited again.
     *
     * Removes the `locked` flag from each selected shape, making them
     * eligible for hit-testing, dragging, and deletion.
     */
    unlockShapes() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (shape) delete shape.locked;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Copy the style of the first selected shape for pasting onto others.
     * Bound to Ctrl/Cmd+Alt+C.
     */
    copySelectedStyles() {
        const shape = this.getSelectedShape();
        if (!shape || !shape.style) return;
        this.copiedStyle = { ...shape.style };
    }

    /**
     * Apply the previously copied style to all selected shapes.
     * Bound to Ctrl/Cmd+Alt+V.
     */
    pasteSelectedStyles() {
        if (!this.copiedStyle) return;
        this.updateShapeStyle({ ...this.copiedStyle });
    }

    private getSelectedShape(): Shape | null {
        if (this.context.selectedIds.size === 0) return null;
        const first = [...this.context.selectedIds][0];
        return shapeById(this.context, first) ?? null;
    }

    private updateShapeStyle(updates: Partial<import("@repo/shapes").ShapeStyle>) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            if (!shape.style) shape.style = { ...this.context.currentStyle };
            Object.assign(shape.style, updates);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    constructor(
        protected context: GameContext,
        protected api: ShapeManagerApi,
    ) {}
}
