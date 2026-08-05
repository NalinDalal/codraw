import { useEffect, useRef } from "react";
import {
    Copy,
    ClipboardPaste,
    Trash2,
    CopyPlus,
    BringToFront,
    SendToBack,
    ArrowUp,
    ArrowDown,
    Lock,
    Unlock,
    Group,
    Ungroup,
} from "lucide-react";

interface ContextMenuItem {
    label: string;
    icon: React.ReactNode;
    shortcut?: string;
    action: () => void;
    disabled?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    // Adjust position to keep menu on screen
    const adjustedX = Math.min(x, window.innerWidth - 220);
    const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 16);

    return (
        <div
            ref={menuRef}
            className="fixed z-50 bg-black/90 backdrop-blur-md rounded-lg border border-white/10 py-1 shadow-2xl min-w-[200px]"
            style={{ left: adjustedX, top: adjustedY }}
        >
            {items.map((item, i) => (
                <button
                    key={i}
                    onClick={() => {
                        item.action();
                        onClose();
                    }}
                    disabled={item.disabled}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.shortcut && (
                        <span className="text-xs text-white/40 font-mono">{item.shortcut}</span>
                    )}
                </button>
            ))}
        </div>
    );
}

export function buildContextMenuItems(
    game: {
        getSelectedShapes: () => { id?: string; locked?: boolean; groupId?: string }[];
        copySelectedShape: () => void;
        pasteClipboard: () => void;
        deleteSelectedShape: () => void;
        duplicateSelected: () => void;
        bringForward: () => void;
        sendBackward: () => void;
        bringToFront: () => void;
        sendToBack: () => void;
        lockShapes: () => void;
        unlockShapes: () => void;
        group: () => void;
        ungroup: () => void;
    },
    hasSelection: boolean,
): ContextMenuItem[] {
    const selected = game.getSelectedShapes();
    const count = selected.length;
    const allLocked = count > 0 && selected.every(s => s.locked);
    const allGrouped = count > 0 && selected.every(s => s.groupId);

    return [
        {
            label: "Copy",
            icon: <Copy size={16} />,
            shortcut: "Ctrl+C",
            action: () => game.copySelectedShape(),
            disabled: !hasSelection,
        },
        {
            label: "Paste",
            icon: <ClipboardPaste size={16} />,
            shortcut: "Ctrl+V",
            action: () => game.pasteClipboard(),
        },
        {
            label: "Duplicate",
            icon: <CopyPlus size={16} />,
            shortcut: "Ctrl+D",
            action: () => game.duplicateSelected(),
            disabled: !hasSelection,
        },
        {
            label: "Delete",
            icon: <Trash2 size={16} />,
            shortcut: "Del",
            action: () => game.deleteSelectedShape(),
            disabled: !hasSelection,
        },
        { label: "", icon: null, action: () => {} },
        {
            label: "Bring Forward",
            icon: <ArrowUp size={16} />,
            shortcut: "",
            action: () => game.bringForward(),
            disabled: !hasSelection,
        },
        {
            label: "Send Backward",
            icon: <ArrowDown size={16} />,
            shortcut: "",
            action: () => game.sendBackward(),
            disabled: !hasSelection,
        },
        {
            label: "Bring to Front",
            icon: <BringToFront size={16} />,
            shortcut: "",
            action: () => game.bringToFront(),
            disabled: !hasSelection,
        },
        {
            label: "Send to Back",
            icon: <SendToBack size={16} />,
            shortcut: "",
            action: () => game.sendToBack(),
            disabled: !hasSelection,
        },
        { label: "", icon: null, action: () => {} },
        {
            label: allLocked ? "Unlock" : "Lock",
            icon: allLocked ? <Unlock size={16} /> : <Lock size={16} />,
            shortcut: "Ctrl+L",
            action: () => (allLocked ? game.unlockShapes() : game.lockShapes()),
            disabled: !hasSelection,
        },
        {
            label: "Group",
            icon: <Group size={16} />,
            shortcut: "Ctrl+G",
            action: () => game.group(),
            disabled: count < 2,
        },
        {
            label: "Ungroup",
            icon: <Ungroup size={16} />,
            shortcut: "Ctrl+Shift+G",
            action: () => game.ungroup(),
            disabled: !allGrouped,
        },
    ];
}
