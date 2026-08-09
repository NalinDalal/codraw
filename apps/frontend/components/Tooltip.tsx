/**
 * Consistent CSS tooltip used across the canvas chrome.
 *
 * Pure CSS (no portal, no JS timers): the label fades and slides in after
 * a short delay once the trigger is hovered or focused. Always renders on
 * a dark elevated surface in both themes for legibility over the canvas.
 * An optional `kbd` hint renders as a small shortcut chip.
 *
 * @param label - Tooltip text
 * @param kbd - Optional keyboard shortcut shown as a chip (e.g. "R")
 * @param side - Which side of the trigger the label appears on
 * @param children - The trigger element (button, etc.)
 */

"use client";

import { ReactNode } from "react";

const POSITIONS: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
};

export function Tooltip({
    label,
    kbd,
    side = "right",
    children,
    className,
}: {
    label: string;
    kbd?: string;
    side?: "top" | "right" | "bottom" | "left";
    children: ReactNode;
    className?: string;
}) {
    return (
        <span className={`relative inline-flex group/tip ${className ?? ""}`}>
            {children}
            <span
                role="tooltip"
                className={`pointer-events-none absolute z-[60] rounded-md border border-white/10 bg-elevated-dark px-2 py-1 text-[11px] leading-tight whitespace-nowrap text-foreground-dark shadow-float-dark opacity-0 group-hover/tip:opacity-100 group-hover/tip:animate-tooltip group-hover/tip:[animation-delay:200ms] group-focus-within/tip:opacity-100 ${POSITIONS[side]}`}
            >
                {label}
                {kbd && (
                    <kbd className="ml-1.5 rounded border border-white/15 bg-white/10 px-1 py-px font-mono text-[9px] text-muted-foreground-dark">
                        {kbd}
                    </kbd>
                )}
            </span>
        </span>
    );
}
