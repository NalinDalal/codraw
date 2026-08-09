/**
 * Top header for the canvas — a lightweight context layer, not a navbar.
 *
 * Left: app mark + room name (which canvas you're editing)
 * Center: presence indicator
 * Right: share, theme, and help (keyboard shortcuts)
 *
 * The theme toggle preserves the existing behavior: flips the `dark`
 * class, persists to localStorage, and notifies the Game engine.
 */

"use client";

import { useState } from "react";
import { Copy, HelpCircle, Moon, Pencil, Sun } from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import type { Game } from "@/draw/Game";

export function CanvasHeader({
    roomName,
    game,
    onShowShortcuts,
}: {
    roomName: string;
    game: Game | undefined;
    onShowShortcuts: () => void;
}) {
    const [isDark, setIsDark] = useState(() =>
        typeof document !== "undefined"
            ? document.documentElement.classList.contains("dark")
            : true
    );
    const [copied, setCopied] = useState(false);

    const shareRoom = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard unavailable — nothing else to do.
        }
    };

    return (
        <div className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-3 sm:px-4 h-12 border-b border-border bg-card/80 backdrop-blur-md">
            <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-6 h-6 -rotate-6 border border-border rounded-md bg-background shrink-0">
                    <Pencil className="w-3 h-3 text-primary" />
                </span>
                <span className="font-mono text-sm font-semibold tracking-tight shrink-0">
                    CoDraw
                </span>
                <span className="hidden sm:block w-px h-4 bg-border" />
                <span className="hidden sm:block font-mono text-xs text-muted-foreground truncate max-w-[240px]">
                    {roomName}
                </span>
            </div>

            <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-border bg-background/60 font-mono text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                live
            </span>

            <div className="flex items-center gap-1">
                <Tooltip label={copied ? "Link copied" : "Copy room link"} side="bottom">
                    <IconButton
                        onClick={shareRoom}
                        activated={false}
                        icon={<Copy size={15} />}
                        label={copied ? "Link copied" : "Copy room link"}
                    />
                </Tooltip>
                <Tooltip label={isDark ? "Light mode" : "Dark mode"} side="bottom">
                    <IconButton
                        onClick={() => {
                            const next = !document.documentElement.classList.contains("dark");
                            document.documentElement.classList.toggle("dark", next);
                            localStorage.setItem("theme", next ? "dark" : "light");
                            setIsDark(next);
                            game?.setTheme(next);
                        }}
                        activated={false}
                        icon={isDark ? <Sun size={15} /> : <Moon size={15} />}
                        label="Toggle theme"
                    />
                </Tooltip>
                <Tooltip label="Keyboard shortcuts (?)" side="bottom">
                    <IconButton
                        onClick={onShowShortcuts}
                        activated={false}
                        icon={<HelpCircle size={15} />}
                        label="Keyboard shortcuts"
                    />
                </Tooltip>
            </div>
        </div>
    );
}
