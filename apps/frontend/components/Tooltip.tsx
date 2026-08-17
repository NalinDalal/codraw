/**
 * Consistent CSS tooltip used across the canvas chrome.
 *
 * Pure CSS (no portal, no JS timers): the label fades and slides in after
 * a short delay once the trigger is hovered or focused. Always renders on
 * a dark elevated surface in both themes for legibility over the canvas.
 * The bottom-side arrow is drawn with Tailwind pseudo-element utilities,
 * so no custom CSS exists anywhere in the app.
 * An optional `kbd` hint renders as a shortcut chip.
 *
 * @param label - Tooltip text
 * @param kbd - Optional keyboard shortcut shown as a chip (e.g. "R")
 * @param side - Which side of the trigger the label appears on
 * @param children - The trigger element (button, etc.)
 */

"use client";

import { ReactNode } from "react";
import { Kbd } from "./ui";

const POSITIONS: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
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
                className={`pointer-events-none absolute z-[60] rounded-sm border border-white/10 bg-black/90 px-2 py-1 text-11 leading-tight whitespace-nowrap text-white shadow-lg opacity-0 group-hover/tip:opacity-100 group-hover/tip:animate-tooltip group-hover/tip:[animation-delay:200ms] group-focus-visible/tip:opacity-100 motion-reduce:group-hover/tip:animate-none ${POSITIONS[side]} ${side === "bottom"
                        ? "before:content-[''] before:absolute before:top-[-6px] before:left-1/2 before:-translate-x-1/2 before:border-[6px] before:border-transparent before:border-b-black/90"
                        : ""
                    }`}
            >
                {label}
                {kbd && (
                    <span className="ml-1.5 inline-flex">
                        <Kbd>{kbd}</Kbd>
                    </span>
                )}
            </span>
        </span>
    );
}
