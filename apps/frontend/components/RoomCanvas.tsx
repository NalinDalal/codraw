/**
 * WebSocket connection manager for a collaborative room.
 *
 * Handles:
 * - Fetching a short-lived JWT via httpOnly cookie for WebSocket auth
 * - Establishing a WebSocket connection with JWT auth (via `Sec-WebSocket-Protocol`)
 * - Auto-reconnection with exponential backoff (1s → 30s max)
 * - Room join/leave lifecycle
 * - Auth failure detection (redirects to sign-in)
 * - Loading and error states while connecting
 *
 * Once connected, renders the {@link Canvas} component.
 *
 * @param roomId - The room ID to connect to (from the URL slug)
 */

"use client";

import { HTTP_BACKEND, WS_URL } from "@/config";
import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { Canvas } from "./Canvas";
import { setAuthToken, getAuthToken, clearAuthToken } from "@/lib/auth";

/** Maximum reconnection delay in milliseconds (30 seconds) */
const MAX_RECONNECT_DELAY = 30_000;
/** Initial reconnection delay in milliseconds (1 second) */
const INITIAL_RECONNECT_DELAY = 1_000;

/**
 * Resolve a room slug to its numeric database ID via the HTTP backend.
 * Returns the numeric ID string, or null if not found / not authenticated.
 */
async function resolveRoomSlug(slug: string): Promise<string | null> {
  try {
    const res = await axios.get(`${HTTP_BACKEND}/room/${slug}`, {
      withCredentials: true,
    });
    return String(res.data.room.id);
  } catch {
    return null;
  }
}

/**
 * Fetch a short-lived JWT for WebSocket auth.
 * The httpOnly cookie is sent automatically; the backend returns a 5-min token.
 */
async function fetchWsToken(): Promise<string | null> {
  try {
    const res = await axios.get(`${HTTP_BACKEND}/auth/ws-token`, {
      withCredentials: true,
    });
    return res.data.token;
  } catch {
    return null;
  }
}

export function RoomCanvas({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(INITIAL_RECONNECT_DELAY);
  const unmounted = useRef(false);
  const [numericRoomId, setNumericRoomId] = useState<string | null>(null);

  /** Clear any pending reconnection timer */
  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  /** Resolve slug to numeric ID on mount */
  useEffect(() => {
    let cancelled = false;
    resolveRoomSlug(roomId).then((id) => {
      if (cancelled) return;
      if (!id) {
        setError("Room not found.");
        return;
      }
      setNumericRoomId(id);
    });
    return () => { cancelled = true; };
  }, [roomId]);

  /** Establish a new WebSocket connection with JWT auth and wire up reconnection */
  const connect = useCallback(async (rid: string) => {
    // Fetch a short-lived token for WS auth (uses httpOnly cookie)
    let token = getAuthToken();
    if (!token) {
      token = await fetchWsToken();
      if (!token) {
        setError("You must be signed in to join a room.");
        return;
      }
      setAuthToken(token);
    }

    const ws = new WebSocket(WS_URL, ["token", token]);

    ws.onerror = () => {
      // onclose will handle reconnection
    };

    ws.onclose = (ev) => {
      if (unmounted.current) return;

      // Auth failure — clear token and redirect to sign in
      if (ev.code === 4001 || ev.code === 1008) {
        clearAuthToken();
        window.location.href = "/signin";
        return;
      }

      // Normal close after intentional disconnect — don't reconnect
      if (ev.code === 1000) return;

      // Connection lost — clear cached token so a fresh one is fetched on reconnect
      clearAuthToken();
      setSocket(null);
      setReconnecting(true);

      reconnectTimer.current = setTimeout(() => {
        if (unmounted.current) return;
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          MAX_RECONNECT_DELAY,
        );
        connect(rid);
      }, reconnectDelay.current);
    };

    ws.onopen = () => {
      if (unmounted.current) {
        ws.close(1000);
        return;
      }

      reconnectDelay.current = INITIAL_RECONNECT_DELAY;
      setReconnecting(false);
      setSocket(ws);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId: rid,
        }),
      );
    };
  }, []);

  /** Connect once the numeric ID is resolved */
  useEffect(() => {
    if (!numericRoomId) return;
    unmounted.current = false;
    connect(numericRoomId);

    return () => {
      unmounted.current = true;
      cleanup();
      setSocket((prev) => {
        if (prev) prev.close(1000);
        return null;
      });
    };
  }, [numericRoomId, connect, cleanup]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!socket || !numericRoomId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">
          {reconnecting ? "Reconnecting..." : "Connecting to server..."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Canvas roomId={numericRoomId} socket={socket} />
    </div>
  );
}
