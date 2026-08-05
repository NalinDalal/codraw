/**
 * Reusable round icon button used in floating toolbars.
 *
 * Renders a circular button with an icon and an activated/deactivated
 * visual state. Used for tool selection, zoom, undo/redo, export, etc.
 *
 * @param icon - React node to render as the button icon (typically a Lucide icon)
 * @param onClick - Click handler
 * @param activated - If `true`, the button appears highlighted (red text)
 * @param title - Optional tooltip text shown on hover
 */
export function IconButton({
    icon,
    onClick,
    activated,
    title,
}: {
    icon: React.ReactNode;
    onClick: () => void;
    activated: boolean;
    title?: string;
}) {
    return (
        <div
            className={`m-1 cursor-pointer rounded-full border p-2 bg-black hover:bg-gray-600 ${activated ? "text-red-400" : "text-white"}`}
            onClick={onClick}
            title={title}
        >
            {icon}
        </div>
    );
}
