import { ensureShapesHaveStyle, Shape } from "@repo/shapes";
import { shapesEqual } from "../undoManager";
import type { GameContext } from "../gameContext";
import type { CursorManager } from "./cursorManager";

/** Capabilities the WebSocketSyncManager needs from the owning Game instance. */
export interface WebSocketSyncManagerApi {
    roomId: string;
    socket: WebSocket;
    get existingShapes(): Shape[];
    set existingShapes(v: Shape[]);
    get lastSyncedShapes(): Shape[];
    set lastSyncedShapes(v: Shape[]);
    get selectedIds(): Set<string>;
    set selectedIds(v: Set<string>);
    undoManager: { clear(): void };
    invalidateCache(): void;
    clearCanvas(): void;
    notifySelection(): void;
    cursorManager: CursorManager;
}

/**
 * WebSocket message handling and shape diff synchronization.
 *
 * Owns the `socket.onmessage` handler for shape-diff, chat, and cursor
 * messages, and provides `syncShapes()` to compute and broadcast local
 * changes to the room.
 */
export class WebSocketSyncManager {
    constructor(
        private context: GameContext,
        private api: WebSocketSyncManagerApi,
    ) {}

    /** Wire up WebSocket message handlers for real-time sync. */
    init() {
        this.api.socket.onmessage = (event) => {
            let message: any;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            if (message.type === "shape-diff") {
                const { added, modified, removed } = message;

                if (Array.isArray(removed)) {
                    const removedSet = new Set(removed);
                    for (const id of removed) {
                        const idx = this.context.existingShapes.findIndex((s) => s.id === id);
                        if (idx !== -1) this.context.existingShapes.splice(idx, 1);
                    }
                    for (const s of this.context.existingShapes) {
                        if (s.boundTextId && removedSet.has(s.boundTextId)) {
                            delete s.boundTextId;
                        }
                    }
                }

                if (Array.isArray(added)) {
                    const existingIds = new Set(this.context.existingShapes.map(s => s.id).filter(Boolean));
                    for (const shape of ensureShapesHaveStyle(added)) {
                        if (shape.id && existingIds.has(shape.id)) continue;
                        this.context.existingShapes.push(shape);
                    }
                }

                if (Array.isArray(modified)) {
                    for (const shape of ensureShapesHaveStyle(modified)) {
                        if (!shape.id) continue;
                        const idx = this.context.existingShapes.findIndex((s) => s.id === shape.id);
                        if (idx !== -1) {
                            this.context.existingShapes[idx] = shape;
                        } else {
                            this.context.existingShapes.push(shape);
                        }
                    }
                }

                this.context.lastSyncedShapes = structuredClone(this.context.existingShapes);
                this.context.selectedIds.clear();
                this.api.notifySelection();
                this.api.invalidateCache();
                this.api.clearCanvas();
                return;
            }

            if (message.type === "chat") {
                let inner: any;
                try {
                    inner = JSON.parse(message.message);
                } catch {
                    return;
                }
                if (inner.type === "full-state") {
                    this.context.undoManager.clear();
                    this.context.existingShapes = ensureShapesHaveStyle(inner.shapes);
                    this.context.lastSyncedShapes = structuredClone(this.context.existingShapes);
                    this.context.selectedIds.clear();
                    this.api.notifySelection();
                    this.api.invalidateCache();
                    this.api.clearCanvas();
                } else {
                    inner.shape = ensureShapesHaveStyle([inner.shape])[0];
                    if (
                        !inner.shape.id ||
                        !this.context.existingShapes.some((s) => s.id === inner.shape.id)
                    ) {
                        this.context.existingShapes.push(inner.shape);
                        this.context.lastSyncedShapes = structuredClone(this.context.existingShapes);
                        this.context.selectedIds.clear();
                        this.api.notifySelection();
                        this.api.invalidateCache();
                        this.api.clearCanvas();
                    }
                }
            }

            if (message.type === "cursor") {
                const userId = message.userId;
                const cursor = message.cursor;
                if (userId && cursor && userId !== this.api.cursorManager.getLocalCursorId()) {
                    this.api.cursorManager.updateRemoteCursor(userId, cursor);
                }
            }
        };
    }

    /** Compute a shape diff and broadcast it over WebSocket, then schedule auto-save. */
    syncShapes() {
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.context.autoSaveManager.scheduleAutoSave();

        const added: Shape[] = [];
        const modified: Shape[] = [];
        const removed: string[] = [];

        const prevMap = new Map<string, Shape>();
        for (const s of this.context.lastSyncedShapes) {
            if (s.id) prevMap.set(s.id, s);
        }

        const seen = new Set<string>();
        for (const shape of this.context.existingShapes) {
            if (!shape.id) continue;
            seen.add(shape.id);
            const prev = prevMap.get(shape.id);
            if (!prev) {
                added.push(shape);
            } else if (!shapesEqual(prev, shape)) {
                modified.push(shape);
            }
        }
        for (const [id] of prevMap) {
            if (!seen.has(id)) removed.push(id);
        }

        if (added.length === 0 && modified.length === 0 && removed.length === 0) return;

        if (this.api.socket.readyState === WebSocket.OPEN) {
            try {
                this.api.socket.send(
                    JSON.stringify({
                        type: "shape-diff",
                        roomId: this.api.roomId,
                        added,
                        modified,
                        removed,
                    }),
                );
            } catch (err) {
                console.warn("Failed to send shape-diff", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        this.context.lastSyncedShapes = structuredClone(this.context.existingShapes);
    }

    /** Clear the socket message handler. */
    destroy() {
        this.api.socket.onmessage = null;
    }
}
