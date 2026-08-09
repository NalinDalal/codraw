/**
 * Shared definitions for the canvas tool rail and mobile tool dock.
 *
 * Centralizes tool ids, labels, shortcuts, and icons so the desktop rail
 * and the mobile dock stay in sync, and so tooltips can display the
 * matching keyboard shortcut when one exists.
 */

import {
    ArrowUpRight,
    Circle,
    Diamond,
    Droplet,
    EraserIcon,
    Hand,
    ImageIcon,
    Minus,
    MousePointer2,
    Pen,
    Pencil,
    RectangleHorizontalIcon,
    Type,
} from "lucide-react";

/** Inline icon for Ellipsis Arc (no lucide equivalent) */
export function EllipsisArcIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 16c-4.42 0-8-3.58-8-8" />
        </svg>
    );
}

/** Inline icon for Sticky Note (no lucide equivalent) */
export function StickyNoteIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
            <path d="M14 3v6h6" />
        </svg>
    );
}

/** Inline icon for Frame (no lucide equivalent) */
export function FrameIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
        </svg>
    );
}

export interface CanvasTool {
    id: string;
    label: string;
    shortcut?: string;
    icon: React.ReactNode;
}

/** Core tools shown directly in the rail / dock */
export const CORE_TOOLS: CanvasTool[] = [
    { id: "select", label: "Select", shortcut: "V", icon: <MousePointer2 size={16} /> },
    { id: "hand", label: "Hand", shortcut: "H", icon: <Hand size={16} /> },
    { id: "pencil", label: "Pencil", icon: <Pencil size={16} /> },
    { id: "arrow", label: "Arrow", shortcut: "A", icon: <ArrowUpRight size={16} /> },
    { id: "line", label: "Line", icon: <Minus size={16} /> },
    { id: "rect", label: "Rectangle", shortcut: "R", icon: <RectangleHorizontalIcon size={16} /> },
    { id: "circle", label: "Ellipse", shortcut: "O", icon: <Circle size={16} /> },
    { id: "text", label: "Text", shortcut: "T", icon: <Type size={16} /> },
    { id: "image", label: "Image", icon: <ImageIcon size={16} /> },
    { id: "eraser", label: "Eraser", shortcut: "E", icon: <EraserIcon size={16} /> },
];

/** Additional tools available behind the "More" menu */
export const MORE_TOOLS: CanvasTool[] = [
    { id: "diamond", label: "Diamond", shortcut: "D", icon: <Diamond size={16} /> },
    { id: "constantPen", label: "Constant pen", shortcut: "P", icon: <Pen size={16} /> },
    { id: "ellipsisArc", label: "Ellipsis arc", icon: <EllipsisArcIcon /> },
    { id: "stickyNote", label: "Sticky note", icon: <StickyNoteIcon /> },
    { id: "frame", label: "Frame", icon: <FrameIcon /> },
    { id: "eyedropper", label: "Eyedropper", shortcut: "I", icon: <Droplet size={16} /> },
    { id: "laser", label: "Laser pointer", shortcut: "L", icon: <MousePointer2 size={16} /> },
];

/**
 * Whether a tool exposes configurable shape properties.
 * Tools without properties hide the contextual properties popover.
 */
export function toolHasProperties(tool: string): boolean {
    return !["select", "hand", "eraser", "eyedropper", "laser"].includes(tool);
}

/** Human-readable label for a tool id (used in the properties popover title) */
export function toolLabel(tool: string): string {
    const found = [...CORE_TOOLS, ...MORE_TOOLS].find((t) => t.id === tool);
    return found?.label ?? tool;
}
