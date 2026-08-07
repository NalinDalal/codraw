/**
 * HTTP client for shape persistence.
 *
 * Provides two core operations:
 * - {@link saveShapes} — persist the full canvas state (auto-save)
 * - {@link getExistingShapes} — load shapes on page load
 *
 * Authentication uses httpOnly cookies (sent automatically with credentials).
 * The server enforces optimistic concurrency via `baseVersion`.
 *
 * @module http
 */

import { HTTP_BACKEND } from "@/config";
import axios from "axios";
import { Shape } from "@repo/shapes";

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
        { withCredentials: true },
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
 * Load the latest full-state snapshot for a room.
 *
 * Uses the dedicated `/shapes/:roomId` endpoint instead of fetching
 * all chat messages, which avoids transferring unnecessary data and
 * keeps initial load fast even in rooms with long chat histories.
 *
 * @param roomId - The room ID to load shapes for
 * @returns The shapes and the latest message version number
 */
export async function getExistingShapes(roomId: string): Promise<ShapesResponse> {
    const res = await axios.get(`${HTTP_BACKEND}/shapes/${roomId}`, {
        withCredentials: true,
    });
    const shapes = Array.isArray(res.data.shapes) ? res.data.shapes : [];
    const version = typeof res.data.version === "number" ? res.data.version : 0;
    return { shapes, version };
}
