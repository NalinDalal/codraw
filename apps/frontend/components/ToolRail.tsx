/**
 * Desktop left tool rail.
 *
 * Shows the core drawing tools vertically, with secondary tools and
 * arrange actions tucked behind a "More" popover. Tooltips display the
 * matching keyboard shortcut. Selection actions (align/distribute/lock)
 * and render mode live in the More menu.
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
    Pen,
    Pencil,
    Unlock,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";
import { CORE_TOOLS, MORE_TOOLS } from "./canvasTools";
import type { Game } from "@/draw/Game";

export function ToolRail({
    selectedTool,
    handMode,
    onSelectTool,
    onToggleHand,
    smoothMode,
    onToggleSmooth,
    game,
}: {
    selectedTool: string;
    handMode: boolean;
    onSelectTool: (tool: string) => void;
    onToggleHand: () => void;
    smoothMode: boolean;
    onToggleSmooth: () => void;
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
        <div className="fixed top-16 left-3 z-40 hidden md:block">
            <div className="flex flex-col gap-0.5 p-1 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-lg">
                {CORE_TOOLS.map((tool) => (
                    <Tooltip
                        key={tool.id}
                        label={
                            tool.shortcut
                                ? `${tool.label} (${tool.shortcut})`
                                : tool.label
                        }
                        side="right"
                    >
                        <IconButton
                            onClick={() => handleTool(tool.id)}
                            activated={isActive(tool.id)}
                            icon={tool.icon}
                            label={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                        />
                    </Tooltip>
                ))}

                <div className="my-1 border-t border-border" />

                <Tooltip label="More tools" side="right">
                    <IconButton
                        onClick={() => setMoreOpen((o) => !o)}
                        activated={moreOpen}
                        icon={<MoreHorizontal size={16} />}
                        label="More tools"
                    />
                </Tooltip>
            </div>

            {moreOpen && (
                <PopoverPanel onClose={() => setMoreOpen(false)} className="left-[3.25rem] top-0 w-44 py-1">
                    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        shapes
                    </p>
                    {MORE_TOOLS.map((tool) => (
                        <button
                            key={tool.id}
                            type="button"
                            onClick={() => handleTool(tool.id)}
                            aria-pressed={isActive(tool.id)}
                            className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-secondary ${
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
                            <Tooltip key={item.label} label={item.label} side="right">
                                <IconButton onClick={item.action} activated={false} icon={item.icon} label={item.label} />
                            </Tooltip>
                        ))}
                    </div>

                    <div className="my-1 border-t border-border" />

                    <button
                        type="button"
                        onClick={() => {
                            onToggleSmooth();
                            setMoreOpen(false);
                        }}
                        aria-pressed={smoothMode}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <span className="flex items-center justify-center w-4">
                            {smoothMode ? <Pen size={16} /> : <Pencil size={16} />}
                        </span>
                        <span className="flex-1">Smooth mode</span>
                        <span className="w-7 h-4 rounded-full relative transition-colors duration-150 bg-secondary border border-border">
                            <span
                                className={`absolute top-0.5 w-3 h-3 rounded-full bg-primary transition-all duration-150 ${
                                    smoothMode ? "left-3.5" : "left-0.5"
                                }`}
                            />
                        </span>
                    </button>
                </PopoverPanel>
            )}
        </div>
    );
}
