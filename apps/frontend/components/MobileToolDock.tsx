/**
 * Mobile bottom tool dock.
 *
 * Replaces the desktop left rail on small screens: the core tools sit in
 * a horizontal dock pinned to the bottom edge, so the canvas stays the
 * dominant surface. The active tool gets the same accent state as the
 * desktop rail.
 */

"use client";

import { useState } from "react";
import { MoreHorizontal, Pen, Pencil } from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { CORE_TOOLS, MORE_TOOLS } from "./canvasTools";

export function MobileToolDock({
    selectedTool,
    handMode,
    onSelectTool,
    onToggleHand,
    smoothMode,
    onToggleSmooth,
}: {
    selectedTool: string;
    handMode: boolean;
    onSelectTool: (tool: string) => void;
    onToggleHand: () => void;
    smoothMode: boolean;
    onToggleSmooth: () => void;
}) {
    const [moreOpen, setMoreOpen] = useState(false);
    const isActive = (tool: string) =>
        tool === "hand" ? handMode : selectedTool === tool;

    const handleTool = (tool: string) => {
        if (tool === "hand") onToggleHand();
        else onSelectTool(tool);
    };

    return (
        <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
            <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] overflow-x-auto border-t border-border bg-card/95 backdrop-blur-md">
                {CORE_TOOLS.map((tool) => (
                    <Tooltip key={tool.id} label={tool.label} side="top">
                        <IconButton
                            onClick={() => handleTool(tool.id)}
                            activated={isActive(tool.id)}
                            icon={tool.icon}
                            label={tool.label}
                        />
                    </Tooltip>
                ))}
                <Tooltip label={smoothMode ? "Rough mode" : "Smooth mode"} side="top">
                    <IconButton
                        onClick={onToggleSmooth}
                        activated={smoothMode}
                        icon={smoothMode ? <Pen size={16} /> : <Pencil size={16} />}
                        label="Toggle smooth mode"
                    />
                </Tooltip>
                <Tooltip label="More tools" side="top">
                    <IconButton
                        onClick={() => setMoreOpen((o) => !o)}
                        activated={moreOpen}
                        icon={<MoreHorizontal size={16} />}
                        label="More tools"
                    />
                </Tooltip>
            </div>

            {moreOpen && (
                <div className="absolute bottom-full inset-x-0 p-2 pb-0">
                    <div className="grid grid-cols-2 gap-0.5 p-1.5 rounded-t-lg border border-border bg-card/95 backdrop-blur-md shadow-soft">
                        {[...CORE_TOOLS, ...MORE_TOOLS].map((tool) => (
                            <button
                                key={tool.id}
                                type="button"
                                onClick={() => {
                                    handleTool(tool.id);
                                    setMoreOpen(false);
                                }}
                                aria-pressed={isActive(tool.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors duration-100 ${
                                    isActive(tool.id)
                                        ? "text-foreground ring-1 ring-inset ring-primary/40"
                                        : "text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                }`}
                            >
                                {tool.icon}
                                <span>{tool.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
