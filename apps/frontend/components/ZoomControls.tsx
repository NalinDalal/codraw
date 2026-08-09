/**
 * Compact zoom controls at the bottom center.
 *
 * [−] [100%] [+] — the percentage is clickable and resets to 100%.
 * Secondary view actions (fit to screen, reset view, fullscreen) live
 * behind a small overflow menu.
 */

"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Maximize, Minimize, Minus, Plus, Scan } from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";
import type { Game } from "@/draw/Game";

export function ZoomControls({
    game,
    canvasRef,
}: {
    game: Game | undefined;
    canvasRef: React.RefObject<HTMLDivElement | null>;
}) {
    const [zoom, setZoom] = useState(100);
    const [menuOpen, setMenuOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Poll the viewport so the percentage stays live while zooming.
    useEffect(() => {
        const sync = () => {
            const z = game?.getViewportState().zoom ?? 1;
            setZoom(Math.round(z * 100));
        };
        sync();
        const interval = setInterval(sync, 200);
        return () => clearInterval(interval);
    }, [game]);

    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            void document.exitFullscreen();
        } else {
            void canvasRef.current?.requestFullscreen();
        }
    };

    return (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 md:bottom-5">
            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-lg">
                <Tooltip label="Zoom out (−)" side="top">
                    <IconButton
                        onClick={() => game?.zoomOut()}
                        activated={false}
                        icon={<Minus size={14} />}
                        label="Zoom out"
                    />
                </Tooltip>
                <Tooltip label="Reset zoom to 100% (Ctrl+0)" side="top">
                    <button
                        type="button"
                        onClick={() => game?.resetZoom()}
                        className="min-w-[3.5rem] h-8 px-2 rounded-md font-mono text-xs text-muted-foreground transition-colors duration-100 hover:bg-secondary hover:text-foreground"
                    >
                        {zoom}%
                    </button>
                </Tooltip>
                <Tooltip label="Zoom in (+)" side="top">
                    <IconButton
                        onClick={() => game?.zoomIn()}
                        activated={false}
                        icon={<Plus size={14} />}
                        label="Zoom in"
                    />
                </Tooltip>
                <span className="w-px h-4 bg-border mx-0.5" />
                <Tooltip label="More view options" side="top">
                    <IconButton
                        onClick={() => setMenuOpen((o) => !o)}
                        activated={menuOpen}
                        icon={<ChevronDown size={14} />}
                        label="More view options"
                    />
                </Tooltip>
            </div>

            {menuOpen && (
                <PopoverPanel
                    onClose={() => setMenuOpen(false)}
                    className="left-1/2 -translate-x-1/2 bottom-[calc(100%+0.5rem)] w-44 py-1"
                >
                    <button
                        type="button"
                        onClick={() => {
                            game?.zoomToFit();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <Scan size={14} />
                        <span>Fit to screen (Shift+1)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.resetZoom();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <Maximize size={14} />
                        <span>Reset view (Ctrl+0)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            toggleFullscreen();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                        <span>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
                    </button>
                </PopoverPanel>
            )}
        </div>
    );
}
