/**
 * Libraries panel for saving, loading, and sharing reusable shape collections.
 *
 * Features:
 * - Create/rename/delete libraries
 * - Save selected shapes to a library
 * - Load library items onto the canvas
 * - Import/export libraries as JSON for sharing
 */

import { useState, useRef } from "react";
import { Library } from "@repo/shapes";
import { Game } from "@/draw/Game";
import { X, Pencil, Trash2, Upload, Download, RotateCcw } from "lucide-react";
import { PANEL, Button, Input, SectionLabel } from "./ui";
import { Tooltip } from "./Tooltip";

/**
 * LibrariesPanel — floating panel for managing shape libraries.
 *
 * @param game - The Game engine instance
 * @param open - Whether the panel is visible
 * @param onClose - Callback to close the panel
 */
export function LibrariesPanel({
    game,
    open,
    onClose,
}: {
    game: Game | undefined;
    open: boolean;
    onClose: () => void;
}) {
    const [libraries, setLibraries] = useState<Library[]>([]);
    const [activeLibId, setActiveLibId] = useState<string | null>(null);
    const [newLibName, setNewLibName] = useState("");
    const [newItemName, setNewItemName] = useState("");
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = () => setLibraries(game?.getLibraries() ?? []);

    if (!open) return null;

    const activeLib = libraries.find(l => l.id === activeLibId);

    const handleCreateLibrary = () => {
        if (!newLibName.trim()) return;
        game?.createLibrary(newLibName.trim());
        setNewLibName("");
        refresh();
    };

    const handleDeleteLibrary = (id: string) => {
        game?.deleteLibrary(id);
        if (activeLibId === id) setActiveLibId(null);
        refresh();
    };

    const handleRenameLibrary = (id: string) => {
        if (!renameValue.trim()) return;
        game?.renameLibrary(id, renameValue.trim());
        setRenamingId(null);
        refresh();
    };

    const handleSaveToLibrary = () => {
        if (!activeLibId || !newItemName.trim()) return;
        game?.saveToLibrary(activeLibId, newItemName.trim());
        setNewItemName("");
        refresh();
    };

    const handleLoadItem = (itemId: string) => {
        if (!activeLibId) return;
        game?.loadLibraryItem(activeLibId, itemId);
    };

    const handleDragStart = (e: React.DragEvent, itemId: string) => {
        if (!activeLibId) return;
        e.dataTransfer.setData("application/x-library-id", activeLibId);
        e.dataTransfer.setData("application/x-item-id", itemId);
        e.dataTransfer.effectAllowed = "copy";
    };

    const handleDeleteItem = (itemId: string) => {
        if (!activeLibId) return;
        game?.deleteLibraryItem(activeLibId, itemId);
        refresh();
    };

    const handleExport = () => {
        if (!activeLibId) return;
        const json = game?.exportLibrary(activeLibId);
        if (!json) return;
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${activeLib?.name ?? "library"}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const json = reader.result as string;
            game?.importLibrary(json);
            refresh();
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    return (
        <div className={`fixed right-4 top-14 w-72 ${PANEL} p-4 text-foreground dark:text-foreground-dark select-none z-50 max-h-[80vh] overflow-y-auto origin-top-right animate-edge-in-right motion-reduce:animate-none`}>
            <div className="flex items-center justify-between mb-3">
                <SectionLabel className="mb-0">Libraries</SectionLabel>
                <button
                    onClick={onClose}
                    aria-label="Close libraries"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Create new library */}
            <div className="flex gap-1.5 mb-3">
                <Input
                    value={newLibName}
                    onChange={setNewLibName}
                    placeholder="New library name..."
                    className="flex-1"
                />
                <Button
                    variant="primary"
                    onClick={handleCreateLibrary}
                    disabled={!newLibName.trim()}
                >
                    Create
                </Button>
            </div>

            {/* Import / export */}
            <div className="flex gap-1.5 mb-3">
                <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                >
                    <Upload size={13} />
                    Import
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                />
                {activeLibId && (
                    <Button onClick={handleExport} className="flex-1">
                        <Download size={13} />
                        Export
                    </Button>
                )}
            </div>

            {/* Library list */}
            <div className="space-y-1 mb-3">
                {libraries.length === 0 && (
                    <div className="text-xs text-muted-foreground dark:text-muted-foreground-dark text-center py-2">No libraries yet</div>
                )}
                {libraries.map(lib => (
                    <div key={lib.id} className="flex items-center gap-1">
                        {renamingId === lib.id ? (
                            <form
                                className="flex-1"
                                onSubmit={(e) => { e.preventDefault(); handleRenameLibrary(lib.id); }}
                            >
                                <input
                                    autoFocus
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onBlur={() => setRenamingId(null)}
                                    placeholder="Library name"
                                    className="w-full bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-md px-2 py-1 text-xs text-foreground dark:text-foreground-dark placeholder:text-muted-foreground dark:placeholder:text-muted-foreground-dark focus:outline-none focus:ring-1 focus:ring-primary transition-colors duration-fast"
                                />
                            </form>
                        ) : (
                            <button
                                onClick={() => setActiveLibId(activeLibId === lib.id ? null : lib.id)}
                                aria-pressed={activeLibId === lib.id}
                                className={`flex-1 text-left px-2 py-1.5 rounded-md text-xs cursor-pointer transition-[color,background-color] duration-fast active:bg-active dark:active:bg-active-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                    activeLibId === lib.id
                                        ? "bg-selected dark:bg-selected-dark text-highlight dark:text-highlight-dark"
                                        : "bg-muted dark:bg-muted-dark text-text-secondary dark:text-text-secondary-dark hover:bg-hover dark:hover:bg-hover-dark hover:text-foreground dark:hover:text-foreground-dark"
                                }`}
                            >
                                {lib.name} <span className="text-muted-foreground dark:text-muted-foreground-dark">({lib.items.length})</span>
                            </button>
                        )}
                        <Tooltip label="Rename" side="top">
                            <button
                                onClick={() => { setRenamingId(lib.id); setRenameValue(lib.name); }}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                aria-label={`Rename ${lib.name}`}
                            >
                                <Pencil size={13} />
                            </button>
                        </Tooltip>
                        <Tooltip label="Delete library" side="top">
                            <button
                                onClick={() => handleDeleteLibrary(lib.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:text-danger dark:hover:text-danger-dark hover:bg-danger/10 dark:hover:bg-danger-dark/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                                aria-label={`Delete ${lib.name}`}
                            >
                                <Trash2 size={13} />
                            </button>
                        </Tooltip>
                    </div>
                ))}
            </div>

            {/* Active library items */}
            {activeLib && (
                <div className="border-t border-border-subtle dark:border-border-subtle-dark pt-3">
                    <SectionLabel>{activeLib.name}</SectionLabel>

                    {/* Save selected shapes */}
                    <div className="flex gap-1.5 mb-3">
                        <Input
                            value={newItemName}
                            onChange={setNewItemName}
                            placeholder="Item name..."
                            className="flex-1"
                        />
                        <Button
                            variant="primary"
                            onClick={handleSaveToLibrary}
                            disabled={!newItemName.trim()}
                        >
                            Save
                        </Button>
                    </div>

                    {/* Items list */}
                    <div className="space-y-1">
                        {activeLib.items.length === 0 && (
                            <div className="text-xs text-muted-foreground dark:text-muted-foreground-dark text-center py-2">No items — select shapes and save</div>
                        )}
                        {activeLib.items.map(item => (
                            <div
                                key={item.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item.id)}
                                className="flex items-center gap-1 bg-muted dark:bg-muted-dark border border-border-subtle dark:border-border-subtle-dark rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing"
                            >
                                <div className="flex-1 text-xs truncate">{item.name}</div>
                                <div className="text-muted-foreground dark:text-muted-foreground-dark text-xs mr-1">{item.shapes.length} shapes</div>
                                <Tooltip label="Load onto canvas" side="top">
                                    <button
                                        onClick={() => handleLoadItem(item.id)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-highlight dark:text-highlight-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:bg-selected dark:hover:bg-selected-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                        aria-label={`Load ${item.name}`}
                                    >
                                        <RotateCcw size={13} />
                                    </button>
                                </Tooltip>
                                <Tooltip label="Delete item" side="top">
                                    <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:text-danger dark:hover:text-danger-dark hover:bg-danger/10 dark:hover:bg-danger-dark/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                                        aria-label={`Delete ${item.name}`}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </Tooltip>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}