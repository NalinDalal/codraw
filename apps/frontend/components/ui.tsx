/**
 * Shared UI primitives for the canvas chrome.
 *
 * Small, single-purpose components that keep the design system coherent:
 * a compact slider row (thin track + circular thumb with an accent active
 * portion), a consistent button family, menu items, and section labels.
 * Everything is plain Tailwind utility classes (light + `dark:` variants)
 * — no custom CSS.
 */

"use client";

import { ReactNode } from "react";

/** Shared floating-surface classes: toolbar, header, zoom, history, minimap. */
export const SURFACE =
    "rounded-lg border border-border dark:border-border-dark bg-elevated dark:bg-elevated-dark shadow-float dark:shadow-float-dark";

/** Shared menu item row used in popovers, app menu, and context menu. */
export const MENU_ITEM =
    "flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-text-secondary dark:text-text-secondary-dark rounded-md transition-colors duration-fast hover:bg-hover dark:hover:bg-hover-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Slider row with a label on the left and the value aligned right.
 *
 * The active portion of the track is accent-colored, the inactive portion
 * muted. The thumb is a small circle with an accent ring, sized via
 * Tailwind arbitrary variants (no custom CSS).
 */
export function Slider({
    label,
    valueText,
    min,
    max,
    step,
    value,
    onChange,
}: {
    label: string;
    valueText: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
}) {
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
    return (
        <div className="px-3 mb-3">
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-[11px] text-text-secondary dark:text-text-secondary-dark">{label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground dark:text-muted-foreground-dark">{valueText}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="appearance-none bg-transparent w-full h-4 cursor-pointer
                    [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary
                    [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:mt-[-4.5px]
                    [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-fast
                    hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-125
                    [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent
                    [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary
                    [&::-moz-range-thumb]:shadow-sm"
                style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${pct}%, rgba(128,128,128,0.18) ${pct}%, rgba(128,128,128,0.18) 100%) no-repeat 50% 50% / 100% 3px`,
                }}
            />
        </div>
    );
}

/**
 * Consistent button family.
 *
 * - `primary` — filled accent (the one prominent action, e.g. Share)
 * - `secondary` — subtle surface with border (secondary actions)
 * - `ghost` — transparent until hover (menu-style actions)
 */
export function Button({
    variant = "secondary",
    className = "",
    onClick,
    disabled,
    children,
}: {
    variant?: "primary" | "secondary" | "ghost";
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`h-7 px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed ${
                variant === "primary"
                    ? "bg-primary text-primary-foreground hover:bg-accent-hover dark:hover:bg-accent-hover-dark"
                    : variant === "secondary"
                        ? "text-text-secondary dark:text-text-secondary-dark border border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark"
                        : "text-text-secondary dark:text-text-secondary-dark hover:bg-hover dark:hover:bg-hover-dark"
            } ${className}`}
        >
            {children}
        </button>
    );
}

/** Small section label used inside inspectors and panels. */
export function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <div className="text-[11px] font-medium text-text-secondary dark:text-text-secondary-dark mb-1.5">
            {children}
        </div>
    );
}

/** A subtle divider for separating sections within panels. */
export function Divider() {
    return (
        <div className="my-1.5 mx-3 border-t border-border dark:border-border-dark" />
    );
}

/** A circular color swatch with a restrained selected state. */
export function ColorSwatch({
    color,
    selected,
    onClick,
    label,
}: {
    color: string;
    selected: boolean;
    onClick: () => void;
    label?: string;
}) {
    const isTransparent = color === "transparent";
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label ?? `Color ${color}`}
            className={`w-5 h-5 rounded-full shrink-0 transition-all duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                selected
                    ? "ring-1 ring-primary/70 ring-offset-1 ring-offset-elevated dark:ring-offset-elevated-dark scale-105"
                    : "hover:scale-110"
            }`}
            style={{
                background: isTransparent
                    ? "repeating-conic-gradient(rgba(128,128,128,0.4) 0% 25%, transparent 0% 50%) 50% / 6px 6px"
                    : color,
            }}
        />
    );
}

/** A menu item row for popovers/context menus (wraps MENU_ITEM). */
export function MenuItem({
    icon,
    children,
    hint,
    onClick,
    disabled,
    danger,
}: {
    icon?: ReactNode;
    children: ReactNode;
    hint?: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
}) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className={MENU_ITEM}>
            {icon && <span className="flex items-center justify-center w-4 shrink-0">{icon}</span>}
            <span className={`flex-1 ${danger ? "text-red-500 dark:text-red-400" : ""}`}>{children}</span>
            {hint && (
                <span className="font-mono text-[10px] text-muted-foreground dark:text-muted-foreground-dark">{hint}</span>
            )}
        </button>
    );
}

/** Compact input used in property panels. */
export function Input({
    value,
    onChange,
    placeholder,
    type = "text",
    className = "",
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-md px-2 py-1 text-xs text-foreground dark:text-foreground-dark placeholder:text-muted-foreground dark:placeholder:text-muted-foreground-dark focus:outline-none focus:ring-1 focus:ring-primary transition-colors duration-fast ${className}`}
        />
    );
}
