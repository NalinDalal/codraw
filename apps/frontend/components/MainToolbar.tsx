/**
 * Main tool bar — compact horizontal strip floating at the top center.
 *
 * Answers "what am I doing?" — the primary drawing tools live here with
 * icons only (tooltips carry the label + keyboard shortcut). Secondary
 * tools, arrange actions, and the render-mode toggle sit behind a
 * "More" popover so the bar stays small.
 *
 * On small screens this bar is hidden; the {@link MobileToolDock} takes
 * over instead.
 */

"use client";

import { useState } from "react";
import {
    AlignLeft,
    AlignHorizontalJustifyCenter,
    AlignRight,
    ArrowLeftRight,
    ArrowUpDown,
    Lock,
    MoreHorizontal,
    Unlock,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";
import { CORE_TOOLS, MORE_TOOLS } from "./canvasTools";
import type { Game } from "@/draw/Game";

export function MainToolbar({
    selectedTool,
    handMode,
    onSelectTool,
    onToggleHand,
    game,
}: {
    selectedTool: string;
    handMode: boolean;
    onSelectTool: (tool: string) => void;
    onToggleHand: () => void;
    game: Game | undefined;
}) {
    const [moreOpen, setMoreOpen] = useState(false);

    const isActive = (tool: string) =>
        tool === "hand" ? handMode : selectedTool === tool;

    const handleTool = (tool: string) => {
        if (tool === "hand") {
            onToggleHand();
        } else {
            onSelectTool(tool);
        }
        setMoreOpen(false);
    };

    return (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 hidden md:block">
            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-soft">
                {CORE_TOOLS.map((tool) => (
                    <Tooltip
                        key={tool.id}
                        label={
                            tool.shortcut
                                ? `${tool.label} (${tool.shortcut})`
                                : tool.label
                        }
                        side="bottom"
                    >
                        <IconButton
                            onClick={() => handleTool(tool.id)}
                            activated={isActive(tool.id)}
                            icon={tool.icon}
                            label={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                        />
                    </Tooltip>
                ))}

                <span className="w-px h-5 bg-border mx-0.5" />

                <Tooltip label="More tools" side="bottom">
                    <IconButton
                        onClick={() => setMoreOpen((o) => !o)}
                        activated={moreOpen}
                        icon={<MoreHorizontal size={16} />}
                        label="More tools"
                    />
                </Tooltip>
            </div>

            {moreOpen && (
                <PopoverPanel
                    onClose={() => setMoreOpen(false)}
                    className="left-1/2 -translate-x-1/2 top-[calc(100%+0.5rem)] w-56 py-1"
                >
                    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        shapes
                    </p>
                    {MORE_TOOLS.map((tool) => (
                        <button
                            key={tool.id}
                            type="button"
                            onClick={() => handleTool(tool.id)}
                            aria-pressed={isActive(tool.id)}
                            className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                isActive(tool.id)
                                    ? "text-foreground ring-1 ring-inset ring-primary/40"
                                    : "text-muted-foreground"
                            }`}
                        >
                            <span className="flex items-center justify-center w-4">{tool.icon}</span>
                            <span className="flex-1">{tool.label}</span>
                            {tool.shortcut && (
                                <kbd className="font-mono text-[10px] text-muted-foreground">
                                    {tool.shortcut}
                                </kbd>
                            )}
                        </button>
                    ))}

                    <div className="my-1 border-t border-border" />

                    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        arrange
                    </p>
                    <div className="flex flex-wrap px-2 gap-0.5">
                        {[
                            { label: "Align left (Ctrl+Shift+L)", icon: <AlignLeft size={14} />, action: () => game?.alignLeft() },
                            { label: "Align center (Ctrl+Shift+C)", icon: <AlignHorizontalJustifyCenter size={14} />, action: () => game?.alignCenter() },
                            { label: "Align right (Ctrl+Shift+R)", icon: <AlignRight size={14} />, action: () => game?.alignRight() },
                            { label: "Distribute horizontal (Ctrl+Shift+H)", icon: <ArrowLeftRight size={14} />, action: () => game?.distributeHorizontal() },
                            { label: "Distribute vertical (Ctrl+Shift+V)", icon: <ArrowUpDown size={14} />, action: () => game?.distributeVertical() },
                            { label: "Lock shapes (Ctrl+L)", icon: <Lock size={14} />, action: () => game?.lockShapes() },
                            { label: "Unlock shapes", icon: <Unlock size={14} />, action: () => game?.unlockShapes() },
                        ].map((item) => (
                            <Tooltip key={item.label} label={item.label} side="bottom">
                                <IconButton onClick={item.action} activated={false} icon={item.icon} label={item.label} />
                            </Tooltip>
                        ))}
                    </div>
                </PopoverPanel>
            )}
        </div>
    );
}
