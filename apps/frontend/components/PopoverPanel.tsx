/**
 * Shared dismissible popover panel used by all canvas chrome menus.
 *
 * Closes on outside click or Escape, stops propagation so the canvas
 * never receives pointer events while the panel is open, and renders
 * the shared themed panel chrome (border, background, shadow).
 *
 * @param onClose - Called when the panel should be dismissed
 * @param children - Panel content
 * @param className - Extra classes (positioning is applied by the caller)
 */

"use client";

import { useEffect, useRef, ReactNode } from "react";
import { SURFACE } from "./ui";

export function PopoverPanel({
    onClose,
    children,
    className,
    role = "menu",
}: {
    onClose: () => void;
    children: ReactNode;
    className?: string;
    role?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
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
            className={`fixed z-50 ${SURFACE} animate-popover shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.25)] rounded-xl border border-[#e5e7eb] dark:border-[rgba(255,255,255,0.12)] ${className ?? ""}`}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>
    );
}
