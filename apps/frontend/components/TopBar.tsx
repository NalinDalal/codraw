/**
 * Top bar for the canvas — lightweight floating clusters, not a navbar.
 *
 * Top-left: app menu + CoDraw mark + room name + live status.
 * Top-right: Share (primary), theme, help, and a More popover with
 * view options and extras (minimap, background, present, fullscreen,
 * libraries, mermaid, plugins, search, trash).
 *
 * The theme toggle preserves the existing behavior: flips the `dark`
 * class, persists to localStorage, and notifies the Game engine.
 */

"use client";

import { useState } from "react";
import {
    BookOpen,
    Copy,
    Grid3X3,
    HelpCircle,
    Layers,
    Maximize,
    Moon,
    MoreHorizontal,
    Pencil,
    Play,
    Plug,
    Search,
    Sun,
    Trash2,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";
import { AppMenu } from "./AppMenu";
import type { Game } from "@/draw/Game";

export function TopBar({
    roomName,
    game,
    onShowShortcuts,
    onShowLibraries,
    onShowMermaid,
    onShowPlugins,
    onShowSearch,
    onShowTrash,
    onPresent,
    onCycleBackground,
    showMinimap,
    onToggleMinimap,
}: {
    roomName: string;
    game: Game | undefined;
    onShowShortcuts: () => void;
    onShowLibraries: () => void;
    onShowMermaid: () => void;
    onShowPlugins: () => void;
    onShowSearch: () => void;
    onShowTrash: () => void;
    onPresent: () => void;
    onCycleBackground: () => void;
    showMinimap: boolean;
    onToggleMinimap: () => void;
}) {
    const [isDark, setIsDark] = useState(() =>
        typeof document !== "undefined"
            ? document.documentElement.classList.contains("dark")
            : true
    );
    const [copied, setCopied] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    const shareRoom = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard unavailable — nothing else to do.
        }
    };

    const menuItem = (
        label: string,
        icon: React.ReactNode,
        onClick: () => void,
        hint?: string,
    ) => (
        <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
        >
            {icon}
            <span className="flex-1">{label}</span>
            {hint && (
                <span className="font-mono text-[10px] text-muted-foreground/70">{hint}</span>
            )}
        </button>
    );

    return (
        <>
            <div className="fixed top-3 left-3 z-40 flex items-center gap-1 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-lg px-1 py-0.5">
                <AppMenu game={game} onShowShortcuts={onShowShortcuts} />
                <span className="flex items-center justify-center w-6 h-6 -rotate-6 border border-border rounded-md bg-background shrink-0">
                    <Pencil className="w-3 h-3 text-primary" />
                </span>
                <span className="font-mono text-sm font-semibold tracking-tight shrink-0 mr-1">
                    CoDraw
                </span>
                <span className="hidden md:block w-px h-4 bg-border" />
                <span className="hidden md:block font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                    {roomName}
                </span>
                <span className="hidden md:flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border border-border bg-background/60 font-mono text-[10px] text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    live
                </span>
            </div>

            <div className="fixed top-3 right-3 z-40 flex items-center gap-1 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-lg px-1 py-0.5">
                <Tooltip label={copied ? "Link copied" : "Share room link"} side="bottom">
                    <button
                        type="button"
                        onClick={shareRoom}
                        className="flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium transition-opacity duration-100 hover:opacity-90"
                    >
                        <Copy size={14} />
                        <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
                    </button>
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
                <Tooltip label="More options" side="bottom">
                    <IconButton
                        onClick={() => setMoreOpen((o) => !o)}
                        activated={moreOpen}
                        icon={<MoreHorizontal size={15} />}
                        label="More options"
                    />
                </Tooltip>
            </div>

            {moreOpen && (
                <PopoverPanel onClose={() => setMoreOpen(false)} className="right-3 top-14 w-52 py-1">
                    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        view
                    </p>
                    {menuItem(
                        showMinimap ? "Hide minimap" : "Show minimap",
                        <Layers size={14} />,
                        () => {
                            onToggleMinimap();
                            setMoreOpen(false);
                        },
                    )}
                    {menuItem(
                        "Background (B)",
                        <Grid3X3 size={14} />,
                        () => {
                            onCycleBackground();
                            setMoreOpen(false);
                        },
                    )}
                    {menuItem(
                        "Present mode",
                        <Play size={14} />,
                        () => {
                            onPresent();
                            setMoreOpen(false);
                        },
                    )}
                    {menuItem(
                        "Fullscreen",
                        <Maximize size={14} />,
                        () => {
                            void document.documentElement.requestFullscreen().catch(() => {});
                            setMoreOpen(false);
                        },
                    )}

                    <div className="my-1 border-t border-border" />

                    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        extras
                    </p>
                    {menuItem("Libraries", <BookOpen size={14} />, () => {
                        onShowLibraries();
                        setMoreOpen(false);
                    })}
                    {menuItem(
                        "Mermaid to diagram",
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>,
                        () => {
                            onShowMermaid();
                            setMoreOpen(false);
                        },
                    )}
                    {menuItem("Plugins", <Plug size={14} />, () => {
                        onShowPlugins();
                        setMoreOpen(false);
                    })}
                    {menuItem("Search shapes (Ctrl+F)", <Search size={14} />, () => {
                        onShowSearch();
                        setMoreOpen(false);
                    })}
                    {menuItem("Trash", <Trash2 size={14} />, () => {
                        onShowTrash();
                        setMoreOpen(false);
                    })}
                </PopoverPanel>
            )}
        </>
    );
}
