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
import { SURFACE, MenuItem, Divider, Button, SectionLabel } from "./ui";
import { ChromeSlots } from "./chromeSlots";
import type { PresencePeer } from "@/draw/managers/cursorManager";
import type { Game } from "@/draw/Game";

/** Max peer avatars shown in the top bar before collapsing to "+N". */
const MAX_PEER_AVATARS = 4;

export function TopBar({
    roomName,
    game,
    peers,
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
    peers: PresencePeer[];
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
    const [isDark, setIsDark] = useState(() => {
        const stored =
            typeof localStorage !== "undefined"
                ? localStorage.getItem("theme")
                : null;
        return stored ? stored === "dark" : true;
    });
    const [copied, setCopied] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    const shareRoom = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            try {
                const textarea = document.createElement("textarea");
                textarea.value = window.location.href;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
            } catch {
                // Clipboard unavailable — nothing else to do.
            }
        }
    };

    return (
        <>
            <div className={`${ChromeSlots.topLeft} z-40 flex items-center gap-0.5 ${SURFACE} px-1 py-0.5 animate-fade-in`}>
                <AppMenu game={game} onShowShortcuts={onShowShortcuts} />
                <span className="flex items-center justify-center w-6 h-6 -rotate-6 rounded-md text-primary shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                </span>
                <span className="text-sm font-semibold tracking-tight shrink-0 mr-1">
                    CoDraw
                </span>
                <span className="hidden md:block w-px h-4 bg-border dark:bg-border-dark" />
                <span className="hidden md:block text-xs text-text-secondary dark:text-text-secondary-dark truncate max-w-[180px]">
                    {roomName}
                </span>
                <span className="hidden md:flex items-center gap-1.5 px-1.5 text-10 text-muted-foreground dark:text-muted-foreground-dark">
                    <span className="w-1.5 h-1.5 rounded-full bg-success dark:bg-success-dark animate-pulse motion-reduce:animate-none" />
                    live
                </span>
                <span className="hidden lg:flex items-center gap-0.5 ml-0.5">
                    {peers.slice(0, MAX_PEER_AVATARS).map((p) => (
                        <Tooltip key={p.userId} label={`${p.name}${p.isGuest ? " (guest)" : ""}`} side="bottom">
                            <span
                                className="flex items-center justify-center w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full text-[9px] font-semibold text-white ring-1 ring-black/10 cursor-default select-none"
                                style={{ backgroundColor: p.color }}
                            >
                                {(p.name || "?").charAt(0).toUpperCase()}
                            </span>
                        </Tooltip>
                    ))}
                    {peers.length > MAX_PEER_AVATARS && (
                        <Tooltip label={`${peers.length - MAX_PEER_AVATARS} more`} side="bottom">
                            <span className="flex items-center justify-center w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full text-[9px] font-semibold bg-muted dark:bg-muted-dark text-text-secondary dark:text-text-secondary-dark ring-1 ring-black/10 select-none">
                                +{peers.length - MAX_PEER_AVATARS}
                            </span>
                        </Tooltip>
                    )}
                </span>
            </div>

            <div className={`${ChromeSlots.topRight} z-40 flex items-center gap-0.5 ${SURFACE} px-1 py-0.5 animate-fade-in`}>
                <Tooltip label={copied ? "Link copied" : "Share room link"} side="bottom">
                    <Button variant="primary" onClick={shareRoom} className="my-1">
                        <Copy size={13} />
                        <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
                    </Button>
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
                <Tooltip label="Keyboard shortcuts" kbd="?" side="bottom">
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
                <PopoverPanel onClose={() => setMoreOpen(false)} className="right-3 top-14 w-52 py-1 origin-top-right">
                    <SectionLabel className="px-3 pt-2 pb-1 mb-0">view</SectionLabel>
                    <MenuItem
                        icon={<Layers size={14} />}
                        onClick={() => {
                            onToggleMinimap();
                            setMoreOpen(false);
                        }}
                    >
                        {showMinimap ? "Hide minimap" : "Show minimap"}
                    </MenuItem>
                    <MenuItem
                        icon={<Grid3X3 size={14} />}
                        hint="B"
                        onClick={() => {
                            onCycleBackground();
                            setMoreOpen(false);
                        }}
                    >
                        Background
                    </MenuItem>
                    <MenuItem
                        icon={<Play size={14} />}
                        onClick={() => {
                            onPresent();
                            setMoreOpen(false);
                        }}
                    >
                        Present mode
                    </MenuItem>
                    <MenuItem
                        icon={<Maximize size={14} />}
                        onClick={() => {
                            void document.documentElement.requestFullscreen().catch((err) => {
                                console.warn("Fullscreen request rejected", {
                                    error: err instanceof Error ? err.message : String(err),
                                });
                            });
                            setMoreOpen(false);
                        }}
                    >
                        Fullscreen
                    </MenuItem>

                    <Divider />

                    <SectionLabel className="px-3 pt-2 pb-1 mb-0">extras</SectionLabel>
                    <MenuItem icon={<BookOpen size={14} />} onClick={() => {
                        onShowLibraries();
                        setMoreOpen(false);
                    }}>
                        Libraries
                    </MenuItem>
                    <MenuItem
                        icon={
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                        }
                        onClick={() => {
                            onShowMermaid();
                            setMoreOpen(false);
                        }}
                    >
                        Mermaid to diagram
                    </MenuItem>
                    <MenuItem icon={<Plug size={14} />} onClick={() => {
                        onShowPlugins();
                        setMoreOpen(false);
                    }}>
                        Plugins
                    </MenuItem>
                    <MenuItem
                        icon={<Search size={14} />}
                        hint="Ctrl+F"
                        onClick={() => {
                            onShowSearch();
                            setMoreOpen(false);
                        }}
                    >
                        Search shapes
                    </MenuItem>
                    <MenuItem icon={<Trash2 size={14} />} onClick={() => {
                        onShowTrash();
                        setMoreOpen(false);
                    }}>
                        Trash
                    </MenuItem>
                </PopoverPanel>
            )}
        </>
    );
}
