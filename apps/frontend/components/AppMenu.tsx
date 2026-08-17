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
import { MenuRow, Divider } from "./ui";
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
                <PopoverPanel onClose={close} className="left-0 top-[calc(100%+0.5rem)] w-56 py-1 origin-top-left">
                    <MenuRow href="/" icon={<Plus size={14} />} onClick={close}>
                        New canvas
                    </MenuRow>
                    <MenuRow href="/" icon={<FolderOpen size={14} />} onClick={close}>
                        Open canvas
                    </MenuRow>

                    <Divider />

                    <MenuRow icon={<Upload size={14} />} onClick={() => {
                        fileInputRef.current?.click();
                        close();
                    }}>
                        Import…
                    </MenuRow>
                    <MenuRow icon={<ImageDown size={14} />} onClick={() => {
                        game?.exportToPng();
                        close();
                    }}>
                        Export PNG
                    </MenuRow>
                    <MenuRow icon={<Download size={14} />} onClick={() => {
                        game?.exportToSvg();
                        close();
                    }}>
                        Export SVG
                    </MenuRow>
                    <MenuRow icon={<FileJson size={14} />} onClick={() => {
                        game?.exportToJson();
                        close();
                    }}>
                        Export JSON
                    </MenuRow>
                    <MenuRow icon={<Trash2 size={14} />} danger onClick={() => {
                        game?.clearCanvas();
                        close();
                    }}>
                        Clear canvas
                    </MenuRow>

                    <Divider />

                    <MenuRow icon={<HelpCircle size={14} />} onClick={() => {
                        onShowShortcuts();
                        close();
                    }}>
                        Keyboard shortcuts
                    </MenuRow>

                    <Divider />

                    <div className="px-3 py-2">
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