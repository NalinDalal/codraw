/**
 * Bottom-left utility cluster.
 *
 * A single "Actions" menu reveals the document actions (import JSON,
 * export PNG/SVG/JSON, clear canvas) instead of permanently showing
 * four or five buttons. Undo/redo stay visible next to it as a compact
 * pair, since they're the most frequently used document actions.
 */

"use client";

import { useRef, useState } from "react";
import { Download, FileJson, ImageDown, Menu, Redo2, Trash2, Undo2, Upload } from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";
import type { Game } from "@/draw/Game";

export function UtilityMenu({ game }: { game: Game | undefined }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const importJson = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            game?.importFromJson(reader.result as string);
        };
        reader.readAsText(file);
    };

    return (
        <div className="fixed bottom-20 left-3 z-40 flex items-center gap-0.5 md:bottom-5">
            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-border bg-card/90 backdrop-blur-md shadow-lg">
                <Tooltip label="Actions" side="top">
                    <IconButton
                        onClick={() => setMenuOpen((o) => !o)}
                        activated={menuOpen}
                        icon={<Menu size={15} />}
                        label="Actions (import / export / clear)"
                    />
                </Tooltip>
                <span className="w-px h-4 bg-border mx-0.5" />
                <Tooltip label="Undo (Ctrl+Z)" side="top">
                    <IconButton
                        onClick={() => game?.undo()}
                        activated={false}
                        icon={<Undo2 size={15} />}
                        label="Undo"
                    />
                </Tooltip>
                <Tooltip label="Redo (Ctrl+Shift+Z)" side="top">
                    <IconButton
                        onClick={() => game?.redo()}
                        activated={false}
                        icon={<Redo2 size={15} />}
                        label="Redo"
                    />
                </Tooltip>
            </div>

            {menuOpen && (
                <PopoverPanel onClose={() => setMenuOpen(false)} className="left-0 bottom-[calc(100%+0.5rem)] w-44 py-1">
                    <button
                        type="button"
                        onClick={() => {
                            fileInputRef.current?.click();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <Upload size={14} />
                        <span>Import…</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.exportToPng();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <ImageDown size={14} />
                        <span>Export PNG</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.exportToSvg();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <Download size={14} />
                        <span>Export SVG</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.exportToJson();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <FileJson size={14} />
                        <span>Export JSON</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.clearCanvas();
                            setMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-secondary"
                    >
                        <Trash2 size={14} />
                        <span>Clear canvas</span>
                    </button>
                </PopoverPanel>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importJson(file);
                    e.target.value = "";
                }}
            />
        </div>
    );
}
