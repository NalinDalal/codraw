import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * A single shortcut entry.
 *
 * @property combos - One or more alternative key combinations; each combo is
 *   a list of key names rendered as separate adjacent badges (e.g. `["Ctrl","Z"]`).
 * @property label - Human-readable description of what the shortcut does
 */
interface ShortcutEntry {
    combos: string[][];
    label: string;
}

/** A named group of shortcuts shown under a section header */
interface ShortcutSection {
    title: string;
    entries: ShortcutEntry[];
}

/** Excalidraw-style tool shortcuts */
const TOOLS: ShortcutEntry[] = [
    { combos: [["H"]], label: "Hand" },
    { combos: [["V"], ["1"]], label: "Selection" },
    { combos: [["R"], ["2"]], label: "Rectangle" },
    { combos: [["D"], ["3"]], label: "Diamond" },
    { combos: [["O"], ["4"]], label: "Ellipse" },
    { combos: [["A"], ["5"]], label: "Arrow" },
    { combos: [["L"], ["6"]], label: "Line" },
    { combos: [["P"], ["7"]], label: "Draw (pen)" },
    { combos: [["T"], ["8"]], label: "Text" },
    { combos: [["9"]], label: "Insert image" },
    { combos: [["E"], ["0"]], label: "Eraser" },
    { combos: [["F"]], label: "Frame" },
    { combos: [["K"]], label: "Laser pointer" },
    { combos: [["I"]], label: "Pick color" },
    { combos: [["B"]], label: "Cycle canvas background" },
    { combos: [["Q"]], label: "Keep tool active after drawing" },
    { combos: [["Tab"], ["Shift", "Tab"]], label: "Toggle shape type" },
    { combos: [["Space", "drag"]], label: "Pan the canvas" },
    { combos: [["Esc"]], label: "Cancel / deselect" },
];

/** Excalidraw-style editor shortcuts */
const EDITOR: ShortcutEntry[] = [
    { combos: [["Ctrl", "A"]], label: "Select all" },
    { combos: [["Ctrl", "Z"]], label: "Undo" },
    { combos: [["Ctrl", "Shift", "Z"]], label: "Redo" },
    { combos: [["Ctrl", "C"]], label: "Copy" },
    { combos: [["Ctrl", "X"]], label: "Cut" },
    { combos: [["Ctrl", "V"]], label: "Paste" },
    { combos: [["Ctrl", "D"]], label: "Duplicate" },
    { combos: [["Ctrl", "G"]], label: "Group" },
    { combos: [["Ctrl", "Shift", "G"]], label: "Ungroup" },
    { combos: [["Del"]], label: "Delete" },
    { combos: [["Ctrl", "B"]], label: "Bold text" },
    { combos: [["Ctrl", "I"]], label: "Italic text" },
    { combos: [["Shift", "click"]], label: "Add to selection" },
    { combos: [["Ctrl", "click"]], label: "Deep select" },
    { combos: [["Enter"]], label: "Edit text / add label" },
    { combos: [["Arrow", "keys"]], label: "Nudge selection" },
    { combos: [["Shift", "Arrow", "keys"]], label: "Nudge faster" },
    { combos: [["Shift", "Alt", "C"]], label: "Copy as PNG" },
    { combos: [["Ctrl", "Alt", "C"]], label: "Copy styles" },
    { combos: [["Ctrl", "Alt", "V"]], label: "Paste styles" },
    { combos: [["Ctrl", "["]], label: "Send backward" },
    { combos: [["Ctrl", "Shift", "["]], label: "Send to back" },
    { combos: [["Ctrl", "]"]], label: "Bring forward" },
    { combos: [["Ctrl", "Shift", "]"]], label: "Bring to front" },
    { combos: [["Ctrl", "Shift", "L"]], label: "Align left" },
    { combos: [["Ctrl", "Shift", "R"]], label: "Align right" },
    { combos: [["Ctrl", "Shift", "T"]], label: "Align top" },
    { combos: [["Ctrl", "Shift", "B"]], label: "Align bottom" },
    { combos: [["Ctrl", "Shift", "C"]], label: "Align center" },
    { combos: [["Ctrl", "Shift", "H"]], label: "Distribute horizontally" },
    { combos: [["Ctrl", "Shift", "V"]], label: "Distribute vertically" },
    { combos: [["Ctrl", "L"]], label: "Lock / unlock selection" },
    { combos: [["Shift", "H"]], label: "Flip horizontal" },
    { combos: [["Shift", "V"]], label: "Flip vertical" },
];

