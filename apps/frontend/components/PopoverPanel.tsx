/**
 * Shared dismissible popover panel used by all canvas chrome menus.
 *
 * Closes on outside click or Escape, stops propagation so the canvas
 * never receives pointer events while the panel is open, and renders
 * the shared floating-panel chrome (border, background, shadow) via the
 * `PANEL` surface. Pops in with the anchor-relative spring motion.
 *
 * `onClose` is optional: panels that are a pure reflection of app state
 * (e.g. the properties inspector, which the parent mounts/unmounts)
 * don't need dismissal wiring.
 *
 * @param onClose - Called when the panel should be dismissed
 * @param children - Panel content
 * @param className - Extra classes (positioning is applied by the caller)
 * @param role - ARIA role of the panel (`menu` for menus, `dialog` for panels)
 */

"use client";

import { useEffect, useRef, ReactNode } from "react";
import { PANEL } from "./ui";

export function PopoverPanel({
    onClose,
    children,
    className,
    role = "menu",
    ariaLabel,
}: {
    onClose?: () => void;
    children: ReactNode;
    className?: string;
    role?: string;
    ariaLabel?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!onClose) return;
        const onPointerDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            role={role}
            aria-label={ariaLabel}
            className={`fixed z-50 ${PANEL} origin-top animate-popover motion-reduce:animate-none ${className ?? ""}`}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );
}