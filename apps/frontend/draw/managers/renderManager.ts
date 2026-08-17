import rough from "roughjs";
import { Shape, getShapeBounds } from "@repo/shapes";
import { renderShape, drawSelection } from "../renderer";
import { ImageCache } from "../imageCache";
import type { GameContext } from "../gameContext";

/** Capabilities the RenderManager needs from the owning Game instance. */
export interface RenderManagerApi {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    imageCache: ImageCache;
    getSelectedShape(): Shape | null;
    drawRemoteCursors(ctx: CanvasRenderingContext2D): void;
}

/**
 * Owns the off-screen scene cache and the main render pass.
 *
 * Shapes are rendered once into an off-screen cache canvas; `clearCanvas`
 * blits that cache to the visible canvas and overlays selection handles,
 * crop guides, the laser pointer, remote cursors, and alignment guides.
 * The expensive cache rebuild only runs when the cache is stale.
 */
export class RenderManager {
    private cacheCanvas: HTMLCanvasElement;
    private cacheCtx: CanvasRenderingContext2D;
    private cacheRc: ReturnType<typeof rough.canvas>;
    private cacheValid = false;

    constructor(
        private context: GameContext,
        private api: RenderManagerApi,
    ) {
        this.cacheCanvas = api.canvas.ownerDocument.createElement("canvas");
        this.cacheCanvas.width = api.canvas.width;
        this.cacheCanvas.height = api.canvas.height;
        this.cacheCtx = this.cacheCanvas.getContext("2d")!;
        this.cacheCtx.setTransform(this.context.dpr, 0, 0, this.context.dpr, 0, 0);
        this.cacheRc = rough.canvas(this.cacheCanvas);
    }

    /** Mark the scene cache as stale so the next render rebuilds it. */
    invalidateCache() {
        this.cacheValid = false;
    }

