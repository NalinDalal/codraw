/**
 * Minimap — small overview navigator for large canvases.
 *
 * Renders a scaled-down view of all shapes with a viewport indicator.
 * Click or drag on the minimap to navigate the canvas.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Game } from "@/draw/Game";
import { Shape, getShapeBounds, resolveStrokeColor } from "@repo/shapes";
import { pick, SELECTION_OUTLINE, SELECTION_BAND_FILL, SELECTION_HANDLE, PRESENT_FALLBACK_FILL } from "@/draw/colorSystem";
import { SURFACE } from "./ui";
import { ChromeSlots } from "./chromeSlots";

const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;
const PADDING = 10;

/**
 * Minimap component showing a bird's eye view of the canvas.
 *
 * @param game - The Game engine instance
 */
export function Minimap({ game }: { game: Game | undefined }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !game) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const shapes = game.getShapesForMinimap();
        const vp = game.getViewportState();
        const isDark = game.isDark;

        // Clear to transparent — the glass surface behind the canvas shows through.
        ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

        if (shapes.length === 0) return;

        // Compute bounds of all shapes
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
        if (minX === Infinity) return;

        // Add padding to content bounds
        const contentW = maxX - minX || 1;
        const contentH = maxY - minY || 1;
        const drawW = MINIMAP_WIDTH - PADDING * 2;
        const drawH = MINIMAP_HEIGHT - PADDING * 2;
        const scale = Math.min(drawW / contentW, drawH / contentH);

        const offsetX = PADDING + (drawW - contentW * scale) / 2;
        const offsetY = PADDING + (drawH - contentH * scale) / 2;

        // Draw shapes as simple colored rectangles
        for (const s of shapes) {
            const b = getShapeBounds(s);
            if (!b) continue;
            const x = offsetX + (b.x - minX) * scale;
            const y = offsetY + (b.y - minY) * scale;
            const w = Math.max(b.w * scale, 2);
            const h = Math.max(b.h * scale, 2);

            ctx.fillStyle = getShapeColor(s, isDark);
            ctx.globalAlpha = 0.6;
            ctx.fillRect(x, y, w, h);
        }
        ctx.globalAlpha = 1;

        // Draw viewport indicator
        // Convert screen viewport to canvas coordinates
        const vpLeft = -vp.panX / vp.zoom;
        const vpTop = -vp.panY / vp.zoom;
        const vpWidth = vp.canvasWidth / vp.zoom;
        const vpHeight = vp.canvasHeight / vp.zoom;

        const vx = offsetX + (vpLeft - minX) * scale;
        const vy = offsetY + (vpTop - minY) * scale;
        const vw = vpWidth * scale;
        const vh = vpHeight * scale;

        ctx.strokeStyle = isDark ? SELECTION_OUTLINE.dark : SELECTION_OUTLINE.light;
        ctx.lineWidth = 1;
        ctx.strokeRect(vx, vy, vw, vh);
        ctx.fillStyle = isDark ? SELECTION_BAND_FILL.dark : SELECTION_BAND_FILL.light;
        ctx.fillRect(vx, vy, vw, vh);
    }, [game]);

    // Redraw on animation frame
    useEffect(() => {
        let raf: number;
        const loop = () => {
            draw();
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [draw]);

    const handleNavigate = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas || !game) return;
        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;

        const shapes = game.getShapesForMinimap();
        if (shapes.length === 0) return;

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
        if (minX === Infinity) return;

        const contentW = maxX - minX || 1;
        const contentH = maxY - minY || 1;
        const drawW = MINIMAP_WIDTH - PADDING * 2;
        const drawH = MINIMAP_HEIGHT - PADDING * 2;
        const scale = Math.min(drawW / contentW, drawH / contentH);
        const offsetX = PADDING + (drawW - contentW * scale) / 2;
        const offsetY = PADDING + (drawH - contentH * scale) / 2;

        // Convert minimap click to canvas coordinates
        const canvasX = minX + (mx - offsetX) / scale;
        const canvasY = minY + (my - offsetY) / scale;

        game.navigateTo(canvasX, canvasY);
    }, [game]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        setIsDragging(true);
        handleNavigate(e.clientX, e.clientY);
    }, [handleNavigate]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            const onMouseMove = (e: MouseEvent) => handleNavigate(e.clientX, e.clientY);
            window.addEventListener("mouseup", handleMouseUp);
            window.addEventListener("mousemove", onMouseMove);
            return () => {
                window.removeEventListener("mouseup", handleMouseUp);
                window.removeEventListener("mousemove", onMouseMove);
            };
        }
    }, [isDragging, handleMouseUp, handleNavigate]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            handleNavigate(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
    }, [handleNavigate]);

    return (
        <div className={`${ChromeSlots.bottomRight} z-40 ${SURFACE} p-1.5 overflow-hidden max-md:bottom-20 animate-panel-in`}>
            <canvas
                ref={canvasRef}
                width={MINIMAP_WIDTH}
                height={MINIMAP_HEIGHT}
                tabIndex={0}
                className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                onMouseDown={handleMouseDown}
                onKeyDown={handleKeyDown}
                role="button"
                aria-label="Canvas minimap — press Enter to jump to the center of your content"
                title="Click or drag to navigate"
            />
        </div>
    );
}

/** Get a display color for a shape (theme-aware fallbacks). */
function getShapeColor(shape: Shape, isDark: boolean): string {
    const resolved = resolveStrokeColor(shape.style, isDark);
    if (resolved && resolved !== "transparent") {
        return resolved;
    }
    const chip = pick(PRESENT_FALLBACK_FILL, isDark);
    const accent = pick(SELECTION_HANDLE, isDark);
    switch (shape.type) {
        case "rect": return chip;
        case "circle": return chip;
        case "diamond": return chip;
        case "arrow": return accent;
        case "line": return accent;
        case "text": return chip;
        case "pencil": return chip;
        case "stickyNote": return shape.noteColor ?? chip;
        case "frame": return accent;
        case "image": return pick(SELECTION_HANDLE, isDark);
        default: return chip;
    }
}
