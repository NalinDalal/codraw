import { uuid } from "@/lib/uuid";
import { CURSOR_TEXT } from "../colorSystem";
import type { GameContext } from "../gameContext";

/** Capabilities the CursorManager needs from the owning Game instance. */
export interface CursorManagerApi {
    roomId: string;
    socket: WebSocket;
    invalidateCache(): void;
    clearCanvas(): void;
}

/**
 * Collaboration cursor state and rendering.
 *
 * Tracks remote user cursor positions, broadcasts the local cursor,
 * and cleans up stale remote cursors. The laser pointer and remote
 * cursors are drawn as overlays on top of the cached scene.
 */
export class CursorManager {
    private localCursorId: string;
    private localUserName = "";
    private localUserColor = "";
    private remoteCursors = new Map<string, { x: number; y: number; name: string; color: string; lastSeen: number }>();
    private cursorBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
    private cursorCleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private context: GameContext,
        private api: CursorManagerApi,
    ) {
        this.localCursorId = uuid();
    }

    /** Set local user info for collaboration cursors. */
    setLocalUser(id: string, name: string, color: string) {
        this.localCursorId = id;
        this.localUserName = name;
        this.localUserColor = color;
    }

    getLocalCursorId(): string {
        return this.localCursorId;
    }

    /** Broadcast the current pointer position to other users in the room. */
    broadcastCursor(x: number, y: number) {
        if (!this.api.socket || this.api.socket.readyState !== WebSocket.OPEN) return;
        if (this.cursorBroadcastTimer) {
            clearTimeout(this.cursorBroadcastTimer);
        }
        this.cursorBroadcastTimer = setTimeout(() => {
            try {
                this.api.socket.send(
                    JSON.stringify({
                        type: "cursor",
                        roomId: this.api.roomId,
                        cursor: { x, y, name: this.localUserName, color: this.localUserColor },
                    }),
                );
            } catch (err) {
                console.warn("Failed to send cursor position", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            this.cursorBroadcastTimer = null;
        }, 16);
    }

    /** Update a remote user's cursor position. */
    updateRemoteCursor(userId: string, cursor: { x: number; y: number; name: string; color: string }) {
        this.remoteCursors.set(userId, { ...cursor, lastSeen: Date.now() });
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    /** Start the cursor cleanup interval. */
    startCursorCleanup() {
        this.cursorCleanupTimer = setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [userId, cursor] of this.remoteCursors) {
                if (now - cursor.lastSeen > 5000) {
                    this.remoteCursors.delete(userId);
                    changed = true;
                }
            }
            if (changed) {
                this.api.invalidateCache();
                this.api.clearCanvas();
            }
        }, 1000);
    }

    /** Draw remote collaboration cursors on the canvas. */
    drawRemoteCursors(ctx: CanvasRenderingContext2D) {
        if (this.remoteCursors.size === 0) return;
        ctx.save();
        ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
        ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
        for (const cursor of this.remoteCursors.values()) {
            const size = 12 / this.context.viewport.zoom;
            const fontSize = 11 / this.context.viewport.zoom;
            ctx.fillStyle = cursor.color;
            ctx.beginPath();
            ctx.moveTo(cursor.x, cursor.y);
            ctx.lineTo(cursor.x + size, cursor.y + size * 2);
            ctx.lineTo(cursor.x + size * 0.6, cursor.y + size * 1.2);
            ctx.closePath();
            ctx.fill();
            ctx.font = `bold ${fontSize}px Arial`;
            const textWidth = ctx.measureText(cursor.name).width;
            const padding = 4 / this.context.viewport.zoom;
            const labelX = cursor.x + size;
            const labelY = cursor.y + size * 2;
            ctx.fillStyle = cursor.color;
            ctx.fillRect(labelX, labelY, textWidth + padding * 2, fontSize + padding * 2);
            ctx.fillStyle = CURSOR_TEXT;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(cursor.name, labelX + padding, labelY + fontSize / 2 + padding);
        }
        ctx.restore();
    }

    /** Cancel timers and release resources. */
    destroy() {
        if (this.cursorBroadcastTimer) {
            clearTimeout(this.cursorBroadcastTimer);
            this.cursorBroadcastTimer = null;
        }
        if (this.cursorCleanupTimer) {
            clearInterval(this.cursorCleanupTimer);
            this.cursorCleanupTimer = null;
        }
    }
}
