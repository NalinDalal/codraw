/**
 * Viewport transform for pan and zoom.
 *
 * Tracks the current pan offset and zoom level, and provides coordinate
 * conversion between screen (client) coordinates and canvas (world) coordinates.
 *
 * All drawing operations work in canvas coordinates; the viewport transforms
 * screen events into canvas space and applies the inverse when rendering.
 *
 * @module viewport
 */

import { Point, Bounds } from "./shapes";

/**
 * Manages pan and zoom state for the canvas viewport.
 *
 * Zoom is clamped to the range [0.1, 10]. Pan offsets are adjusted
 * during zoom operations to keep the zoom centered on the cursor.
 */
export class Viewport {
    /** Horizontal pan offset in screen pixels */
    panX = 0;
    /** Vertical pan offset in screen pixels */
    panY = 0;
    /** Current zoom level (1 = 100%, 0.1 = 10%, 10 = 1000%) */
    zoom = 1;

    /**
     * Convert screen (client) coordinates to canvas (world) coordinates.
     *
     * @param clientX - X position relative to the browser viewport
     * @param clientY - Y position relative to the browser viewport
     * @returns [x, y] in canvas coordinate space
     */
    getCanvasCoords(clientX: number, clientY: number): Point {
        return [
            (clientX - this.panX) / this.zoom,
            (clientY - this.panY) / this.zoom,
        ];
    }

    /**
     * Zoom in by a fixed factor (1.2×), centered on the canvas midpoint.
     *
     * @param canvasWidth - Width of the canvas element in pixels
     * @param canvasHeight - Height of the canvas element in pixels
     */
    zoomIn(canvasWidth: number, canvasHeight: number) {
        const newZoom = Math.min(this.zoom * 1.2, 10);
        this.panX =
            canvasWidth / 2 - ((canvasWidth / 2 - this.panX) * newZoom) / this.zoom;
        this.panY =
            canvasHeight / 2 -
            ((canvasHeight / 2 - this.panY) * newZoom) / this.zoom;
        this.zoom = newZoom;
    }

    /**
     * Zoom out by a fixed factor (÷1.2), centered on the canvas midpoint.
     *
     * @param canvasWidth - Width of the canvas element in pixels
     * @param canvasHeight - Height of the canvas element in pixels
     */
    zoomOut(canvasWidth: number, canvasHeight: number) {
        const newZoom = Math.max(this.zoom / 1.2, 0.1);
        this.panX =
            canvasWidth / 2 - ((canvasWidth / 2 - this.panX) * newZoom) / this.zoom;
        this.panY =
            canvasHeight / 2 -
            ((canvasHeight / 2 - this.panY) * newZoom) / this.zoom;
        this.zoom = newZoom;
    }

    /**
     * Handle mouse wheel events for zoom.
     *
     * Zooms in/out by 10% per wheel tick, centered on the cursor position.
     * The pan offset is adjusted so the point under the cursor stays fixed.
     *
     * @param e - The wheel event
     * @param canvasWidth - Width of the canvas element in pixels
     * @param canvasHeight - Height of the canvas element in pixels
     * @returns Always returns `true` (prevents default browser scroll)
     */
    handleWheel(
        e: WheelEvent,
        canvasWidth: number,
        canvasHeight: number,
    ): boolean {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(this.zoom * delta, 0.1), 10);

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
        this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
        this.zoom = newZoom;
        return true;
    }

    /**
     * Adjust zoom and pan so the given bounding box fits within the canvas
     * with padding. If the box is empty or null, resets to default state.
     *
     * @param bounds - The bounding box to fit (in canvas coordinates), or null
     * @param canvasWidth - Width of the canvas element in pixels
     * @param canvasHeight - Height of the canvas element in pixels
     * @param padding - Padding in pixels around the content (default 40)
     */
    zoomToFit(
        bounds: Bounds | null,
        canvasWidth: number,
        canvasHeight: number,
        padding = 40,
    ) {
        if (!bounds || (bounds.w === 0 && bounds.h === 0)) {
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
            return;
        }

        const availableWidth = canvasWidth - padding * 2;
        const availableHeight = canvasHeight - padding * 2;

        const zoomX = availableWidth / bounds.w;
        const zoomY = availableHeight / bounds.h;
        const newZoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.1), 10);

        this.zoom = newZoom;
        this.panX =
            canvasWidth / 2 - (bounds.x + bounds.w / 2) * newZoom;
        this.panY =
            canvasHeight / 2 - (bounds.y + bounds.h / 2) * newZoom;
    }

}
