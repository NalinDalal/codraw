import { Shape } from "@repo/shapes";
import { Trash2, RotateCcw, X } from "lucide-react";
import { SURFACE, Button } from "./ui";

/**
 * Trash panel showing recently deleted shapes with restore/empty actions.
 */
export function TrashPanel({
    trash,
    onRestore,
    onEmpty,
    onClose,
    open,
}: {
    trash: Shape[];
    onRestore: (id: string) => void;
    onEmpty: () => void;
    onClose: () => void;
    open: boolean;
}) {
    if (!open || trash.length === 0) return null;

    return (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 ${SURFACE} w-[90vw] max-w-md origin-bottom animate-panel-in motion-reduce:animate-none`}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle dark:border-border-subtle-dark">
                <div className="flex items-center gap-2 text-foreground dark:text-foreground-dark">
                    <Trash2 size={14} />
                    <span className="text-xs font-medium">Trash ({trash.length})</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="danger" onClick={onEmpty} className="h-6 px-2">
                        Empty
                    </Button>
                    <button onClick={onClose} aria-label="Close trash" className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                        <X size={14} />
                    </button>
                </div>
            </div>
            <div className="max-h-40 overflow-y-auto p-2 space-y-1">
                {trash.map((shape) => (
                    <div
                        key={shape.id}
                        className="flex items-center justify-between bg-muted dark:bg-muted-dark border border-border-subtle dark:border-border-subtle-dark rounded-md px-2 py-1.5"
                    >
                        <div className="flex items-center gap-2 text-foreground dark:text-foreground-dark text-xs">
                            <span className="capitalize">{shape.type}</span>
                            <span className="text-muted-foreground dark:text-muted-foreground-dark">
                                {shape.id?.slice(0, 8)}
                            </span>
                        </div>
                        <button
                            onClick={() => onRestore(shape.id!)}
                            className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-medium text-success dark:text-success-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:bg-success/10 dark:hover:bg-success-dark/10 bg-muted dark:bg-muted-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/50"
                        >
                            <RotateCcw size={10} />
                            Restore
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}