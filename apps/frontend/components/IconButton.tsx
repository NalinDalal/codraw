/**
 * Reusable icon button used across the canvas chrome.
 *
 * Renders a square button with an icon and an activated/deactivated
 * visual state. Used for tool selection, zoom, undo/redo, export, etc.
 * The active state is communicated with both color and an inset ring so
 * it never relies on color alone.
 *
 * @param icon - React node to render as the button icon (typically a Lucide icon)
 * @param onClick - Click handler
 * @param activated - If `true`, the button appears highlighted
 * @param title - Optional native tooltip text (prefer wrapping in {@link Tooltip})
 * @param label - Accessible label; falls back to `title`
 * @param disabled - If `true`, the button is inert and dimmed
 */
export function IconButton({
    icon,
    onClick,
    activated,
    title,
    label,
    disabled,
}: {
    icon: React.ReactNode;
    onClick: () => void;
    activated: boolean;
    title?: string;
    label?: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={label ?? title}
            aria-pressed={activated}
            disabled={disabled}
            className={`flex items-center justify-center w-8 h-8 m-1 rounded-md border transition-colors duration-150 cursor-pointer
                ${activated
                    ? "border-primary/70 bg-secondary text-foreground ring-1 ring-inset ring-primary/60"
                    : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                }
                ${disabled ? "opacity-40 pointer-events-none" : ""}`}
            onClick={onClick}
        >
            {icon}
        </button>
    );
}
