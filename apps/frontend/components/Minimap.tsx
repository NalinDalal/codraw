/**
 * Minimap — small overview navigator for large canvases.
 *
 * Renders a scaled-down view of all shapes with a viewport indicator.
 * Click or drag on the minimap to navigate the canvas.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Game } from "@/draw/Game";
import { Shape, getShapeBounds } from "@repo/shapes";

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

        // Clear
        ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
        ctx.fillStyle = "rgba(24, 28, 35, 0.92)";
        ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

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

            ctx.fillStyle = getShapeColor(s);
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

        ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(vx, vy, vw, vh);
        ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
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

    return (
        <div className={`fixed bottom-20 right-4 z-40 rounded-xl border border-border-subtle dark:border-border-subtle-dark overflow-hidden shadow-soft dark:shadow-soft-dark md:bottom-4`}>
            <canvas
                ref={canvasRef}
                width={MINIMAP_WIDTH}
                height={MINIMAP_HEIGHT}
                className="cursor-pointer"
                onMouseDown={handleMouseDown}
            />
        </div>
    );
}

/** Get a display color for a shape */
function getShapeColor(shape: Shape): string {
    if (shape.style?.strokeColor && shape.style.strokeColor !== "transparent") {
        return shape.style.strokeColor;
    }
    switch (shape.type) {
        case "rect": return "#ffffff";
        case "circle": return "#ffffff";
        case "diamond": return "#ffffff";
        case "arrow": return "#3b82f6";
        case "line": return "#3b82f6";
        case "text": return "#ffffff";
        case "pencil": return "#ffffff";
        case "stickyNote": return shape.noteColor;
        case "frame": return "#3b82f6";
        case "image": return "#a855f7";
        default: return "#ffffff";
    }
}
