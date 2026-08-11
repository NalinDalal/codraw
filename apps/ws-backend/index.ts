/**
 * WebSocket server for real-time collaboration.
 *
 * Handles:
 * - JWT authentication via `Sec-WebSocket-Protocol` header (token never in URL)
 * - Token-less guest connections: anyone with a room link can join and draw
 * - Room join/leave lifecycle with database validation
 * - Shape-diff broadcast (only to clients in the same room)
 * - Chat message persistence and broadcast
 * - Per-IP rate limiting (30 connections/min)
 * - Message size limits (1 MB WS, 64 KB chat, 512 KB DB)
 * - Graceful shutdown (SIGTERM/SIGINT)
 *
 * Message types:
 * - `join_room` — Join a room (validates room exists in DB)
 * - `leave_room` — Leave a room
 * - `chat` — Send and persist a chat message
 * - `shape-diff` — Broadcast shape changes to other room members
 *
 * @module ws-backend
 */

import { prismaClient } from "@repo/db/client";
import { validateEnv, getJwtSecret } from "@repo/common/env";
import { getClientIp } from "@repo/common/network";
import { rateLimit } from "@repo/common/ratelimit";
import { verifyJwt } from "@repo/common/jwt";
import type { ServerWebSocket } from "bun";

// ─── Startup validation ─────────────────────────────────────
validateEnv();

/** JWT secret used for token verification (validated at startup) */
const JWT_SECRET = getJwtSecret();

/** Data attached to each WebSocket connection */
type WebSocketData = {
  /** The authenticated user's ID extracted from the JWT, or a generated guest ID */
  userId: string;
  /** True for token-less connections (guests cannot persist chat, only broadcast) */
  isGuest: boolean;
  /** Room IDs this connection is currently subscribed to */
  rooms: number[];
};

/**
 * Track all active WebSocket connections.
 * Used to broadcast messages to room members and to clean up on shutdown.
 */
const clients = new Set<ServerWebSocket<WebSocketData>>();

// ─── Rate limiting (in-memory, per IP) ──────────────────────
// Cleanup is handled inside the shared rateLimit module

// ─── HTTP handler ───────────────────────────────────────────
/**
 * Handle plain HTTP requests (health checks only).
 * Returns "ok" for GET /health, undefined for everything else.
 *
 * @param req - The incoming HTTP request
 * @returns A 200 "ok" Response for GET /health, or undefined to fall through to the WebSocket upgrade handler
 */
function handleHttp(req: Request): Response | undefined {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }
  return undefined;
}

// ─── Message size limit ─────────────────────────────────────
/** Maximum incoming WebSocket message size (1 MB) */
const MAX_WS_MESSAGE_SIZE = 1 * 1024 * 1024; // 1 MB
/** Maximum chat message text size (64 KB) */
const MAX_CHAT_MESSAGE_SIZE = 64 * 1024; // 64 KB for chat text
/** Shared TextEncoder instance for measuring message byte lengths */
const encoder = new TextEncoder();

/**
 * Bun WebSocket server instance.
 * Listens on {@link PORT} and handles HTTP upgrades, message routing,
 * room management, and connection lifecycle.
 */
