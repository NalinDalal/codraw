import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Describes a single keyboard shortcut entry.
 *
 * @property key - The key combination (e.g. "Ctrl+Z", "Space + drag")
 * @property description - Human-readable explanation of what the shortcut does
 */
interface Shortcut {
    key: string;
    description: string;
}

/** All keyboard shortcuts displayed in the shortcuts panel */
const shortcuts: Shortcut[] = [
    { key: "Space + drag", description: "Pan the canvas" },
    { key: "Arrow keys", description: "Nudge selected shapes (1px)" },
    { key: "Shift + Arrow keys", description: "Nudge selected shapes (10px) or pan canvas" },
    { key: "Ctrl+A", description: "Select all shapes" },
    { key: "Escape", description: "Deselect all / cancel action" },
    { key: "Ctrl+Z", description: "Undo last action" },
    { key: "Ctrl+Shift+Z", description: "Redo last undone action" },
    { key: "Ctrl+C", description: "Copy selected shapes" },
    { key: "Ctrl+V", description: "Paste copied shapes" },
    { key: "Ctrl+D", description: "Duplicate selected shapes" },
    { key: "Ctrl+G", description: "Group selected shapes" },
    { key: "Ctrl+Shift+G", description: "Ungroup selected shapes" },
    { key: "Delete / Backspace", description: "Delete selected shapes" },
    { key: "Ctrl+Shift+L", description: "Align selected shapes left" },
    { key: "Ctrl+Shift+R", description: "Align selected shapes right" },
    { key: "Ctrl+Shift+C", description: "Align selected shapes center" },
    { key: "Ctrl+Shift+H", description: "Distribute selected shapes horizontally" },
    { key: "Ctrl+Shift+V", description: "Distribute selected shapes vertically" },
    { key: "Ctrl+L", description: "Lock / unlock selected shapes" },
    { key: "I", description: "Toggle eyedropper tool" },
    { key: "P", description: "Toggle constant-width pen tool" },
    { key: "L", description: "Toggle laser pointer" },
    { key: "G", description: "Toggle snap to grid" },
    { key: "+ / =", description: "Zoom in" },
    { key: "-", description: "Zoom out" },
    { key: "Shift+1", description: "Zoom to fit all shapes" },
    { key: "Ctrl+0", description: "Reset zoom to 100%" },
    { key: "B", description: "Cycle canvas background (solid → dots → crosses → plain)" },
    { key: "Ctrl+F", description: "Search shapes" },
    { key: "?", description: "Toggle this shortcuts panel" },
];

/**
 * A modal panel that displays all available keyboard shortcuts.
 *
 * Renders a semi-transparent overlay with a scrollable list of
 * shortcut keys and their descriptions. Can be dismissed by
 * pressing Escape or clicking the close button.
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
    const panelRef = useRef<HTMLDivElement>(null);

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
                ref={panelRef}
                className="bg-card dark:bg-card-dark backdrop-blur-md rounded-xl border border-border dark:border-border-dark p-6 text-foreground dark:text-foreground-dark max-w-md w-full mx-4 shadow-float dark:shadow-float-dark animate-popover"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground dark:text-muted-foreground-dark hover:text-foreground dark:hover:text-foreground-dark transition-colors"
                        aria-label="Close shortcuts panel"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {shortcuts.map((shortcut) => (
                        <div
                            key={shortcut.key}
                            className="flex items-center justify-between py-1 border-b border-border-subtle dark:border-border-subtle-dark last:border-0"
                        >
                            <kbd className="px-2 py-0.5 bg-muted dark:bg-muted-dark rounded text-xs font-mono text-foreground dark:text-foreground-dark">
                                {shortcut.key}
                            </kbd>
                            <span className="text-sm text-text-secondary dark:text-text-secondary-dark ml-3">
                                {shortcut.description}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}