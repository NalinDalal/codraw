/**
 * Top-left application menu.
 *
 * Entry point for document-level actions — NOT canvas tools (those
 * belong in the main toolbar). Contains new/open, import/export, clear,
 * keyboard shortcuts, and sign out. Stays compact so the canvas remains
 * the dominant surface.
 */

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
    Download,
    FileJson,
    FolderOpen,
    HelpCircle,
    ImageDown,
    Menu,
    Plus,
    Trash2,
    Upload,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";
import { SignOutButton } from "./SignOutButton";
import type { Game } from "@/draw/Game";

export function AppMenu({
    game,
    onShowShortcuts,
}: {
    game: Game | undefined;
    onShowShortcuts: () => void;
}) {
    const [open, setOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const close = () => setOpen(false);

    const importJson = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            game?.importFromJson(reader.result as string);
        };
        reader.readAsText(file);
    };

    const itemClass = (danger = false) =>
        `flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-secondary ${
            danger ? "text-red-400" : "text-muted-foreground"
        }`;

    return (
        <div className="relative">
            <Tooltip label="Menu" side="bottom">
                <IconButton
                    onClick={() => setOpen((o) => !o)}
                    activated={open}
                    icon={<Menu size={16} />}
                    label="Menu"
                />
            </Tooltip>

            {open && (
                <PopoverPanel onClose={close} className="left-0 top-[calc(100%+0.5rem)] w-52 py-1">
                    <Link
                        href="/"
                        onClick={close}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <Plus size={14} />
                        <span className="flex-1">New canvas</span>
                    </Link>
                    <Link
                        href="/"
                        onClick={close}
                        className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-100 hover:bg-secondary"
                    >
                        <FolderOpen size={14} />
                        <span className="flex-1">Open canvas</span>
                    </Link>

                    <div className="my-1 border-t border-border" />

                    <button
                        type="button"
                        onClick={() => {
                            fileInputRef.current?.click();
                            close();
                        }}
                        className={itemClass()}
                    >
                        <Upload size={14} />
                        <span className="flex-1">Import…</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.exportToPng();
                            close();
                        }}
                        className={itemClass()}
                    >
                        <ImageDown size={14} />
                        <span className="flex-1">Export PNG</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.exportToSvg();
                            close();
                        }}
                        className={itemClass()}
                    >
                        <Download size={14} />
                        <span className="flex-1">Export SVG</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.exportToJson();
                            close();
                        }}
                        className={itemClass()}
                    >
                        <FileJson size={14} />
                        <span className="flex-1">Export JSON</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            game?.clearCanvas();
                            close();
                        }}
                        className={itemClass(true)}
                    >
                        <Trash2 size={14} />
                        <span className="flex-1">Clear canvas</span>
                    </button>

                    <div className="my-1 border-t border-border" />

                    <button
                        type="button"
                        onClick={() => {
                            onShowShortcuts();
                            close();
                        }}
                        className={itemClass()}
                    >
                        <HelpCircle size={14} />
                        <span className="flex-1">Keyboard shortcuts</span>
                    </button>

                    <div className="my-1 border-t border-border px-3 py-1.5">
                        <SignOutButton />
                    </div>
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
