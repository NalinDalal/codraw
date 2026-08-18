/**
 * Reusable icon button used across the canvas chrome.
 *
 * Renders a compact square button with an icon and an activated/deactivated
 * visual state. Borderless by default; the active state is a restrained
 * accent background with accent icon color — never a heavy outline.
 * Activation pops the icon up a touch and presses the button down, so
 * tool switches read as physical.
 *
 * @param icon - React node to render as the button icon (typically a Lucide icon)
 * @param onClick - Click handler
 * @param activated - If `true`, the button appears as the selected/pressed state
 * @param title - Optional native tooltip text (prefer wrapping in {@link Tooltip})
 * @param label - Accessible label; falls back to `title`
 * @param disabled - If `true`, the button is inert, dimmed, and keeps its tooltip
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
            className={`flex items-center justify-center w-9 h-9 rounded-lg transition-[transform,background-color,color] duration-fast ease-spring cursor-pointer active:scale-[0.92] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                [&>svg]:transition-transform [&>svg]:duration-fast [&>svg]:ease-spring motion-reduce:[&>svg]:transition-none
                ${activated
                    ? "bg-selected dark:bg-selected-dark text-primary [&>svg]:scale-110"
                    : "text-icon-secondary dark:text-icon-secondary-dark hover:bg-hover dark:hover:bg-hover-dark hover:text-icon-primary dark:hover:text-icon-primary-dark"
                }
                ${disabled ? "opacity-40" : ""}`}
            onClick={onClick}
        >
            {icon}
        </button>
    );
}