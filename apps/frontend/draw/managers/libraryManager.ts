import { Library, LibraryItem, Shape, Bounds } from "@repo/shapes";
import { moveShape } from "../inputHandler";
import { uuid } from "@/lib/uuid";
import type { GameContext } from "../gameContext";

/** Capabilities the LibraryManager needs from the owning Game instance. */
export interface LibraryManagerApi {
    getSelectedShapes(): Shape[];
    getMultipleBounds(shapes: Shape[]): Bounds | null;
    invalidateCache(): void;
    clearCanvas(): void;
    syncShapes(): void;
}

/**
 * Persistence of reusable shape libraries in localStorage.
 *
 * Owns the library CRUD surface: creating/renaming/deleting libraries,
 * saving the current selection as a library item, loading items back
 * onto the canvas, and JSON import/export for sharing.
 */
export class LibraryManager {
    private static LIBRARY_KEY = "codraw_libraries";

    constructor(
        private context: GameContext,
        private api: LibraryManagerApi,
    ) {}

    /** Get all saved libraries from localStorage */
    getLibraries(): Library[] {
        try {
            const raw = localStorage.getItem(LibraryManager.LIBRARY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /** Save libraries to localStorage */
    private saveLibraries(libs: Library[]) {
        localStorage.setItem(LibraryManager.LIBRARY_KEY, JSON.stringify(libs));
    }

    /** Create a new library */
    createLibrary(name: string): Library {
        const libs = this.getLibraries();
        const lib: Library = {
            id: uuid(),
            name,
            items: [],
            createdAt: Date.now(),
        };
        libs.push(lib);
        this.saveLibraries(libs);
        return lib;
    }

    /** Delete a library by ID */
    deleteLibrary(id: string) {
        const libs = this.getLibraries().filter(l => l.id !== id);
        this.saveLibraries(libs);
    }

    /** Rename a library */
    renameLibrary(id: string, name: string) {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === id);
        if (lib) {
            lib.name = name;
            this.saveLibraries(libs);
        }
    }

    /** Save selected shapes as a library item */
    saveToLibrary(libraryId: string, itemName: string): LibraryItem | null {
        const selected = this.api.getSelectedShapes();
        if (selected.length === 0) return null;
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (!lib) return null;
        const item: LibraryItem = {
            id: uuid(),
            name: itemName,
            shapes: structuredClone(selected),
            createdAt: Date.now(),
        };
        lib.items.push(item);
        this.saveLibraries(libs);
        return item;
    }

    /** Delete a library item */
    deleteLibraryItem(libraryId: string, itemId: string) {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (lib) {
            lib.items = lib.items.filter(i => i.id !== itemId);
            this.saveLibraries(libs);
        }
    }

    /** Load a library item onto the canvas at the given position */
    loadLibraryItem(libraryId: string, itemId: string, x?: number, y?: number) {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (!lib) return;
        const item = lib.items.find(i => i.id === itemId);
        if (!item) return;
        const shapes = structuredClone(item.shapes);
        // Assign new IDs and optionally offset to position
        const ids = new Map<string, string>();
        for (const s of shapes) {
            const oldId = s.id;
            s.id = uuid();
            if (oldId) ids.set(oldId, s.id);
        }
        // Update bindings
        for (const s of shapes) {
            if (s.type === "arrow") {
                if (s.startBinding) s.startBinding = ids.get(s.startBinding) ?? s.startBinding;
                if (s.endBinding) s.endBinding = ids.get(s.endBinding) ?? s.endBinding;
            }
            if (s.boundTextId) {
                s.boundTextId = ids.get(s.boundTextId) ?? s.boundTextId;
            }
        }
        // Offset to position if provided
        if (x !== undefined && y !== undefined && shapes.length > 0) {
            const bounds = this.api.getMultipleBounds(shapes);
            if (bounds) {
                const dx = x - bounds.x;
                const dy = y - bounds.y;
                for (const s of shapes) moveShape(s, dx, dy);
            }
        }
        const prev = [...this.context.existingShapes];
        this.context.existingShapes.push(...shapes);
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /** Export a library as JSON for sharing */
    exportLibrary(libraryId: string): string | null {
        const libs = this.getLibraries();
        const lib = libs.find(l => l.id === libraryId);
        if (!lib) return null;
        return JSON.stringify(lib, null, 2);
    }

    /** Import a library from JSON */
    importLibrary(json: string): Library | null {
        try {
            const lib = JSON.parse(json) as Library;
            if (!lib.name || !Array.isArray(lib.items)) return null;
            lib.id = uuid(); // Assign new ID to avoid conflicts
            lib.items = lib.items.map(item => ({ ...item, id: uuid() }));
            const libs = this.getLibraries();
            libs.push(lib);
            this.saveLibraries(libs);
            return lib;
        } catch {
            return null;
        }
    }
}
