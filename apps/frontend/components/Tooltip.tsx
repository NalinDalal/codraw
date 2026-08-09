/**
 * Lightweight CSS tooltip used across the canvas chrome.
 *
 * Pure CSS (no portal, no JS timers): the label fades in after a short
 * delay once the trigger is hovered or focused. Icon-only buttons that
 * wrap themselves in this component must still carry an `aria-label`.
 *
 * @param label - Tooltip text (include the shortcut, e.g. "Rectangle (R)")
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
    side = "right",
    children,
    className,
}: {
    label: string;
    side?: "top" | "right" | "bottom" | "left";
    children: ReactNode;
    className?: string;
}) {
    return (
        <span className={`relative inline-flex group/tip ${className ?? ""}`}>
            {children}
            <span
                role="tooltip"
                className={`pointer-events-none absolute z-[60] rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] leading-none whitespace-nowrap text-foreground shadow-lg opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${POSITIONS[side]}`}
                style={{ transitionDelay: "120ms" }}
            >
                {label}
            </span>
        </span>
    );
}
