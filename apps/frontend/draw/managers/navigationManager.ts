import { getShapeBounds } from "@repo/shapes";
import type { Bounds, Point, Shape } from "@repo/shapes";
import type { GameContext } from "../gameContext";

/** Capabilities the NavigationManager needs from the owning Game instance. */
export interface NavigationManagerApi {
    notifySelection(): void;
    invalidateCache(): void;
    clearCanvas(): void;
}

/**
 * Viewport navigation, frame slides, and shape search.
 *
 * Owns zoom/pan commands, selection-based navigation, minimap viewport
 * queries, frame slides, and the canvas search index.
 */
export class NavigationManager {
    constructor(
        private context: GameContext,
        private api: NavigationManagerApi,
    ) {}

    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    /** All shapes visible on the minimap (eraser trails excluded). */
    getShapesForMinimap(): Shape[] {
        return this.context.existingShapes.filter(s => s.type !== "eraser");
    }

    /** Get the current viewport state for the minimap */
    getViewportState() {
        return {
            panX: this.context.viewport.panX,
            panY: this.context.viewport.panY,
            zoom: this.context.viewport.zoom,
            canvasWidth: this.context.cssWidth,
            canvasHeight: this.context.cssHeight,
        };
    }

    /** Navigate the viewport to center on a canvas coordinate */
    navigateTo(canvasX: number, canvasY: number) {
        this.context.viewport.panX = this.context.cssWidth / 2 - canvasX * this.context.viewport.zoom;
        this.context.viewport.panY = this.context.cssHeight / 2 - canvasY * this.context.viewport.zoom;
        this.context.textManager.syncTextOverlayPosition();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /** Search shapes by text content, arrow labels, or frame names */
    searchShapes(query: string): Shape[] {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return this.context.existingShapes.filter(s => {
            if (s.type === "text") return s.text.toLowerCase().includes(q);
            if (s.type === "arrow" && s.label) return s.label.toLowerCase().includes(q);
            if (s.type === "frame") return s.name.toLowerCase().includes(q);
            if (s.type === "stickyNote" && s.text) return s.text.toLowerCase().includes(q);
            return false;
        });
    }

    /** Select and zoom to a specific shape */
    selectAndZoomTo(shapeId: string) {
        this.context.selectedIds = new Set([shapeId]);
        this.api.notifySelection();
        const shape = this.shapeById(shapeId);
        if (shape) {
            const bounds = getShapeBounds(shape);
            if (bounds) {
                this.context.viewport.zoomToFit(bounds, this.context.cssWidth, this.context.cssHeight, 100);
                this.context.textManager.syncTextOverlayPosition();
                this.api.invalidateCache();
                this.api.clearCanvas();
            }
        }
    }

    /** Get all frames sorted by position (top-to-bottom, left-to-right) as slides */
    getSlides(): Shape[] {
        return this.context.existingShapes
            .filter(s => s.type === "frame" && !s.locked)
            .sort((a, b) => {
                if (a.type !== "frame" || b.type !== "frame") return 0;
                const dy = a.y - b.y;
                if (Math.abs(dy) > 50) return dy;
                return a.x - b.x;
            });
    }

    /** Get the viewport state needed to show a frame full-screen */
    getSlideViewport(frame: Shape, canvasWidth: number, canvasHeight: number): { panX: number; panY: number; zoom: number } {
        const bounds = getShapeBounds(frame);
        if (!bounds) return { panX: 0, panY: 0, zoom: 1 };
        const padding = 40;
        const availW = canvasWidth - padding * 2;
        const availH = canvasHeight - padding * 2;
        const zoomX = availW / bounds.w;
        const zoomY = availH / bounds.h;
        const zoom = Math.min(zoomX, zoomY, 2);
        return {
            zoom,
            panX: canvasWidth / 2 - (bounds.x + bounds.w / 2) * zoom,
            panY: canvasHeight / 2 - (bounds.y + bounds.h / 2) * zoom,
        };
    }

    /** Convert screen/client coordinates to canvas/world coordinates */
    screenToCanvas(clientX: number, clientY: number): Point {
        return this.context.viewport.getCanvasCoords(clientX, clientY);
    }

    /** Zoom in by a factor of 1.2x centered on the viewport */
    zoomIn() {
        this.context.viewport.zoomIn(this.context.cssWidth, this.context.cssHeight);
        this.context.textManager.syncTextOverlayPosition();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /** Zoom out by a factor of 1.2x centered on the viewport */
    zoomOut() {
        this.context.viewport.zoomOut(this.context.cssWidth, this.context.cssHeight);
        this.context.textManager.syncTextOverlayPosition();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /** Zoom and pan to fit all shapes within the viewport */
    zoomToFit() {
        const bounds = this.getAllShapesBounds();
        this.context.viewport.zoomToFit(bounds, this.context.cssWidth, this.context.cssHeight);
        this.context.textManager.syncTextOverlayPosition();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /** Reset zoom to 100% and center the viewport */
    resetZoom() {
        this.context.viewport.zoom = 1;
        this.context.viewport.panX = 0;
        this.context.viewport.panY = 0;
        this.context.textManager.syncTextOverlayPosition();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /** Select all shapes on the canvas */
    selectAll() {
        this.context.selectedIds = new Set(this.context.existingShapes.map(s => s.id).filter((id): id is string => id !== undefined));
        this.api.notifySelection();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /** Zoom and pan to fit the current selection within the viewport */
    zoomToSelection() {
        if (this.context.selectedIds.size === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (!shape) continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        if (minX === Infinity) return;
        this.context.viewport.zoomToFit(
            { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            this.context.cssWidth,
            this.context.cssHeight,
        );
        this.context.textManager.syncTextOverlayPosition();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /**
     * Compute the combined bounding box of all shapes on the canvas.
     *
     * Excludes eraser shapes. Used by {@link zoomToFit} to determine
     * the viewport transform that shows all content.
     *
     * @returns Combined bounding box, or `null` if no shapes exist
     */
    private getAllShapesBounds(): Bounds | null {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let hasShapes = false;

        for (const shape of this.context.existingShapes) {
            if (shape.type === "eraser") continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            hasShapes = true;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }

        if (!hasShapes) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
}