import { Shape, Bounds, ShapeStyle, getShapeBounds } from "@repo/shapes";
import { uuid } from "@/lib/uuid";
import { moveShape, offsetShapeCopy } from "../inputHandler";
import type { GameContext } from "../gameContext";

/** Capabilities the ShapeManager needs from the owning Game instance. */
export interface ShapeManagerApi {
    syncShapes(): void;
    notifySelection(): void;
    flushAutoSave(): void;
    invalidateCache(): void;
    clearCanvas(): void;
    setTool(tool: string): void;
}

export function shapeById(context: GameContext, id: string): Shape | undefined {
    return context.existingShapes.find((s) => s.id === id) ?? context.trash.find((s) => s.id === id);
}

/**
 * Shape creation, deletion, duplication, metadata updates, and style edits.
 *
 * All operations mutate the shared shapes array in context and record an
 * undo entry; rendering and websocket sync happen through the injected
 * api so the manager stays pure shape logic.
 */
export class ShapeLifecycle {
    protected findShape(id: string): Shape | undefined {
        return shapeById(this.context, id);
    }

    /** Get bounds for multiple shapes (for positioning loaded items) */
    getMultipleBounds(shapes: Shape[]): Bounds | null {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of shapes) {
            const b = getShapeBounds(s);
            if (b) {
                if (b.x < minX) minX = b.x;
                if (b.y < minY) minY = b.y;
                if (b.x + b.w > maxX) maxX = b.x + b.w;
                if (b.y + b.h > maxY) maxY = b.y + b.h;
            }
        }
        if (minX === Infinity) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /**
     * Update the style properties of all currently selected shapes.
     *
     * Applies the given partial style updates to each selected shape's
     * style object. Shapes without a style get a default applied first.
     *
     * @param updates - Partial style properties to merge into each shape's style
     */
    updateShapeStyle(updates: Partial<ShapeStyle>) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = this.findShape(id);
            if (!shape) continue;
            if (!shape.style) shape.style = { ...this.context.currentStyle };
            Object.assign(shape.style, updates);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    commitShape(shape: Shape, autoSwitchToSelect = false) {
        shape.id = uuid();
        if (!shape.style) {
            shape.style = { ...this.context.currentStyle };
        }
        const prev = [...this.context.existingShapes];
        this.context.existingShapes.push(shape);
        if (this.context.textManager.pendingBoundTextContainerId && shape.type === "text") {
            const container = this.context.existingShapes.find(s => s.id === this.context.textManager.pendingBoundTextContainerId);
            if (container) {
                container.boundTextId = shape.id;
            }
            this.context.textManager.pendingBoundTextContainerId = null;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
        if (autoSwitchToSelect && !this.context.stayAfterDraw && !this.context._locked) {
            this.api.setTool("select");
        }
    }

    /**
     * Delete all selected shapes from the canvas.
     *
     * Skips locked shapes — they cannot be deleted. Moves deleted shapes
     * to the trash so they can be restored later. Pushes the change
     * to the undo stack and syncs via WebSocket.
     */
    deleteSelectedShape() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const idsToRemove = new Set(this.context.selectedIds);
        const deleted: Shape[] = [];
        this.context.existingShapes = this.context.existingShapes.filter((s) => {
            if (!idsToRemove.has(s.id!)) return true;
            if (s.locked) return true;
            deleted.push(structuredClone(s));
            if (s.boundTextId) {
                idsToRemove.add(s.boundTextId);
            }
            return false;
        });
        this.context.existingShapes = this.context.existingShapes.filter((s) => {
            if (!idsToRemove.has(s.id!)) return true;
            if (s.locked) return true;
            deleted.push(structuredClone(s));
            return false;
        });
        for (const s of this.context.existingShapes) {
            if (s.boundTextId && idsToRemove.has(s.boundTextId)) {
                delete s.boundTextId;
            }
        }
        if (deleted.length > 0) {
            this.context.trash.push(...deleted);
            this.api.flushAutoSave();
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.context.selectedIds.clear();
        this.api.notifySelection();
        this.api.syncShapes();
        this.context.historyManager.notifyTrashChange();
    }

    /**
     * Duplicate selected shapes with a 20px offset.
     *
     * Unlike paste, this immediately commits the copies and selects them,
     * so the user can continue editing without a separate paste step.
     */
    duplicateSelected() {
        if (this.context.selectedIds.size === 0) return;
        const offset = 20;
        const prev = [...this.context.existingShapes];
        const newIds: string[] = [];
        for (const id of this.context.selectedIds) {
            const shape = this.findShape(id);
            if (!shape) continue;
            const copy = JSON.parse(JSON.stringify(shape)) as Shape;
            offsetShapeCopy(copy, offset);
            delete copy.groupId;
            copy.id = uuid();
            if (!copy.style) copy.style = { ...this.context.currentStyle };
            this.context.existingShapes.push(copy);
            newIds.push(copy.id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.context.selectedIds = new Set(newIds);
        this.api.notifySelection();
        this.api.syncShapes();
    }

    /**
     * Assign a web URL to all selected shapes.
     * @param url - The web URL to attach, or empty string to clear
     */
    setShapeUrl(url: string) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = this.findShape(id);
            if (shape) shape.url = url || undefined;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Rename the selected frame shape.
     *
     * @param name - New name for the frame
     */
    setFrameName(name: string) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = this.findShape(id);
            if (shape?.type === "frame") {
                shape.name = name;
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
        this.api.notifySelection();
    }

    constructor(
        protected context: GameContext,
        protected api: ShapeManagerApi,
    ) {}
}
