/**
 * WebSocket server for real-time collaboration.
 *
 * Handles:
 * - JWT authentication via `Sec-WebSocket-Protocol` header (token never in URL)
 * - Token-less guest connections: anyone with a room link can join and draw
 * - Room join/leave lifecycle with database validation
 * - Shape-diff broadcast via Bun pub/sub room topics (sender excluded)
 * - Per-shape version/author stamping (last-writer-wins + staleness filter)
 * - Presence: join/leave events, peer lists, server-assigned cursor colors
 * - Shape payload validation (rejects malformed shapes before relay)
 * - Per-room per-connection message rate limits
 * - Chat message persistence and broadcast
 * - Per-IP rate limiting (30 connections/min)
 * - Message size limits (1 MB WS, 64 KB chat)
 * - Graceful shutdown (SIGTERM/SIGINT)
 *
 * Message types:
 * - `join_room` — Join a room (validates room exists in DB)
 * - `leave_room` — Leave a room
 * - `chat` — Send and persist a chat message
 * - `shape-diff` — Broadcast shape changes to other room members
 * - `cursor` — Broadcast pointer position with server-assigned color
 * - `presence` — Server→client join/leave/list notifications
 * - `shape-diff-ack` — Server→sender authoritative versions for a diff
 *
 * @module ws-backend
 */

import { prismaClient } from "@repo/db/client";
import { validateEnv, getJwtSecret } from "@repo/common/env";
import { getClientIp } from "@repo/common/network";
import { rateLimit } from "@repo/common/ratelimit";
import { verifyJwt } from "@repo/common/jwt";
import { filterValidShapes } from "@repo/shapes";
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

/** A member of a room, as seen by the rest of the room. */
type RoomMember = {
  userId: string;
  name: string;
  isGuest: boolean;
  /** Server-assigned cursor color, stable for the member while in the room */
  color: string;
};

/**
 * Track all active WebSocket connections.
 * Used for cleanup on shutdown (broadcast itself uses room topics).
 */
const clients = new Set<ServerWebSocket<WebSocketData>>();

/** Cursor colors assigned server-side, in assignment order. */
const CURSOR_PALETTE = [
  "#f472b6",
  "#a78bfa",
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#22d3ee",
  "#a3e635",
  "#f97316",
  "#e879f9",
];

/** Per-room member map (userId → member). Presence state for the instance. */
const roomMembers = new Map<number, Map<string, RoomMember>>();
/** Per-room per-shape version bookkeeping (id → { v, author }). */
const shapeVersions = new Map<number, Map<string, { v: number; author: string }>>();
/** One-shot cleanup timers for empty rooms (re-arm on re-join). */
const roomIdleTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** Room topic name for Bun pub/sub (one topic per room). */
function roomTopic(roomId: number): string {
  return `room:${roomId}`;
}

/** Sanitize a display name: plain text, trimmed, capped length. */
function sanitizeName(name: unknown, fallback = "Guest"): string {
  if (typeof name !== "string") return fallback;
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32);
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Validate a client-supplied stable guest id. */
function sanitizeGuestId(guestId: unknown): string | null {
  if (typeof guestId !== "string") return null;
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(guestId)) return null;
  return guestId;
}

/** Assign a cursor color to a member (stable per member while in the room). */
function memberColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_PALETTE[hash % CURSOR_PALETTE.length]!;
}

/** Public member view (no internal fields). */
function memberPublic(m: RoomMember) {
  return { userId: m.userId, name: m.name, isGuest: m.isGuest, color: m.color };
}

/** Whether any live connection of `userId` remains in `roomId`. */
function hasLiveSocket(roomId: number, userId: string): boolean {
  for (const ws of clients) {
    if (ws.data.userId === userId && ws.data.rooms.includes(roomId)) return true;
  }
  return false;
}

/** Remove the member and (after a grace period) version state of an empty room. */
function pruneRoomIfEmpty(roomId: number) {
  const members = roomMembers.get(roomId);
  if (!members || members.size > 0) return;
  roomMembers.delete(roomId);
  // Keep shape versions briefly so a quick re-join by the same peers
  // cannot restart numbering and accidentally re-accept stale diffs.
  if (!roomIdleTimers.has(roomId)) {
    roomIdleTimers.set(
      roomId,
      setTimeout(() => {
        roomIdleTimers.delete(roomId);
        if (roomMembers.has(roomId)) return;
        shapeVersions.delete(roomId);
      }, 60_000),
    );
  }
}

