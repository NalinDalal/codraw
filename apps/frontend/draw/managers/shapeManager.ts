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

/**
 * Shape lifecycle and transformation operations: creation commit, style
 * edits, grouping, z-ordering, alignment, distribution, flipping,
 * duplication, locking, and deletion.
 *
 * All operations mutate the shared shapes array in context and record an
 * undo entry; rendering and websocket sync happen through the injected
 * api so the manager stays pure shape logic.
 */
export class ShapeManager {
    private copiedStyle: Partial<ShapeStyle> | null = null;

    constructor(
        private context: GameContext,
        private api: ShapeManagerApi,
    ) {}

    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
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
            const shape = this.shapeById(id);
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
            const shape = this.shapeById(id);
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
            const shape = this.shapeById(id);
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
            const shape = this.shapeById(id);
            if (shape?.type === "frame") {
                shape.name = name;
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
        this.api.notifySelection();
    }

    /**
     * Group all selected shapes under a shared group ID.
     *
     * Grouped shapes are selected and moved together. The group ID is
     * a random UUID generated at group time.
     */
    group() {
        if (this.context.selectedIds.size < 2) return;
        const groupId = uuid();
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) shape.groupId = groupId;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Remove the group ID from all selected shapes.
     *
     * After ungrouping, each shape can be selected and moved independently.
     */
    ungroup() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (shape) delete shape.groupId;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Bring selected shapes forward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately above it
     * (higher index) in the shapes array. Shapes already at the top
     * remain unchanged.
     */
    bringForward() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const shapes = this.context.existingShapes;
        for (let i = shapes.length - 2; i >= 0; i--) {
            if (shapes[i].id && this.context.selectedIds.has(shapes[i].id!) && shapes[i + 1].id && !this.context.selectedIds.has(shapes[i + 1].id!)) {
                [shapes[i], shapes[i + 1]] = [shapes[i + 1], shapes[i]];
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Send selected shapes backward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately below it
     * (lower index) in the shapes array. Shapes already at the bottom
     * remain unchanged.
     */
    sendBackward() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const shapes = this.context.existingShapes;
        for (let i = 1; i < shapes.length; i++) {
            if (shapes[i].id && this.context.selectedIds.has(shapes[i].id!) && shapes[i - 1].id && !this.context.selectedIds.has(shapes[i - 1].id!)) {
                [shapes[i], shapes[i - 1]] = [shapes[i - 1], shapes[i]];
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Bring selected shapes to the front (top of z-order).
     *
     * Moves all selected shapes to the end of the shapes array,
     * so they are rendered last (on top of everything else).
     */
    bringToFront() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const selected = this.context.existingShapes.filter(s => s.id && this.context.selectedIds.has(s.id));
        const rest = this.context.existingShapes.filter(s => !s.id || !this.context.selectedIds.has(s.id));
        this.context.existingShapes = [...rest, ...selected];
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Send selected shapes to the back (bottom of z-order).
     *
     * Moves all selected shapes to the beginning of the shapes array,
     * so they are rendered first (behind everything else).
     */
    sendToBack() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const selected = this.context.existingShapes.filter(s => s.id && this.context.selectedIds.has(s.id));
        const rest = this.context.existingShapes.filter(s => !s.id || !this.context.selectedIds.has(s.id));
        this.context.existingShapes = [...selected, ...rest];
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the left edge of the leftmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its left edge matches the minimum left edge across all selections.
     */
    alignLeft() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let minX = Infinity;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            minX = Math.min(minX, bounds.x);
        }
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, minX - bounds.x, 0);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the right edge of the rightmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its right edge matches the maximum right edge across all selections.
     */
    alignRight() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let maxX = -Infinity;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            maxX = Math.max(maxX, bounds.x + bounds.w);
        }
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, maxX - (bounds.x + bounds.w), 0);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the horizontal center of the selection.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its center aligns with the average center X of all selections.
     */
    alignCenter() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let sumCenterX = 0;
        let count = 0;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            sumCenterX += bounds.x + bounds.w / 2;
            count++;
        }
        if (count === 0) return;
        const targetX = sumCenterX / count;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            const shapeCenterX = bounds.x + bounds.w / 2;
            moveShape(shape, targetX - shapeCenterX, 0);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Evenly space selected shapes horizontally.
     *
     * Requires at least 3 selected shapes. Sorts by X position, then
     * redistributes the shapes so the gaps between them are equal.
     * The leftmost and rightmost shapes stay in place.
     */
    distributeHorizontal() {
        if (this.context.selectedIds.size < 3) return;
        const prev = [...this.context.existingShapes];
        const selected = [];
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            selected.push({ shape, bounds });
        }
        if (selected.length < 3) return;
        selected.sort((a, b) => a.bounds.x - b.bounds.x);
        const totalWidth = (selected[selected.length - 1].bounds.x + selected[selected.length - 1].bounds.w) - selected[0].bounds.x;
        const totalShapesWidth = selected.reduce((sum, s) => sum + s.bounds.w, 0);
        const gap = (totalWidth - totalShapesWidth) / (selected.length - 1);
        let currentX = selected[0].bounds.x;
        for (const { shape, bounds } of selected) {
            const dx = currentX - bounds.x;
            moveShape(shape, dx, 0);
            currentX += bounds.w + gap;
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Evenly space selected shapes vertically.
     *
     * Requires at least 3 selected shapes. Sorts by Y position, then
     * redistributes the shapes so the gaps between them are equal.
     * The topmost and bottommost shapes stay in place.
     */
    distributeVertical() {
        if (this.context.selectedIds.size < 3) return;
        const prev = [...this.context.existingShapes];
        const selected = [];
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            selected.push({ shape, bounds });
        }
        if (selected.length < 3) return;
        selected.sort((a, b) => a.bounds.y - b.bounds.y);
        const totalHeight = (selected[selected.length - 1].bounds.y + selected[selected.length - 1].bounds.h) - selected[0].bounds.y;
        const totalShapesHeight = selected.reduce((sum, s) => sum + s.bounds.h, 0);
        const gap = (totalHeight - totalShapesHeight) / (selected.length - 1);
        let currentY = selected[0].bounds.y;
        for (const { shape, bounds } of selected) {
            const dy = currentY - bounds.y;
            moveShape(shape, 0, dy);
            currentY += bounds.h + gap;
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the top edge of the topmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its top edge matches the minimum top edge across all selections.
     */
    alignTop() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let minY = Infinity;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            minY = Math.min(minY, bounds.y);
        }
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, 0, minY - bounds.y);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the bottom edge of the bottommost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its bottom edge matches the maximum bottom edge across all selections.
     */
    alignBottom() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let maxY = -Infinity;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            maxY = Math.max(maxY, bounds.y + bounds.h);
        }
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            moveShape(shape, 0, maxY - (bounds.y + bounds.h));
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

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
            const shape = this.shapeById(id);
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
            const shape = this.shapeById(id);
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
            const shape = this.shapeById(id);
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
        return this.shapeById(first) ?? null;
    }
}