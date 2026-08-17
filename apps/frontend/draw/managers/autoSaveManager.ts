import { saveShapes } from "../http";
import type { GameContext } from "../gameContext";
import { Shape } from "@repo/shapes";

/** Capabilities the AutoSaveManager needs from the owning Game instance. */
export interface AutoSaveManagerApi {
    roomId: string;
    socket: WebSocket;
    get existingShapes(): Shape[];
    get selectedIds(): Set<string>;
    invalidateCache(): void;
    clearCanvas(): void;
    notifySelection(): void;
}

/**
 * Auto-save with exponential backoff and 409 conflict merging.
 *
 * Persists shapes to the server after a quiet period, retries with
 * backoff on transient failures, and merges remote and local changes
 * on version conflicts.
 */
export class AutoSaveManager {
    private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private autoSaveDisabled = false;
    private autoSaveRetries = 0;

    constructor(
        private context: GameContext,
        private api: AutoSaveManagerApi,
    ) {}

    /** Cancel any pending auto-save timer. */
    cancelAutoSave() {
        if (this.autoSaveTimer !== null) {
            clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /** Schedule an auto-save with exponential backoff (2s → 30s max). */
    scheduleAutoSave() {
        if (this.autoSaveDisabled) return;
        this.cancelAutoSave();
        const delay = Math.min(2000 * Math.pow(2, this.autoSaveRetries), 30_000);
        this.autoSaveTimer = setTimeout(() => this.performAutoSave(), delay);
    }

    /** Save immediately, skipping the debounce. */
    flushAutoSave() {
        if (this.autoSaveDisabled) return;
        this.cancelAutoSave();
        this.performAutoSave();
    }

    /** Disable auto-save (e.g. for read-only rooms). */
    disableAutoSave() {
        this.autoSaveDisabled = true;
        this.cancelAutoSave();
    }

    private async performAutoSave() {
        try {
            const res = await saveShapes(this.api.roomId, this.context.existingShapes, this.context.trash, this.context.lastSavedVersion);
            this.context.lastSavedVersion = res.version ?? this.context.lastSavedVersion;
            this.autoSaveRetries = 0;
        } catch (err: any) {
            if (err?.response?.status === 409) {
                const remoteShapes: Shape[] = err.response.data.shapes ?? [];
                const syncedMap = this.context.lastSyncedShapes;
                const localModified = new Set<string>();
                for (const s of this.context.existingShapes) {
                    if (!s.id) continue;
                    const prev = syncedMap.get(s.id);
                    if (!prev || JSON.stringify(prev) !== JSON.stringify(s)) {
                        localModified.add(s.id);
                    }
                }
                const remoteMap = new Map(remoteShapes.map((s) => [s.id, s]));
                const merged: Shape[] = [];
                for (const rs of remoteShapes) {
                    if (rs.id && localModified.has(rs.id)) {
                        const local = this.context.existingShapes.find((s) => s.id === rs.id);
                        merged.push(local ?? rs);
                    } else {
                        merged.push(rs);
                    }
                }
                for (const ls of this.context.existingShapes) {
                    if (ls.id && !remoteMap.has(ls.id)) merged.push(ls);
                }
                this.context.existingShapes = merged;
                this.context.lastSyncedShapes = new Map(
                    merged.filter((s) => Boolean(s.id)).map((s) => [s.id!, structuredClone(s)]),
                );
                this.context.lastSavedVersion = err.response.data.version ?? this.context.lastSavedVersion;
                this.context.selectedIds.clear();
                this.api.notifySelection();
                this.api.invalidateCache();
                this.api.clearCanvas();
                this.autoSaveRetries = 0;
            } else if (err?.response?.status === 403) {
                this.autoSaveDisabled = true;
                this.cancelAutoSave();
            } else {
                this.autoSaveRetries++;
            }
            if (!this.autoSaveDisabled) {
                this.scheduleAutoSave();
            }
        }
    }
}
