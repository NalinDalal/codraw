/**
 * Right-side actions rail.
 *
 * Four visible actions: Share (primary), View options, Extras, and Help.
 * Secondary actions live inside compact popovers instead of cluttering
 * the canvas permanently:
 *
 * - View: minimap toggle, background cycle, present mode, fullscreen
 * - Extras: libraries, mermaid, plugins, search, trash
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
    MoreHorizontal,
    Play,
    Plug,
    Search,
    Trash2,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";

export function RightActions({
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
    const [viewOpen, setViewOpen] = useState(false);
    const [extrasOpen, setExtrasOpen] = useState(false);
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
        <div className="fixed top-16 right-3 z-40 hidden md:block">
            <div className="flex flex-col gap-0.5 p-1 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-lg">
                <Tooltip label={copied ? "Link copied" : "Share room link"} side="left">
                    <IconButton
                        onClick={shareRoom}
                        activated={false}
                        icon={<Copy size={16} />}
                        label={copied ? "Link copied" : "Share room link"}
                    />
                </Tooltip>

                <div className="my-1 border-t border-border" />

                <Tooltip label="View options" side="left">
                    <IconButton
                        onClick={() => setViewOpen((o) => !o)}
                        activated={viewOpen}
                        icon={<Layers size={16} />}
                        label="View options"
                    />
                </Tooltip>
                <Tooltip label="Extras" side="left">
                    <IconButton
                        onClick={() => setExtrasOpen((o) => !o)}
                        activated={extrasOpen}
                        icon={<MoreHorizontal size={16} />}
                        label="Extras (libraries, plugins, search, trash)"
                    />
                </Tooltip>

                <div className="my-1 border-t border-border" />

                <Tooltip label="Keyboard shortcuts (?)" side="left">
                    <IconButton
                        onClick={onShowShortcuts}
                        activated={false}
                        icon={<HelpCircle size={16} />}
                        label="Keyboard shortcuts"
                    />
                </Tooltip>
            </div>

            {viewOpen && (
                <PopoverPanel onClose={() => setViewOpen(false)} className="right-[3.25rem] top-0 w-48 py-1">
                    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        view
                    </p>
                    {menuItem(
                        showMinimap ? "Hide minimap" : "Show minimap",
                        <Layers size={14} />,
                        () => {
                            onToggleMinimap();
                            setViewOpen(false);
                        },
                    )}
                    {menuItem(
                        "Background (B)",
                        <Grid3X3 size={14} />,
                        () => {
                            onCycleBackground();
                            setViewOpen(false);
                        },
                    )}
                    {menuItem(
                        "Present mode",
                        <Play size={14} />,
                        () => {
                            onPresent();
                            setViewOpen(false);
                        },
                    )}
                    {menuItem(
                        "Fullscreen",
                        <Maximize size={14} />,
                        () => {
                            void document.documentElement.requestFullscreen().catch(() => {});
                            setViewOpen(false);
                        },
                    )}
                </PopoverPanel>
            )}

            {extrasOpen && (
                <PopoverPanel onClose={() => setExtrasOpen(false)} className="right-[3.25rem] top-0 w-48 py-1">
                    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        extras
                    </p>
                    {menuItem("Libraries", <BookOpen size={14} />, () => {
                        onShowLibraries();
                        setExtrasOpen(false);
                    })}
                    {menuItem(
                        "Mermaid to diagram",
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>,
                        () => {
                            onShowMermaid();
                            setExtrasOpen(false);
                        },
                    )}
                    {menuItem("Plugins", <Plug size={14} />, () => {
                        onShowPlugins();
                        setExtrasOpen(false);
                    })}
                    {menuItem("Search shapes (Ctrl+F)", <Search size={14} />, () => {
                        onShowSearch();
                        setExtrasOpen(false);
                    })}
                    {menuItem("Trash", <Trash2 size={14} />, () => {
                        onShowTrash();
                        setExtrasOpen(false);
                    })}
                </PopoverPanel>
            )}
        </div>
    );
}