    /**
     * Draw the canvas background based on the current background style.
     *
     * Renders solid fill, dot grid, cross grid, or transparent (plain)
     * backgrounds. Dot and cross grids are offset by the current pan
     * position so they appear fixed relative to the canvas.
     *
     * @param ctx - Target canvas 2D context
     * @param width - Width of the area to fill
     * @param height - Height of the area to fill
     */
    private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const bg = this.context._background;
        if (bg.type === "solid") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
        } else if (bg.type === "dots") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
            const { dotSize = 1.5, spacing = 20 } = bg;
            const offsetX = ((this.context.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.context.viewport.panY % spacing) + spacing) % spacing;
            ctx.fillStyle = this.context.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
            for (let x = offsetX; x < width; x += spacing) {
                for (let y = offsetY; y < height; y += spacing) {
                    ctx.beginPath();
                    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else if (bg.type === "crosses") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
            const { crossSize, spacing = 20 } = bg;
            const offsetX = ((this.context.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.context.viewport.panY % spacing) + spacing) % spacing;
            ctx.strokeStyle = this.context.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
            ctx.lineWidth = 1;
            for (let x = offsetX; x < width; x += spacing) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = offsetY; y < height; y += spacing) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        } else if (bg.type === "plain") {
            ctx.clearRect(0, 0, width, height);
        }
    }

    /** Re-render all shapes to the off-screen cache canvas. */
    buildCache() {
        this.cacheCanvas.width = this.api.canvas.width;
        this.cacheCanvas.height = this.api.canvas.height;
        this.cacheCtx.setTransform(this.context.dpr, 0, 0, this.context.dpr, 0, 0);
        this.cacheCtx.clearRect(0, 0, this.context.cssWidth, this.context.cssHeight);
        this.drawBackground(this.cacheCtx, this.context.cssWidth, this.context.cssHeight);
        this.cacheCtx.save();
        this.cacheCtx.translate(this.context.viewport.panX, this.context.viewport.panY);
        this.cacheCtx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
        for (const shape of this.context.existingShapes) {
            renderShape(shape, this.cacheCtx, this.cacheRc, this.context.viewport.zoom, this.context.isDark, this.api.imageCache);
        }
        this.drawFrameHighlight();
        this.cacheCtx.restore();
        this.cacheValid = true;
    }

    /**
     * Draw a subtle highlight around shapes inside the selected frame.
     *
     * When a frame is selected, all non-frame shapes within its bounds
     * get a faint blue tint to visually group them with the frame.
     */
    private drawFrameHighlight() {
        const selected = this.api.getSelectedShape();
        if (!selected || selected.type !== "frame") return;
        const bounds = getShapeBounds(selected);
        if (!bounds) return;

        const zoom = this.context.viewport.zoom;
        this.cacheCtx.save();
        this.cacheCtx.strokeStyle = "rgba(59, 130, 246, 0.4)";
        this.cacheCtx.lineWidth = 1 / zoom;
        this.cacheCtx.setLineDash([4 / zoom, 4 / zoom]);

        for (const shape of this.context.existingShapes) {
            if (shape.type === "frame" || shape.id === selected.id) continue;
            const sb = getShapeBounds(shape);
            if (!sb) continue;
            if (sb.x >= bounds.x && sb.y >= bounds.y &&
                sb.x + sb.w <= bounds.x + bounds.w &&
                sb.y + sb.h <= bounds.y + bounds.h) {
                this.cacheCtx.strokeRect(sb.x, sb.y, sb.w, sb.h);
            }
        }
        this.cacheCtx.restore();
    }

    /**
     * Clear the canvas, rebuild the cache if needed, and draw selection handles.
     *
     * This is the main render method called after any state change. It:
     * 1. Clears the visible canvas
     * 2. Draws the background
     * 3. Copies the cached scene (rebuilding if stale)
     * 4. Draws selection handles and alignment guides
     */
    clearCanvas() {
        this.api.ctx.clearRect(0, 0, this.context.cssWidth, this.context.cssHeight);
        this.drawBackground(this.api.ctx, this.context.cssWidth, this.context.cssHeight);

        if (
            !this.cacheValid ||
            this.cacheCanvas.width !== this.api.canvas.width ||
            this.cacheCanvas.height !== this.api.canvas.height
        ) {
            this.buildCache();
        }
        this.api.ctx.save();
        this.api.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.api.ctx.drawImage(this.cacheCanvas, 0, 0);
        this.api.ctx.restore();
        drawSelection(this.api.ctx, this.context.existingShapes, this.context.selectedIds, this.context.viewport);

        if (this.context.cropMode && this.context.cropRect) {
            this.api.ctx.save();
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            const r = this.context.cropRect;
            this.api.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            this.api.ctx.fillRect(r.x, r.y, r.w, r.h);
            this.api.ctx.strokeStyle = "#3b82f6";
            this.api.ctx.lineWidth = 2 / this.context.viewport.zoom;
            this.api.ctx.setLineDash([6 / this.context.viewport.zoom, 4 / this.context.viewport.zoom]);
            this.api.ctx.strokeRect(r.x, r.y, r.w, r.h);
            this.api.ctx.setLineDash([]);
            const corners = [
                { x: r.x, y: r.y },
                { x: r.x + r.w, y: r.y },
                { x: r.x + r.w, y: r.y + r.h },
                { x: r.x, y: r.y + r.h },
            ];
            const handleSize = 8 / this.context.viewport.zoom;
            for (const c of corners) {
                this.api.ctx.fillStyle = "#3b82f6";
                this.api.ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
            }
            this.api.ctx.restore();
        }

        this.api.drawRemoteCursors(this.api.ctx);
        this.context.laserManager.drawLaserPointer(this.api.ctx);

        // Draw alignment guides
        if (this.context.alignmentGuides.length > 0) {
            this.api.ctx.save();
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            this.api.ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
            this.api.ctx.lineWidth = 1 / this.context.viewport.zoom;
            this.api.ctx.setLineDash([4 / this.context.viewport.zoom, 4 / this.context.viewport.zoom]);
            for (const guide of this.context.alignmentGuides) {
                if (guide.x !== undefined) {
                    this.api.ctx.beginPath();
                    this.api.ctx.moveTo(guide.x, 0);
                    this.api.ctx.lineTo(guide.x, this.context.cssHeight / this.context.viewport.zoom);
                    this.api.ctx.stroke();
                }
                if (guide.y !== undefined) {
                    this.api.ctx.beginPath();
                    this.api.ctx.moveTo(0, guide.y);
                    this.api.ctx.lineTo(this.context.cssWidth / this.context.viewport.zoom, guide.y);
                    this.api.ctx.stroke();
                }
            }
            this.api.ctx.setLineDash([]);
            this.api.ctx.restore();
        }
    }

    /**
     * Update the cache canvas transform after a DPR change.
     * Also invalidates the cache so the scene re-renders at the new scale.
     */
    updateDpr(dpr: number) {
        this.cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.invalidateCache();
    }
}