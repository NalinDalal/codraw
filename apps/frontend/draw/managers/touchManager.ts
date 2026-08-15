import { getShapeBounds } from "@repo/shapes";
import { hitTest } from "../renderer";
import type { GameContext } from "../gameContext";
import type { PointerInteractionManager } from "./pointerInteractionManager";
import type { TextManager } from "./textManager";

/** Capabilities the TouchManager needs from the owning Game instance. */
export interface TouchManagerApi {
    pointerInteractionManager: PointerInteractionManager;
    textManager: TextManager;
    startTextEdit(x: number, y: number, text: string | undefined, index: number | undefined, style: any): void;
    invalidateCache(): void;
    clearCanvas(): void;
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
            this.context.clicked = false;
            this.context.isDragging = false;
            this.context.isSelecting = false;
            const gesture = this.getTwoFingerCenter(e);
            if (gesture) {
                this.pinchStartDist = gesture.dist;
                this.pinchStartZoom = this.context.viewport.zoom;
                this.context.isPanning = true;
                this.context.panStartX = gesture.cx - this.context.viewport.panX;
                this.context.panStartY = gesture.cy - this.context.viewport.panY;
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
                    const shape = this.context.existingShapes[hit];
                    if (shape.type === "text") {
                        this.api.startTextEdit(shape.x, shape.y, shape.text, hit, {
                            bold: shape.bold,
                            italic: shape.italic,
                            fontFamily: shape.fontFamily,
                            fontSize: shape.fontSize,
                        });
                        return;
                    } else if (["rect", "circle", "diamond", "ellipsisArc", "stickyNote"].includes(shape.type)) {
                        const bounds = getShapeBounds(shape);
                        if (!bounds) return;
                        const centerX = bounds.x + bounds.w / 2;
                        const centerY = bounds.y + bounds.h / 2;
                        if (shape.boundTextId) {
                            const textShape = this.context.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
                            if (textShape) {
                                const ts = textShape as any;
                                const idx = this.context.existingShapes.indexOf(textShape);
                                this.api.startTextEdit(ts.x, ts.y, ts.text, idx, {
                                    bold: ts.bold,
                                    italic: ts.italic,
                                    fontFamily: ts.fontFamily,
                                    fontSize: ts.fontSize,
                                    textAlign: ts.textAlign || "left",
                                });
                                return;
                            } else {
                                delete shape.boundTextId;
                            }
                        }
                        this.api.textManager.pendingBoundTextContainerId = shape.id!;
                        this.api.startTextEdit(centerX, centerY, undefined, undefined, {
                            fontSize: 20,
                            textAlign: "center",
                        });
                        return;
                    }
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

        if (e.touches.length === 2 && this.context.isPanning) {
            const gesture = this.getTwoFingerCenter(e);
            if (gesture) {
                const scale = gesture.dist / this.pinchStartDist;
                const newZoom = Math.min(Math.max(this.pinchStartZoom * scale, 0.1), 10);
                this.context.viewport.zoom = newZoom;
                this.context.viewport.panX = gesture.cx - this.context.panStartX;
                this.context.viewport.panY = gesture.cy - this.context.panStartY;

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

        const wasPanning = this.context.isPanning;
        if (e.touches.length === 0 && wasPanning && e.changedTouches.length >= 2) {
            this.context.isPanning = false;
            return;
        }

        if (e.touches.length >= 1) return;

        this.context.isPanning = false;
        if (wasPanning) return;
        this.api.pointerInteractionManager.handlePointerUp(e as any);
    };

    /** Remove touch event listeners from the canvas */
    destroy(canvas: HTMLCanvasElement) {
        canvas.removeEventListener("touchstart", this.touchStartHandler);
        canvas.removeEventListener("touchmove", this.touchMoveHandler);
        canvas.removeEventListener("touchend", this.touchEndHandler);
        canvas.removeEventListener("touchcancel", this.touchEndHandler);
    }
}
