/**
 * MermaidPanel — convert Mermaid flowchart syntax to canvas shapes.
 *
 * Opens with a toolbar button, provides a textarea for Mermaid input,
 * and generates shapes on the canvas when confirmed.
 */

import { useState, useRef, useEffect } from "react";
import { Game } from "@/draw/Game";
import { X } from "lucide-react";

const EXAMPLE = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process A]
    B -->|No| D[Process B]
    C --> E[End]
    D --> E`;

export function MermaidPanel({
    game,
    open,
    onClose,
}: {
    game: Game | undefined;
    open: boolean;
    onClose: () => void;
}) {
    const [text, setText] = useState(EXAMPLE);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (open) {
            setTimeout(() => textareaRef.current?.focus(), 50);
        }
    }, [open]);

    const handleGenerate = () => {
        if (!game || !text.trim()) return;
        game.importFromMermaid(text);
        onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
            <div className="bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-xl p-5 w-[500px] max-h-[80vh] flex flex-col shadow-float dark:shadow-float-dark animate-popover">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-foreground dark:text-foreground-dark font-medium">Mermaid to Diagram</div>
                    <button onClick={onClose} className="text-muted-foreground dark:text-muted-foreground-dark hover:text-foreground dark:hover:text-foreground-dark cursor-pointer">
                        <X size={18} />
                    </button>
                </div>

                <div className="text-xs text-muted-foreground dark:text-muted-foreground-dark mb-2">
                    Supports flowchart syntax: <code className="text-foreground dark:text-foreground-dark">graph TD</code> or <code className="text-foreground dark:text-foreground-dark">graph LR</code>
                </div>

                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    className="flex-1 bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-lg p-3 text-sm text-foreground dark:text-foreground-dark font-mono resize-none outline-none focus:ring-2 focus:ring-primary/50 min-h-[200px] placeholder:text-muted-foreground dark:placeholder:text-muted-foreground-dark"
                    placeholder="graph TD&#10;    A[Start] --> B{Decision}&#10;    B -->|Yes| C[OK]&#10;    B -->|No| D[Fail]"
                    spellCheck={false}
                />

                <div className="flex justify-end gap-2 mt-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-sm text-muted-foreground dark:text-muted-foreground-dark hover:text-foreground dark:hover:text-foreground-dark rounded-lg border border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={!text.trim()}
                        className="px-4 py-1.5 text-sm bg-primary hover:bg-accent-hover dark:hover:bg-accent-hover-dark disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                        Generate
                    </button>
                </div>
            </div>
        </div>
    );
}