const server = Bun.serve<WebSocketData>({
  port: Number(Bun.env.PORT) || 8080,

  /**
   * HTTP handler — used for health checks and WebSocket upgrade.
   * JWT is extracted from the Sec-WebSocket-Protocol header (not query param).
   * This prevents the token from appearing in server logs or URLs.
   */
  fetch(req, server) {
    const httpResp = handleHttp(req);
    if (httpResp) return httpResp;

    // Rate-limit WebSocket upgrades per IP (30 connections/min)
    const ip = getClientIp(req);
    if (!rateLimit(`ws:${ip}`, 30, 60_000)) {
      return new Response("Too many requests", { status: 429 });
    }

    // Extract JWT from Sec-WebSocket-Protocol header (optional)
    const protoHeader = req.headers.get("sec-websocket-protocol") || "";
    const parts = protoHeader.split(",").map((p) => p.trim());
    let token = "";
    if (parts.length === 2 && parts[0] === "token") {
      token = parts[1]!;
    }

    // Token present but invalid → reject. Missing token → allow as guest.
    let userId: string | null = null;
    if (token) {
      userId = checkUser(token);
      if (!userId) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Guests get an anonymous identity so broadcasts/cursors still work.
    const connectionData: WebSocketData = {
      userId: userId ?? `guest-${crypto.randomUUID()}`,
      isGuest: !userId,
      rooms: [],
    };
    const upgradeOptions: {
      data: WebSocketData;
      headers?: Record<string, string>;
    } = { data: connectionData };
    if (protoHeader) {
      upgradeOptions.headers = { "Sec-WebSocket-Protocol": protoHeader };
    }

    // Echo back the subprotocol so the browser accepts the connection
    const success = server.upgrade(req, upgradeOptions);
    return success
      ? undefined
      : new Response("WebSocket upgrade failed", { status: 400 });
  },

  websocket: {
    /**
     * Track new connections in the global client set.
     * Called after a successful WebSocket upgrade.
     */
    open(ws) {
      clients.add(ws);
    },

    /**
     * Route incoming messages by type:
     * - `re_auth`: Refresh the JWT token for this connection
     * - `join_room`: Add client to a room (validates room exists in DB)
     * - `leave_room`: Remove client from a room
     * - `chat`: Persist message and broadcast to room peers
     * - `shape-diff`: Broadcast shape changes to room peers
     *
     * Messages exceeding {@link MAX_WS_MESSAGE_SIZE} cause an immediate close.
     *
     * @param ws - The WebSocket connection that sent the message
     * @param message - The raw message payload (must be a JSON string)
     */
    async message(ws, message) {
      if (typeof message !== "string") return;
      if (encoder.encode(message).byteLength > MAX_WS_MESSAGE_SIZE) {
        ws.close(1009, "message too large");
        return;
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(message);
      } catch {
        return;
      }

      // Clients send roomId as a string; the DB and `ws.data.rooms` use
      // numbers. Normalize once so joins and broadcast matching work —
      // without this, Prisma throws on the Int lookup and room membership
      // checks (includes) silently never match.
      if (parsedData.roomId != null) {
        const numericRoomId = Number(parsedData.roomId);
        if (!Number.isInteger(numericRoomId)) return;
        parsedData.roomId = numericRoomId;
      }

      if (parsedData.type === "re_auth") {
        const newToken = parsedData.token;
        if (!newToken || typeof newToken !== "string") return;

        const newUserId = checkUser(newToken);
        if (!newUserId) {
          ws.close(4001, "invalid token");
          return;
        }

        ws.data.userId = newUserId;
        ws.send(JSON.stringify({ type: "re_auth_ok" }));
        return;
      }

      if (parsedData.type === "join_room") {
        const roomId = parsedData.roomId;
        if (!roomId) return;

        // Await DB lookup to prevent race condition
        try {
          const room = await prismaClient.room.findUnique({ where: { id: roomId } });
          if (room) {
            ws.data.rooms.push(roomId);
          } else {
            ws.send(
              JSON.stringify({ type: "error", message: "Room not found" }),
            );
          }
        } catch {
          ws.send(
            JSON.stringify({ type: "error", message: "Failed to join room" }),
          );
        }
        return;
      }

      if (parsedData.type === "leave_room") {
        const roomId = parsedData.roomId;
        if (!roomId) return;
        ws.data.rooms = ws.data.rooms.filter((x) => x !== roomId);
      }

      if (parsedData.type === "chat") {
        const roomId = parsedData.roomId;
        const chatMessage = parsedData.message;

        if (!roomId || !chatMessage) return;
        if (typeof chatMessage !== "string") return;
        if (encoder.encode(chatMessage).byteLength > MAX_CHAT_MESSAGE_SIZE) return;

        // Verify user is in this room before persisting/broadcasting
        if (!ws.data.rooms.includes(roomId)) return;

        // Guests broadcast live but aren't persisted (Chat.userId is a User FK)
        if (!ws.data.isGuest) {
          const persistChat = () =>
            prismaClient.chat.create({
              data: {
                roomId,
                message: chatMessage,
                userId: ws.data.userId,
              },
            });

          persistChat().catch((err) => {
            console.error("Failed to persist chat message", {
              roomId,
              userId: ws.data.userId,
              messageLength: chatMessage.length,
              error: err instanceof Error ? err.message : String(err),
            });

            // One bounded retry — DB blips (e.g. cold starts) are transient
            setTimeout(() => {
              persistChat().catch((retryErr) => {
                console.error("Retry failed — chat message dropped", {
                  roomId,
                  userId: ws.data.userId,
                  messageLength: chatMessage.length,
                  error: retryErr instanceof Error ? retryErr.message : String(retryErr),
                });
              });
            }, 1000);
          });
        }

        for (const client of clients) {
          if (client !== ws && client.data.rooms.includes(roomId)) {
            client.send(
              JSON.stringify({
                type: "chat",
                message: chatMessage,
                roomId,
              }),
            );
          }
        }
      }

      if (parsedData.type === "shape-diff") {
        const roomId = parsedData.roomId;
        if (!roomId) return;
        if (!ws.data.rooms.includes(roomId)) return;

        for (const client of clients) {
          if (client !== ws && client.data.rooms.includes(roomId)) {
            client.send(message);
          }
        }
      }

      if (parsedData.type === "cursor") {
        const roomId = parsedData.roomId;
        const cursor = parsedData.cursor;
        if (!roomId || !cursor) return;
        if (!ws.data.rooms.includes(roomId)) return;

        for (const client of clients) {
          if (client !== ws && client.data.rooms.includes(roomId)) {
            client.send(
              JSON.stringify({
                type: "cursor",
                roomId,
                userId: ws.data.userId,
                cursor,
              }),
            );
          }
        }
      }
    },

    /**
     * Remove disconnected client from the global tracking set.
     * Ensures no stale references remain for broadcasting.
     */
    close(ws) {
      clients.delete(ws);
    },
  },
});

/**
 * Verify a JWT token and extract the user ID.
 * Uses HS256 signing with the server's JWT secret.
 *
 * @param token - The JWT string to verify
 * @returns The userId from the token payload, or null if the token is invalid, expired, or missing the userId claim
 */
function checkUser(token: string): string | null {
  try {
    const decoded = verifyJwt(token, JWT_SECRET);
    if (!decoded) return null;
    if (!decoded.userId) return null;
    return decoded.userId as string;
  } catch {
    return null;
  }
}

console.log(`WebSocket server running on ws://localhost:${server.port}`);

// ─── Graceful shutdown ──────────────────────────────────────
/**
 * Gracefully shut down the server: close all WebSocket connections, stop accepting
 * new connections, and disconnect from the database.
 *
 * @param signal - The signal that triggered the shutdown (e.g. "SIGTERM" or "SIGINT")
 */
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully`);
  server.stop(true);
  for (const client of clients) {
    client.close(1001, "server shutting down");
  }
  clients.clear();
  await prismaClient.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
