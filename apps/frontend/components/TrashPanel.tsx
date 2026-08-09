import { Shape } from "@repo/shapes";
import { Trash2, RotateCcw, X } from "lucide-react";

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
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-soft w-[90vw] max-w-md animate-[popover-in_150ms_ease-out]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
                <div className="flex items-center gap-2 text-foreground">
                    <Trash2 size={14} />
                    <span className="text-xs font-medium">Trash ({trash.length})</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onEmpty}
                        className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded bg-secondary"
                    >
                        Empty
                    </button>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X size={14} />
                    </button>
                </div>
            </div>
            <div className="max-h-40 overflow-y-auto p-2 space-y-1">
                {trash.map((shape) => (
                    <div
                        key={shape.id}
                        className="flex items-center justify-between bg-secondary rounded px-2 py-1.5"
                    >
                        <div className="flex items-center gap-2 text-foreground text-xs">
                            <span className="capitalize">{shape.type}</span>
                            <span className="text-muted-foreground">
                                {shape.id?.slice(0, 8)}
                            </span>
                        </div>
                        <button
                            onClick={() => onRestore(shape.id!)}
                            className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 bg-secondary px-1.5 py-0.5 rounded"
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
