/**
 * PresentMode — fullscreen presentation mode using frames as slides.
 *
 * Navigates through frames with arrow keys or click.
 * Each slide shows the frame zoomed to fit the viewport.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Game } from "@/draw/Game";
import { Shape, getShapeBounds } from "@/draw/shapes";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function PresentMode({
    game,
    active,
    onClose,
}: {
    game: Game | undefined;
    active: boolean;
    onClose: () => void;
}) {
    const [slides, setSlides] = useState<Shape[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const wasActive = useRef(false);

    // Collect slides when entering present mode
    useEffect(() => {
        if (active && !wasActive.current && game) {
            const s = game.getSlides();
            setSlides(s);
            setCurrentIndex(0);
        }
        wasActive.current = active;
    }, [active, game]);

    // Draw the current slide on the canvas
    useEffect(() => {
        if (!active || !game || slides.length === 0) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const frame = slides[currentIndex];
        const vp = game.getSlideViewport(frame, canvas.width, canvas.height);

        // Get shapes inside the frame bounds
        const frameBounds = getShapeBounds(frame);
        if (!frameBounds) return;

        // Collect all shapes (frame + shapes inside it)
        const allShapes = game.getShapesForMinimap();

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = document.documentElement.classList.contains("dark") ? "#000000" : "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply viewport transform
        ctx.save();
        ctx.translate(vp.panX, vp.panY);
        ctx.scale(vp.zoom, vp.zoom);

        // Draw shapes that are inside or overlapping the frame
        for (const shape of allShapes) {
            const b = getShapeBounds(shape);
            if (!b) continue;

            // Check if shape overlaps with frame bounds (with some padding)
            const overlaps =
                b.x < frameBounds.x + frameBounds.w + 50 &&
                b.x + b.w > frameBounds.x - 50 &&
                b.y < frameBounds.y + frameBounds.h + 50 &&
                b.y + b.h > frameBounds.y - 50;

            if (overlaps && shape.id !== frame.id) {
                // Draw shape as simple filled rectangle for now
                const st = shape.style;
                if (st) {
                    ctx.fillStyle = st.backgroundColor !== "transparent" ? st.backgroundColor : st.strokeColor;
                    ctx.globalAlpha = st.opacity;
                } else {
                    ctx.fillStyle = "#ffffff";
                    ctx.globalAlpha = 1;
                }

                const sb = getShapeBounds(shape);
                if (sb) {
                    if (shape.type === "text") {
                        ctx.font = `${shape.fontSize || 14}px ${shape.fontFamily || "Arial"}`;
                        ctx.fillStyle = st?.strokeColor || "#ffffff";
                        ctx.fillText(shape.text, shape.x, shape.y);
                    } else if (shape.type === "rect" || shape.type === "stickyNote") {
                        ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
                    } else if (shape.type === "circle") {
                        ctx.beginPath();
                        ctx.ellipse(sb.x + sb.w / 2, sb.y + sb.h / 2, sb.w / 2, sb.h / 2, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.globalAlpha = 1;
            }
        }

        // Draw frame border
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2 / vp.zoom;
        ctx.strokeRect(frameBounds.x, frameBounds.y, frameBounds.w, frameBounds.h);

        // Draw frame label
        ctx.fillStyle = "#3b82f6";
        ctx.font = `bold ${16 / vp.zoom}px Arial`;
        ctx.fillText(frame.type === "frame" ? frame.name : `Slide ${currentIndex + 1}`, frameBounds.x + 10 / vp.zoom, frameBounds.y - 10 / vp.zoom);

        ctx.restore();
    }, [active, game, slides, currentIndex]);

    const navigate = useCallback((dir: 1 | -1) => {
        if (slides.length === 0) return;
        setCurrentIndex(prev => (prev + dir + slides.length) % slides.length);
    }, [slides.length]);

    useEffect(() => {
        if (!active) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                navigate(1);
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                navigate(-1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [active, onClose, navigate]);

    if (!active || slides.length === 0) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black">
            <canvas
                ref={canvasRef}
                width={window.innerWidth}
                height={window.innerHeight}
                className="w-full h-full"
            />

            {/* Navigation controls */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10">
                <button
                    onClick={() => navigate(-1)}
                    className="text-white/60 hover:text-white cursor-pointer p-1"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className="text-white/70 text-sm min-w-[60px] text-center">
                    {currentIndex + 1} / {slides.length}
                </span>
                <button
                    onClick={() => navigate(1)}
                    className="text-white/60 hover:text-white cursor-pointer p-1"
                >
                    <ChevronRight size={20} />
                </button>
                <div className="w-px h-4 bg-white/20" />
                <button
                    onClick={onClose}
                    className="text-white/60 hover:text-white cursor-pointer p-1"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Slide name */}
            <div className="fixed top-8 left-1/2 -translate-x-1/2 text-white/50 text-sm bg-black/40 backdrop-blur-sm rounded px-3 py-1">
                {slides[currentIndex]?.type === "frame" ? slides[currentIndex].name : `Slide ${currentIndex + 1}`}
            </div>
        </div>
    );
}