/** Add a member to a room, assigning a stable cursor color on first join. */
function upsertMember(roomId: number, member: RoomMember) {
  let members = roomMembers.get(roomId);
  if (!members) {
    members = new Map();
    roomMembers.set(roomId, members);
  }
  const existing = members.get(member.userId);
  if (existing) {
    existing.name = member.name;
    existing.isGuest = member.isGuest;
    return existing;
  }
  const colored = { ...member, color: memberColor(member.userId) };
  members.set(member.userId, colored);
  return colored;
}

// ─── Rate limiting (in-memory, per IP / per room-connection) ─
// Cleanup is handled inside the shared rateLimit module

/** Max shape-diff/chat/cursor messages per (room, connection) per window. */
const ROOM_MSG_LIMIT = 150;
const ROOM_MSG_WINDOW = 10_000;

/** Cap on shapes relayed per shape-diff message (per added/modified array). */
const MAX_SHAPES_PER_DIFF = 2000;

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
     * Route incoming messages by type.
     *
     * Messages exceeding {@link MAX_WS_MESSAGE_SIZE} cause an immediate close.
     * `shape-diff` messages are validated, rate-limited per room+connection,
     * stamped with per-shape versions, relayed to the room topic, and acked
     * to the sender.
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
          if (!room) {
            ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
            return;
          }
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Failed to join room" }));
          return;
        }

        // Guests may carry a client-generated stable id so their identity
        // (and cursor color) survives reconnects within a session.
        let userId = ws.data.userId;
        if (ws.data.isGuest) {
          const stable = sanitizeGuestId(parsedData.guestId);
          if (stable) userId = stable;
        }

        ws.data.rooms.push(roomId);
        ws.subscribe(roomTopic(roomId));

        const member = upsertMember(roomId, {
          userId,
          name: sanitizeName(parsedData.name),
          isGuest: ws.data.isGuest,
          color: "",
        });

        // Joiner gets the full peer list (and their own assigned color).
        const members = roomMembers.get(roomId);
        ws.send(
          JSON.stringify({
            type: "presence",
            action: "list",
            roomId,
            members: members ? [...members.values()].map(memberPublic) : [memberPublic(member)],
          }),
        );
        // Everyone else hears about the join.
        ws.publish(
          roomTopic(roomId),
          JSON.stringify({
            type: "presence",
            action: "join",
            roomId,
            member: memberPublic(member),
          }),
        );
        return;
      }

      if (parsedData.type === "leave_room") {
        const roomId = parsedData.roomId;
        if (!roomId) return;
        ws.data.rooms = ws.data.rooms.filter((x) => x !== roomId);
        ws.unsubscribe(roomTopic(roomId));
        removeMemberFromRoom(roomId, ws.data.userId);
      }

      if (parsedData.type === "chat") {
        const roomId = parsedData.roomId;
        const chatMessage = parsedData.message;

        if (!roomId || !chatMessage) return;
        if (typeof chatMessage !== "string") return;
        if (encoder.encode(chatMessage).byteLength > MAX_CHAT_MESSAGE_SIZE) return;

        // Verify user is in this room before persisting/broadcasting
        if (!ws.data.rooms.includes(roomId)) return;
        if (!rateLimit(`msg:${roomId}:${ws.data.userId}`, ROOM_MSG_LIMIT, ROOM_MSG_WINDOW)) {
          ws.send(JSON.stringify({ type: "error", code: "rate_limited", message: "Too many messages" }));
          return;
        }

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

        ws.publish(
          roomTopic(roomId),
          JSON.stringify({ type: "chat", message: chatMessage, roomId }),
        );
      }

      if (parsedData.type === "shape-diff") {
        const roomId = parsedData.roomId;
        if (!roomId) return;
        if (!ws.data.rooms.includes(roomId)) return;
        if (!rateLimit(`msg:${roomId}:${ws.data.userId}`, ROOM_MSG_LIMIT, ROOM_MSG_WINDOW)) {
          ws.send(JSON.stringify({ type: "error", code: "rate_limited", message: "Too many shape updates" }));
          return;
        }

        // Validate payloads: only well-formed Shape unions are relayed.
        const added = filterValidShapes(parsedData.added).slice(0, MAX_SHAPES_PER_DIFF);
        const modified = filterValidShapes(parsedData.modified).slice(0, MAX_SHAPES_PER_DIFF);
        const removed: string[] = [];
        if (Array.isArray(parsedData.removed)) {
          for (const id of parsedData.removed.slice(0, MAX_SHAPES_PER_DIFF)) {
            if (typeof id === "string" && id.length > 0 && id.length <= 64) {
              removed.push(id);
            }
          }
        }
        if (added.length === 0 && modified.length === 0 && removed.length === 0) return;

        // Stamp authoritative per-shape versions (last-writer-wins).
        let versions: Record<string, { v: number; author: string }> = {};
        if (added.length > 0 || modified.length > 0) {
          let roomVersions = shapeVersions.get(roomId);
          if (!roomVersions) {
            roomVersions = new Map();
            shapeVersions.set(roomId, roomVersions);
          }
          const author = ws.data.userId;
          versions = {};
          for (const shape of [...added, ...modified]) {
            if (!shape.id) continue;
            const rec = roomVersions.get(shape.id) ?? { v: 0, author };
            rec.v++;
            rec.author = author;
            roomVersions.set(shape.id, rec);
            versions[shape.id] = rec;
          }
        }

        ws.publish(
          roomTopic(roomId),
          JSON.stringify({
            type: "shape-diff",
            roomId,
            added,
            modified,
            removed,
            versions,
            author: ws.data.userId,
          }),
        );

        // Echo authoritative versions to the sender so it can drop stale
        // re-broadcasts of the same shape.
        ws.send(JSON.stringify({ type: "shape-diff-ack", versions }));
      }

      if (parsedData.type === "cursor") {
        const roomId = parsedData.roomId;
        const cursor = parsedData.cursor;
        if (!roomId || !cursor) return;
        if (!ws.data.rooms.includes(roomId)) return;
        if (!rateLimit(`msg:${roomId}:${ws.data.userId}`, ROOM_MSG_LIMIT, ROOM_MSG_WINDOW)) {
          return;
        }

        const x = Number(cursor.x);
        const y = Number(cursor.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        // The server owns the color; the client's name updates the member.
        const member = roomMembers.get(roomId)?.get(ws.data.userId);
        const name = sanitizeName(cursor.name, member?.name);
        if (member) member.name = name;

        ws.publish(
          roomTopic(roomId),
          JSON.stringify({
            type: "cursor",
            roomId,
            userId: ws.data.userId,
            cursor: {
              x,
              y,
              name,
              color: member?.color ?? memberColor(ws.data.userId),
            },
          }),
        );
      }
    },

    /**
     * Remove disconnected client from the global tracking set, announce
     * the leave to room peers, and clean up room state.
     */
    close(ws) {
      clients.delete(ws);
      for (const roomId of ws.data.rooms) {
        ws.unsubscribe(roomTopic(roomId));
        removeMemberFromRoom(roomId, ws.data.userId);
      }
      ws.data.rooms = [];
    },
  },
});

/** Remove a member from a room once no socket of theirs remains. */
function removeMemberFromRoom(roomId: number, userId: string) {
  const members = roomMembers.get(roomId);
  if (!members) return;
  const existing = members.get(userId);
  if (!existing) return;
  if (hasLiveSocket(roomId, userId)) return;

  members.delete(userId);
  wsPublish(roomTopic(roomId), {
    type: "presence",
    action: "leave",
    roomId,
    member: memberPublic(existing),
  });
  pruneRoomIfEmpty(roomId);
}

/** Publish a JSON message to a topic via the server (best-effort). */
function wsPublish(topic: string, payload: unknown) {
  server.publish(topic, JSON.stringify(payload));
}

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
  for (const timer of roomIdleTimers.values()) {
    clearTimeout(timer);
  }
  roomIdleTimers.clear();
  await prismaClient.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
