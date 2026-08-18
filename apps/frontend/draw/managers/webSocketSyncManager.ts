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
    /** Id-keyed snapshot of shapes at the last sync (maintained incrementally). */
    get lastSyncedShapes(): Map<string, Shape>;
    set lastSyncedShapes(v: Map<string, Shape>);
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
 * Owns the `socket.onmessage` handler for shape-diff, chat, cursor, and
 * presence messages, and provides `syncShapes()` to compute and broadcast
 * local changes to the room.
 *
 * The last-synced snapshot is maintained as an id-keyed map updated
 * incrementally (only changed shapes are deep-cloned per sync) instead
 * of cloning the whole shape array on every sync.
 */
export class WebSocketSyncManager {
    /** Per-shape last-applied server version (LWW staleness filter). */
    private lastAppliedVersion = new Map<string, number>();

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
                const { added, modified, removed, versions } = message;

                if (Array.isArray(removed)) {
                    const removedSet = new Set(removed);
                    for (const id of removed) {
                        const idx = this.context.existingShapes.findIndex((s) => s.id === id);
                        if (idx !== -1) this.context.existingShapes.splice(idx, 1);
                        this.api.lastSyncedShapes.delete(id);
                        this.lastAppliedVersion.delete(id);
                    }
                    for (const s of this.context.existingShapes) {
                        if (s.boundTextId && removedSet.has(s.boundTextId)) {
                            delete s.boundTextId;
                        }
                    }
                }

                const stale = (shape: any) => {
                    const v = versions?.[shape?.id];
                    if (v === undefined) return false;
                    const seen = this.lastAppliedVersion.get(shape.id) ?? 0;
                    if (v.v <= seen) return true;
                    this.lastAppliedVersion.set(shape.id, v.v);
                    return false;
                };

                if (Array.isArray(added)) {
                    const existingIds = new Set(this.context.existingShapes.map(s => s.id).filter(Boolean));
                    for (const shape of ensureShapesHaveStyle(added, this.context.isDark)) {
                        if (!shape.id || existingIds.has(shape.id)) continue;
                        if (stale(shape)) continue;
                        this.context.existingShapes.push(shape);
                        this.api.lastSyncedShapes.set(shape.id, structuredClone(shape));
                    }
                }

                if (Array.isArray(modified)) {
                    for (const shape of ensureShapesHaveStyle(modified, this.context.isDark)) {
                        if (!shape.id) continue;
                        if (stale(shape)) continue;
                        const idx = this.context.existingShapes.findIndex((s) => s.id === shape.id);
                        // A "modified" entry must only ever update a shape
                        // this client already knows about. Inserting it when
                        // the id is unknown would create a phantom shape —
                        // and when the original "added" message later
                        // arrives, the id renders twice. Drop instead.
                        if (idx === -1) continue;
                        this.context.existingShapes[idx] = shape;
                        this.api.lastSyncedShapes.set(shape.id, structuredClone(shape));
                    }
                }

                // Defensive id-dedupe: whatever the server sends (or slips
                // through the LWW filter), a duplicate id must never render —
                // findIndex-based updates and undo/redo diffs assume ids are
                // unique, and a duplicate renders as a ghost trail. Keep the
                // first occurrence only.
                const seenIds = new Set<string>();
                this.context.existingShapes = this.context.existingShapes.filter((s) => {
                    if (!s.id) return true;
                    if (seenIds.has(s.id)) return false;
                    seenIds.add(s.id);
                    return true;
                });

                // Remote changes merge into the local canvas; keep the
                // user's selection, dropping only ids that no longer exist.
                this.pruneStaleSelection();
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
                    this.context.existingShapes = ensureShapesHaveStyle(inner.shapes, this.context.isDark);
                    this.context.lastSyncedShapes = new Map(
                        this.context.existingShapes
                            .filter((s) => Boolean(s.id))
                            .map((s) => [s.id!, structuredClone(s)]),
                    );
                    this.lastAppliedVersion.clear();
                    this.context.selectedIds.clear();
                    this.api.notifySelection();
                    this.api.invalidateCache();
                    this.api.clearCanvas();
                } else {
                    inner.shape = ensureShapesHaveStyle([inner.shape], this.context.isDark)[0];
                    if (
                        !inner.shape.id ||
                        !this.context.existingShapes.some((s) => s.id === inner.shape.id)
                    ) {
                        this.context.existingShapes.push(inner.shape);
                        this.api.lastSyncedShapes.set(inner.shape.id, structuredClone(inner.shape));
                        this.pruneStaleSelection();
                        this.api.invalidateCache();
                        this.api.clearCanvas();
                    }
                }
            }

            if (message.type === "shape-diff-ack") {
                // Authoritative server versions for the shapes this client
                // just broadcast. Record them so delayed older broadcasts
                // of the same shape are dropped as stale.
                const versions = message.versions;
                if (versions && typeof versions === "object") {
                    for (const [id, v] of Object.entries(versions as Record<string, { v?: number; author?: string }>)) {
                        if (v && typeof v.v === "number") {
                            this.lastAppliedVersion.set(id, Math.max(this.lastAppliedVersion.get(id) ?? 0, v.v));
                        }
                    }
                }
            }

            if (message.type === "presence") {
                this.api.cursorManager.handlePresence(message);
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

    /**
     * Drop selection ids that no longer exist on the canvas, keeping the
     * rest so remote edits never wipe the local user's selection.
     */
    private pruneStaleSelection() {
        const live = new Set(this.context.existingShapes.map((s) => s.id).filter(Boolean));
        let changed = false;
        for (const id of [...this.context.selectedIds]) {
            if (!live.has(id)) {
                this.context.selectedIds.delete(id);
                changed = true;
            }
        }
        if (changed) {
            this.api.notifySelection();
        }
    }

    /** Compute a shape diff and broadcast it over WebSocket, then schedule auto-save. */
    syncShapes() {
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.context.autoSaveManager.scheduleAutoSave();

        const added: Shape[] = [];
        const modified: Shape[] = [];
        const removed: string[] = [];

        const prevMap = this.api.lastSyncedShapes;

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

        // Update the snapshot incrementally: only shapes that changed are
        // deep-cloned, never the whole array.
        for (const id of removed) prevMap.delete(id);
        for (const shape of added) {
            if (shape.id) prevMap.set(shape.id, structuredClone(shape));
        }
        for (const shape of modified) {
            if (shape.id) prevMap.set(shape.id, structuredClone(shape));
        }
    }

    /** Clear the socket message handler. */
    destroy() {
        this.api.socket.onmessage = null;
    }
}
