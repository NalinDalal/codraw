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
import { MenuItem, Divider } from "./ui";
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
                    <ListItem href="/" onClick={close}>
                        <Plus size={14} />
                        New canvas
                    </ListItem>
                    <ListItem href="/" onClick={close}>
                        <FolderOpen size={14} />
                        Open canvas
                    </ListItem>

                    <Divider />

                    <MenuItem icon={<Upload size={14} />} onClick={() => {
                        fileInputRef.current?.click();
                        close();
                    }}>
                        Import…
                    </MenuItem>
                    <MenuItem icon={<ImageDown size={14} />} onClick={() => {
                        game?.exportToPng();
                        close();
                    }}>
                        Export PNG
                    </MenuItem>
                    <MenuItem icon={<Download size={14} />} onClick={() => {
                        game?.exportToSvg();
                        close();
                    }}>
                        Export SVG
                    </MenuItem>
                    <MenuItem icon={<FileJson size={14} />} onClick={() => {
                        game?.exportToJson();
                        close();
                    }}>
                        Export JSON
                    </MenuItem>
                    <MenuItem icon={<Trash2 size={14} />} danger onClick={() => {
                        game?.clearCanvas();
                        close();
                    }}>
                        Clear canvas
                    </MenuItem>

                    <Divider />

                    <MenuItem icon={<HelpCircle size={14} />} onClick={() => {
                        onShowShortcuts();
                        close();
                    }}>
                        Keyboard shortcuts
                    </MenuItem>

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

/** Link row styled like a menu item. */
function ListItem({
    href,
    onClick,
    children,
}: {
    href: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Link href={href} onClick={onClick} className={MENU_LINK}>
            {children}
        </Link>
    );
}

const MENU_LINK =
    "flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm font-normal text-text-secondary dark:text-text-secondary-dark rounded-md transition-[color,background-color] duration-fast ease-spring cursor-pointer hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none";