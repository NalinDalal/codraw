/**
 * WebSocket connection manager for a collaborative room.
 *
 * Handles:
 * - Fetching a short-lived JWT via httpOnly cookie for WebSocket auth
 * - Guest connections: signed-out users can join any room link without a token
 * - Establishing a WebSocket connection with JWT auth (via `Sec-WebSocket-Protocol`)
 * - Auto-reconnection with exponential backoff (1s → 30s max)
 * - Room join/leave lifecycle
 * - Auth failure detection (redirects to sign-in only for signed-in users)
 * - Loading and error states while connecting
 *
 * Once connected, renders the {@link Canvas} component.
 *
 * @param roomId - The room ID to connect to (from the URL slug)
 */

"use client";

import { HTTP_BACKEND, WS_URL } from "@/config";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Canvas } from "./Canvas";
import { setAuthToken, getAuthToken, clearAuthToken } from "@/lib/auth";
import { recordRecentRoom } from "@/lib/recents";

/** Maximum reconnection delay in milliseconds (30 seconds) */
const MAX_RECONNECT_DELAY = 30_000;
/** Initial reconnection delay in milliseconds (1 second) */
const INITIAL_RECONNECT_DELAY = 1_000;
/** Re-auth interval: refresh token every 4 minutes (token expires in 5) */
const REAUTH_INTERVAL_MS = 4 * 60 * 1000;

/**
 * Resolve a room slug to its numeric database ID via the HTTP backend.
 * Public — works without authentication. Returns null only if the room doesn't exist.
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
 * Returns null for signed-out visitors — they connect as guests instead.
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
  const reauthTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [numericRoomId, setNumericRoomId] = useState<string | null>(null);

  /** Clear any pending reconnection timer */
  const cleanup = () => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (reauthTimer.current) {
      clearInterval(reauthTimer.current);
      reauthTimer.current = null;
    }
  };

  /** Resolve slug to numeric ID on mount */
  useEffect(() => {
    let cancelled = false;
    resolveRoomSlug(roomId).then((id) => {
      if (cancelled) return;
      if (!id) {
        setError("Room not found.");
        return;
      }
      recordRecentRoom(roomId);
      setNumericRoomId(id);
    });
    return () => { cancelled = true; };
  }, [roomId]);

  /** Connect once the numeric ID is resolved */
  useEffect(() => {
    if (!numericRoomId) return;
    unmounted.current = false;

    /** Establish a new WebSocket connection with JWT auth and wire up reconnection */
    async function connect(rid: string) {
      // Signed-in users use a short-lived JWT; visitors connect as guests.
      let token = getAuthToken();
      let authenticated = Boolean(token);
      if (!token) {
        token = await fetchWsToken();
        if (token) {
          authenticated = true;
          setAuthToken(token);
        }
      }

      const ws = new WebSocket(WS_URL, authenticated && token ? ["token", token] : []);

      ws.onerror = () => {
        // onclose will handle reconnection
      };

      ws.onclose = (ev) => {
        if (unmounted.current) return;

        // Stop re-auth timer
        if (reauthTimer.current) {
          clearInterval(reauthTimer.current);
          reauthTimer.current = null;
        }

        // Auth failure — signed-in users are sent to sign in; guests stay put
        if (ev.code === 4001 || ev.code === 1008) {
          clearAuthToken();
          if (authenticated) {
            window.location.href = "/signin";
          }
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

        // Start periodic token refresh (re-auth every 4 min before 5-min expiry)
        // Only signed-in users have tokens — guests skip re-auth entirely.
        if (authenticated) {
          reauthTimer.current = setInterval(async () => {
            if (unmounted.current) return;
            const newToken = await fetchWsToken();
            if (!newToken || unmounted.current) return;
            setAuthToken(newToken);
            ws.send(JSON.stringify({ type: "re_auth", token: newToken }));
          }, REAUTH_INTERVAL_MS);
        }
      };
    }

    connect(numericRoomId);

    return () => {
      unmounted.current = true;
      cleanup();
      setSocket((prev) => {
        if (prev) prev.close(1000);
        return null;
      });
    };
  }, [numericRoomId]);

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
