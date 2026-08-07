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
import { Library } from "@/draw/shapes";
import { Game } from "@/draw/Game";

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
        <div className="fixed right-4 top-14 w-72 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-4 text-white select-none z-20 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-white/50 uppercase tracking-wider">Libraries</div>
                <button onClick={onClose} className="text-white/40 hover:text-white text-sm cursor-pointer">✕</button>
            </div>

            {/* Create new library */}
            <div className="flex gap-1 mb-3">
                <input
                    type="text"
                    value={newLibName}
                    onChange={e => setNewLibName(e.target.value)}
                    placeholder="New library name..."
                    className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder:text-white/30"
                    onKeyDown={e => e.key === "Enter" && handleCreateLibrary()}
                />
                <button
                    onClick={handleCreateLibrary}
                    className="px-2 py-1 bg-blue-500 hover:bg-blue-600 rounded text-xs cursor-pointer"
                >
                    Create
                </button>
            </div>

            {/* Import button */}
            <div className="flex gap-1 mb-3">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded text-xs cursor-pointer"
                >
                    Import JSON
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                />
                {activeLibId && (
                    <button
                        onClick={handleExport}
                        className="flex-1 px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded text-xs cursor-pointer"
                    >
                        Export JSON
                    </button>
                )}
            </div>

            {/* Library list */}
            <div className="space-y-1 mb-3">
                {libraries.length === 0 && (
                    <div className="text-xs text-white/30 text-center py-2">No libraries yet</div>
                )}
                {libraries.map(lib => (
                    <div key={lib.id} className="flex items-center gap-1">
                        {renamingId === lib.id ? (
                            <input
                                type="text"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={() => handleRenameLibrary(lib.id)}
                                onKeyDown={e => {
                                    if (e.key === "Enter") handleRenameLibrary(lib.id);
                                    if (e.key === "Escape") setRenamingId(null);
                                }}
                                className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white"
                                autoFocus
                            />
                        ) : (
                            <button
                                onClick={() => setActiveLibId(activeLibId === lib.id ? null : lib.id)}
                                className={`flex-1 text-left px-2 py-1 rounded text-xs cursor-pointer ${activeLibId === lib.id ? "bg-blue-500/30 text-blue-300" : "bg-white/5 hover:bg-white/10"}`}
                            >
                                {lib.name} <span className="text-white/30">({lib.items.length})</span>
                            </button>
                        )}
                        <button
                            onClick={() => { setRenamingId(lib.id); setRenameValue(lib.name); }}
                            className="text-white/30 hover:text-white text-xs px-1 cursor-pointer"
                            title="Rename"
                        >
                            ✎
                        </button>
                        <button
                            onClick={() => handleDeleteLibrary(lib.id)}
                            className="text-white/30 hover:text-red-400 text-xs px-1 cursor-pointer"
                            title="Delete"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            {/* Active library items */}
            {activeLib && (
                <div className="border-t border-white/10 pt-3">
                    <div className="text-xs text-white/50 mb-2">{activeLib.name}</div>

                    {/* Save selected shapes */}
                    <div className="flex gap-1 mb-3">
                        <input
                            type="text"
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                            placeholder="Item name..."
                            className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder:text-white/30"
                            onKeyDown={e => e.key === "Enter" && handleSaveToLibrary()}
                        />
                        <button
                            onClick={handleSaveToLibrary}
                            className="px-2 py-1 bg-green-500 hover:bg-green-600 rounded text-xs cursor-pointer"
                        >
                            Save
                        </button>
                    </div>

                    {/* Items list */}
                    <div className="space-y-1">
                        {activeLib.items.length === 0 && (
                            <div className="text-xs text-white/30 text-center py-2">No items — select shapes and save</div>
                        )}
                        {activeLib.items.map(item => (
                            <div key={item.id} className="flex items-center gap-1 bg-white/5 rounded px-2 py-1">
                                <div className="flex-1 text-xs truncate">{item.name}</div>
                                <div className="text-white/30 text-xs mr-1">{item.shapes.length} shapes</div>
                                <button
                                    onClick={() => handleLoadItem(item.id)}
                                    className="text-blue-400 hover:text-blue-300 text-xs px-1 cursor-pointer"
                                    title="Load onto canvas"
                                >
                                    ↻
                                </button>
                                <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="text-white/30 hover:text-red-400 text-xs px-1 cursor-pointer"
                                    title="Delete"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
