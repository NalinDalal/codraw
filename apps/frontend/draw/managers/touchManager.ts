import { hitTest } from "../renderer";
import type { GameContext } from "../gameContext";
import type { PointerInteractionManager } from "./pointerInteractionManager";
import { openShapeEditor, ShapeEditApi } from "./shapeEdit";

/** Capabilities the TouchManager needs from the owning Game instance. */
export interface TouchManagerApi extends ShapeEditApi {
    pointerInteractionManager: PointerInteractionManager;
}

/**
 * Touch event handling for mobile/tablet interaction.
 *
 * Owns touch start/move/end handlers, pinch-zoom gesture state,
 * double-tap detection, and touch-position helpers. Single-touch
 * gestures delegate to the shared pointer interaction manager.
 */
export class TouchManager {
    private pinchStartDist = 0;
    private pinchStartZoom = 1;
    private lastTapTime = 0;

    constructor(
        private context: GameContext,
        private api: TouchManagerApi,
    ) {}

    /** Get the first touch/mouse position from a TouchEvent */
    getTouchPos(e: TouchEvent): { x: number; y: number } | null {
        const t = e.touches[0] || e.changedTouches[0];
        return t ? { x: t.clientX, y: t.clientY } : null;
    }

    /** Calculate the center point and distance between two touch points */
    getTwoFingerCenter(e: TouchEvent): { cx: number; cy: number; dist: number } | null {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        if (!t0 || !t1) return null;
        const cx = (t0.clientX + t1.clientX) / 2;
        const cy = (t0.clientY + t1.clientY) / 2;
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        return { cx, cy, dist: Math.sqrt(dx * dx + dy * dy) };
    }

    /** Handle touch start — pinch-zoom, double-tap text edit, or single-touch draw */
    touchStartHandler = (e: TouchEvent) => {
        if (e.touches.length > 2) return;

        if (e.touches.length === 2) {
            e.preventDefault();
            const pointer = this.api.pointerInteractionManager;
            pointer.clicked = false;
            pointer.isDragging = false;
            pointer.isSelecting = false;
            const gesture = this.getTwoFingerCenter(e);
            if (gesture) {
                this.pinchStartDist = gesture.dist;
                this.pinchStartZoom = this.context.viewport.zoom;
                pointer.isPanning = true;
                pointer.panStartX = gesture.cx - this.context.viewport.panX;
                pointer.panStartY = gesture.cy - this.context.viewport.panY;
            }
            return;
        }

        const pos = this.getTouchPos(e);
        if (!pos) return;

        const now = Date.now();
        if (now - this.lastTapTime < 300) {
            e.preventDefault();
            this.lastTapTime = 0;
            if (this.context.selectedTool === "select" && !this.context._locked) {
                const coords = this.context.viewport.getCanvasCoords(pos.x, pos.y);
                const lockedIds = new Set(this.context.existingShapes.filter(s => s.locked).map(s => s.id!));
                const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom, lockedIds);
                if (hit !== null) {
                    openShapeEditor(this.context, hit, this.api);
                    return;
                }
            }
            return;
        }
        this.lastTapTime = now;

        e.preventDefault();
        this.api.pointerInteractionManager.handlePointerDown(pos.x, pos.y, false, new MouseEvent("touchstart"));
    };

    /** Handle touch move — pinch-zoom pan or single-touch draw */
    touchMoveHandler = (e: TouchEvent) => {
        e.preventDefault();

        if (e.touches.length === 2 && this.api.pointerInteractionManager.isPanning) {
            const gesture = this.getTwoFingerCenter(e);
            if (gesture) {
                const scale = gesture.dist / this.pinchStartDist;
                const newZoom = Math.min(Math.max(this.pinchStartZoom * scale, 0.1), 10);
                this.context.viewport.zoom = newZoom;
                this.context.viewport.panX = gesture.cx - this.api.pointerInteractionManager.panStartX;
                this.context.viewport.panY = gesture.cy - this.api.pointerInteractionManager.panStartY;

                this.api.invalidateCache();
                this.api.clearCanvas();
            }
            return;
        }

        if (e.touches.length !== 1) return;
        const pos = this.getTouchPos(e);
        if (!pos) return;

        this.api.pointerInteractionManager.handlePointerMove(pos.x, pos.y, new MouseEvent("touchmove"));
    };

    /** Handle touch end — finalize drawing or end pan */
    touchEndHandler = (e: TouchEvent) => {
        e.preventDefault();

        const pointer = this.api.pointerInteractionManager;
        const wasPanning = pointer.isPanning;
        if (e.touches.length === 0 && wasPanning && e.changedTouches.length >= 2) {
            pointer.isPanning = false;
            return;
        }

        if (e.touches.length >= 1) return;

        pointer.isPanning = false;
        if (wasPanning) return;
        pointer.handlePointerUp(e as any);
    };

    /** Remove touch event listeners from the canvas */
    destroy(canvas: HTMLCanvasElement) {
        canvas.removeEventListener("touchstart", this.touchStartHandler);
        canvas.removeEventListener("touchmove", this.touchMoveHandler);
        canvas.removeEventListener("touchend", this.touchEndHandler);
        canvas.removeEventListener("touchcancel", this.touchEndHandler);
    }
}