/** Excalidraw-style view shortcuts */
const VIEW: ShortcutEntry[] = [
    { combos: [["Ctrl", "="]], label: "Zoom in" },
    { combos: [["Ctrl", "-"]], label: "Zoom out" },
    { combos: [["Ctrl", "0"]], label: "Reset zoom" },
    { combos: [["Shift", "1"]], label: "Zoom to fit" },
    { combos: [["Shift", "2"]], label: "Zoom to selection" },
    { combos: [["PgUp"]], label: "Move page up" },
    { combos: [["PgDn"]], label: "Move page down" },
    { combos: [["Alt", "Z"]], label: "Zen mode" },
    { combos: [["Alt", "R"]], label: "View mode" },
    { combos: [["Alt", "S"]], label: "Snap to objects" },
    { combos: [["G"], ["Ctrl", "'"]], label: "Toggle snap to grid" },
    { combos: [["Arrow", "keys"]], label: "Pan canvas" },
    { combos: [["Alt", "Shift", "D"]], label: "Toggle theme" },
    { combos: [["Ctrl", "F"]], label: "Find on canvas" },
];

const SECTIONS: ShortcutSection[] = [
    { title: "Tools", entries: TOOLS },
    { title: "Editor", entries: EDITOR },
    { title: "View", entries: VIEW },
];

/**
 * A key badge — a single rounded-rectangle chip for one key name.
 */
function KeyBadge({ label }: { label: string }) {
    return (
        <kbd className="min-w-[24px] px-1.5 py-1 text-center text-[11px] leading-none font-mono bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-[5px] text-foreground dark:text-foreground-dark shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)]">
            {label}
        </kbd>
    );
}

/**
 * Render one shortcut row: description on the left, key badges on the right.
 */
function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
    return (
        <div className="flex items-center justify-between gap-3 py-[7px]">
            <span className="text-[13px] text-text-secondary dark:text-text-secondary-dark">
                {entry.label}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
                {entry.combos.map((combo, i) => (
                    <span key={i} className="flex items-center gap-1">
                        {i > 0 && (
                            <span className="text-[10px] text-muted-foreground dark:text-muted-foreground-dark mr-0.5">
                                /
                            </span>
                        )}
                        {combo.map((key) => (
                            <KeyBadge key={key} label={key} />
                        ))}
                    </span>
                ))}
            </div>
        </div>
    );
}

/**
 * One column (or the full-width View section): header + rows.
 */
function ShortcutSectionBlock({ section, className = "" }: { section: ShortcutSection; className?: string }) {
    return (
        <section className={className}>
            <h3 className="text-sm font-bold text-foreground dark:text-foreground-dark mb-1">
                {section.title}
            </h3>
            <div className="divide-y divide-border-subtle dark:divide-border-subtle-dark">
                {section.entries.map((entry, i) => (
                    <ShortcutRow key={i} entry={entry} />
                ))}
            </div>
        </section>
    );
}

/**
 * Modal panel listing all keyboard shortcuts, structured like Excalidraw:
 * a fixed header, a scrollable body with Tools (left) and Editor (right)
 * columns, and a full-width View section below them.
 *
 * Dismissed with Escape or by clicking the close button / backdrop.
 *
 * @param isOpen - Whether the panel is currently visible
 * @param onClose - Callback fired when the panel should be dismissed
 */
export function ShortcutsPanel({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="flex flex-col bg-card dark:bg-card-dark backdrop-blur-md rounded-xl border border-border dark:border-border-dark max-w-[680px] w-full mx-4 max-h-[78vh] shadow-float dark:shadow-float-dark animate-popover"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle dark:border-border-subtle-dark shrink-0">
                    <h2 className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                        Keyboard Shortcuts
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md text-muted-foreground dark:text-muted-foreground-dark hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark transition-colors"
                        aria-label="Close shortcuts panel"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto px-5 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                        <ShortcutSectionBlock section={SECTIONS[0]} />
                        <ShortcutSectionBlock section={SECTIONS[1]} />
                    </div>
                    <div className="mt-6 pt-4 border-t border-border-subtle dark:border-border-subtle-dark">
                        <ShortcutSectionBlock section={SECTIONS[2]} />
                    </div>
                </div>
            </div>
        </div>
    );
}
