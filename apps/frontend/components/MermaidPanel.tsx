/**
 * MermaidPanel — convert Mermaid flowchart syntax to canvas shapes.
 *
 * Opens with a toolbar button, provides a textarea for Mermaid input,
 * and generates shapes on the canvas when confirmed.
 */

import { useState, useRef } from "react";
import { Game } from "@/draw/Game";
import { X } from "lucide-react";
import { Button, useEscapeToClose, useFocusTrap } from "./ui";

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

    useEscapeToClose(onClose, open);

    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, open);

    const handleGenerate = () => {
        if (!game || !text.trim()) return;
        game.importFromMermaid(text);
        onClose();
    };

    if (!open) return null;

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mermaid-title"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in motion-reduce:animate-none" onClick={onClose}
        >
            <div
                className="bg-elevated dark:bg-elevated-dark/95 backdrop-blur-xl border border-border-subtle dark:border-border-subtle-dark rounded-xl p-5 w-[500px] max-h-[80vh] flex flex-col shadow-float dark:shadow-float-dark animate-modal-in motion-reduce:animate-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3">
                    <div id="mermaid-title" className="text-sm text-foreground dark:text-foreground-dark font-medium">Mermaid to Diagram</div>
                    <button
                        onClick={onClose}
                        aria-label="Close mermaid panel"
                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                        <X size={15} />
                    </button>
                </div>

                <div className="text-xs text-muted-foreground dark:text-muted-foreground-dark mb-2">
                    Supports flowchart syntax: <code className="text-foreground dark:text-foreground-dark">graph TD</code> or <code className="text-foreground dark:text-foreground-dark">graph LR</code>
                </div>

                <textarea
                    autoFocus
                    aria-label="Mermaid diagram code"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    className="flex-1 bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-md p-3 text-sm text-foreground dark:text-foreground-dark font-mono resize-none outline-none focus:ring-1 focus:ring-primary min-h-[200px] placeholder:text-muted-foreground dark:placeholder:text-muted-foreground-dark"
                    placeholder="graph TD&#10;    A[Start] --> B{Decision}&#10;    B -->|Yes| C[OK]&#10;    B -->|No| D[Fail]"
                    spellCheck={false}
                />

                <div className="flex justify-end gap-2 mt-3">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleGenerate} disabled={!text.trim()}>
                        Generate
                    </Button>
                </div>
            </div>
        </div>
    );
}