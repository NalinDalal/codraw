/**
 * HTTP client for shape persistence.
 *
 * Provides two core operations:
 * - {@link saveShapes} — persist the full canvas state (auto-save)
 * - {@link getExistingShapes} — load shapes on page load
 *
 * All requests include a JWT `Authorization` header from localStorage.
 * The server enforces optimistic concurrency via `baseVersion`.
 *
 * @module http
 */

import { HTTP_BACKEND } from "@/config";
import axios from "axios";
import { Shape } from "./shapes";

/**
 * Build an Authorization header from the JWT stored in localStorage.
 *
 * @returns Headers object with `Authorization: Bearer <token>`,
 *   or `undefined` if no token is stored
 */
function authHeaders(): Record<string, string> | undefined {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : undefined;
}

/**
 * Persist the current shapes as a full-state snapshot via HTTP.
 *
 * Sends a POST to `/shapes/:roomId` with the complete shape array and
 * the `baseVersion` for optimistic concurrency control. The server
 * rejects the save (409) if another client saved since `baseVersion`.
 *
 * Called by the auto-save debounce timer in the Game engine.
 *
 * @param roomId - The room ID to save shapes for
 * @param shapes - Complete array of shapes on the canvas
 * @param baseVersion - The version number from the last load (for concurrency)
 * @returns Server response containing `{ ok: true, version: number }`
 * @throws If the server returns a 409 conflict or other error
 */
export async function saveShapes(roomId: string, shapes: Shape[], baseVersion: number) {
    const res = await axios.post(
        `${HTTP_BACKEND}/shapes/${roomId}`,
        { shapes, baseVersion },
        { headers: authHeaders() },
    );
    return res.data;
}

/**
 * Response from {@link getExistingShapes} containing the loaded shapes
 * and the latest version number for optimistic concurrency.
 */
export interface ShapesResponse {
    /** The loaded shape array (may be empty) */
    shapes: Shape[];
    /** The message ID of the latest full-state snapshot (used as baseVersion) */
    version: number;
}

/**
 * Load all shapes from the chat history for a given room.
 *
 * Handles two message formats stored in the database:
 * - **Full-state snapshots** (`{ type: "full-state", shapes: [...] }`) —
 *   takes precedence over individual messages
 * - **Individual shape messages** (`{ shape: {...} }`) — legacy format,
 *   accumulated in order
 *
 * If a full-state snapshot exists, it is returned directly (ignoring
 * individual messages). Otherwise, individual shapes are collected.
 *
 * @param roomId - The room ID to load shapes for
 * @returns The shapes and the latest message version number
 */
export async function getExistingShapes(roomId: string): Promise<ShapesResponse> {
    const res = await axios.get(`${HTTP_BACKEND}/chats/${roomId}`, {
        headers: authHeaders(),
    });
    const messages = res.data.messages;
    if (!messages || messages.length === 0) return { shapes: [], version: 0 };

    const shapes: Shape[] = [];
    let latestFullState: Shape[] | null = null;
    let latestVersion = 0;

    for (const { id, message } of messages) {
        try {
            const data = JSON.parse(message);
            if (data.type === "full-state" && Array.isArray(data.shapes)) {
                latestFullState = data.shapes;
                latestVersion = id;
            } else if (data.shape) {
                shapes.push(data.shape);
            }
        } catch {
            // skip malformed messages
        }
    }

    if (latestFullState) return { shapes: latestFullState, version: latestVersion };
    return { shapes, version: latestVersion };
}
