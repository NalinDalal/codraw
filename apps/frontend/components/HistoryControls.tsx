/**
 * Bottom-left history controls.
 *
 * A compact undo/redo pair with disabled states, so the history is easy
 * to find without permanently occupying canvas space. Document actions
 * (import/export/clear) live in the top-left {@link AppMenu}; this
 * cluster only carries the most frequent operations.
 */

"use client";

import { useEffect, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import type { Game } from "@/draw/Game";

export function HistoryControls({ game }: { game: Game | undefined }) {
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    // Poll the undo stack so disabled states stay live while drawing.
    useEffect(() => {
        const sync = () => {
            setCanUndo(game?.canUndo ?? false);
            setCanRedo(game?.canRedo ?? false);
        };
        sync();
        const interval = setInterval(sync, 300);
        return () => clearInterval(interval);
    }, [game]);

    return (
        <div className="fixed bottom-20 left-3 z-40 flex items-center gap-0.5 md:bottom-5">
            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-soft">
                <Tooltip label="Undo (Ctrl+Z)" side="top">
                    <IconButton
                        onClick={() => game?.undo()}
                        activated={false}
                        disabled={!canUndo}
                        icon={<Undo2 size={15} />}
                        label="Undo"
                    />
                </Tooltip>
                <Tooltip label="Redo (Ctrl+Shift+Z)" side="top">
                    <IconButton
                        onClick={() => game?.redo()}
                        activated={false}
                        disabled={!canRedo}
                        icon={<Redo2 size={15} />}
                        label="Redo"
                    />
                </Tooltip>
            </div>
        </div>
    );
}
