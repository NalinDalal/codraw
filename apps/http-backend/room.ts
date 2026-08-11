/**
 * Room and shape persistence handlers.
 *
 * Endpoints:
 * - **POST /room** — Create a new collaboration room (auth required)
 * - **GET /room/:slug** — Look up a room by slug (public — anyone with the link can join)
 * - **GET /chats/:roomId** — Fetch chat/shape history (public)
 * - **POST /shapes/:roomId** — Save full-state snapshot (admin only, with optimistic concurrency)
 * - **GET /shapes/:roomId** — Load latest full-state snapshot (public)
 *
 * Shape persistence uses a "full-state snapshot" approach: the entire
 * shape array is serialized as a JSON message and stored in the Chat
 * table. Optimistic concurrency is enforced via `baseVersion` (the
 * message ID of the last known save).
 *
 * @module room
 */

import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { middleware } from "./middleware";
import { corsResponse } from "./response";
import { readJsonBody } from "./body";
import { rateLimit } from "./ratelimit";
import { getClientIp } from "@repo/common/network";

/** Maximum serialized message size written to the DB (512 KB) */
const MAX_DB_ROW_SIZE = 512 * 1024;
const encoder = new TextEncoder();

/** Rate limit for read endpoints (60 req/min per user) */
const READ_RATE_LIMIT = 60;
const READ_RATE_WINDOW = 60_000;

/** Validation schema for POST /room */
const CreateRoomSchema = z.object({
  name: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, "Slug must be alphanumeric (hyphens and underscores allowed)"),
});

/**
 * POST /room
 * Create a new collaboration room. Requires authentication.
 * Returns { roomId } or errors on duplicate slug.
 */
export async function createRoomHandler(req: Request) {
  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }

  const parsed = await readJsonBody<{ name: string }>(req);
  if ("error" in parsed) return parsed.error;
  const parsedData = CreateRoomSchema.safeParse(parsed.data);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 }, req);
  }

  try {
    const room = await prismaClient.room.create({
      data: { slug: parsedData.data.name, adminId: userId },
    });
    return corsResponse({ slug: room.slug }, {}, req);
  } catch {
    return corsResponse(
      { message: "Room already exists with this name" },
      { status: 411 },
      req,
    );
  }
}

/**
 * Verify a room exists by ID. Returns the room or null.
 */
async function requireRoom(roomId: number) {
  return prismaClient.room.findUnique({ where: { id: roomId } });
}

/**
 * GET /chats/:roomId
 * Fetch up to 1000 chat messages (including shape data) for a room.
 * Public — anyone who has joined the room can read its history.
 */
export async function getChatsHandler(url: URL, req: Request) {
  const roomId = Number(url.pathname.split("/")[2]);
  if (!roomId) {
    return corsResponse({ message: "Invalid roomId" }, { status: 400 }, req);
  }

  // Guests (no user) are rate-limited by IP so they can't share one bucket
  const userId = middleware(req);
  const limiterKey = userId ?? `guest:${getClientIp(req)}`;

  if (!rateLimit(`read:${limiterKey}`, READ_RATE_LIMIT, READ_RATE_WINDOW)) {
    return corsResponse(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
      req,
    );
  }

  const room = await requireRoom(roomId);
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
  }

  try {
    const messages = await prismaClient.chat.findMany({
      where: { roomId },
      orderBy: { id: "asc" },
      take: 1000,
    });
    return corsResponse({ messages }, {}, req);
  } catch {
    return corsResponse({ message: "Failed to load messages" }, { status: 500 }, req);
  }
}

/**
 * GET /room/:slug
 * Look up a room by its human-readable slug name.
 * Public — anyone with the link can join; only the admin can create rooms.
 */
export async function getRoomHandler(url: URL, req: Request) {
  const slug = url.pathname.split("/")[2];
  const room = await prismaClient.room.findUnique({
    where: { slug },
    select: { id: true, slug: true, createdAt: true },
  });
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
  }
  return corsResponse({ room }, {}, req);
}

/**
 * GET /rooms/mine
 * List all rooms created by the authenticated user, newest first.
 * Requires authentication.
 */
export async function getMyRoomsHandler(req: Request) {
  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }

  if (!rateLimit(`read:${userId}`, READ_RATE_LIMIT, READ_RATE_WINDOW)) {
    return corsResponse(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
      req,
    );
  }

  const rooms = await prismaClient.room.findMany({
    where: { adminId: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, createdAt: true },
  });
  return corsResponse({ rooms }, {}, req);
}

/**
 * POST /shapes/:roomId
 * Persist a full-state snapshot of all shapes as a Chat message.
 * Called by the frontend auto-save debounce.
 * Requires authentication + room must exist + user must be the room admin.
 */
export async function saveShapesHandler(req: Request, url: URL) {
  const roomId = Number(url.pathname.split("/")[2]);
  if (!roomId) {
    return corsResponse({ message: "Invalid roomId" }, { status: 400 }, req);
  }

  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }

  if (!rateLimit(`shapes:${userId}`, 10, 60_000)) {
    return corsResponse(
      { message: "Too many saves. Please slow down." },
      { status: 429 },
      req,
    );
  }

  const room = await requireRoom(roomId);
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
  }

  try {
    const parsed = await readJsonBody<{ shapes?: Array<Record<string, unknown>>; baseVersion?: number }>(req);
    if ("error" in parsed) return parsed.error;

    const message = JSON.stringify({ type: "full-state", shapes: parsed.data.shapes ?? [] });
    if (encoder.encode(message).byteLength > MAX_DB_ROW_SIZE) {
      return corsResponse(
        { message: "Payload too large — reduce image sizes or remove images" },
        { status: 413 },
        req,
      );
    }

    // Wrap version check + write in a transaction so concurrent requests
    // are serialized by the database — only one can succeed per version.
    const result = await prismaClient.$transaction(async (tx) => {
      if (parsed.data.baseVersion != null) {
        const latest = await tx.chat.findFirst({
          where: {
            roomId,
            message: { startsWith: '{"type":"full-state"' },
          },
          orderBy: { id: "desc" },
          select: { id: true, message: true },
        });
        const currentVersion = latest?.id ?? 0;
        if (parsed.data.baseVersion !== currentVersion) {
          const currentShapes = latest
            ? (JSON.parse(latest.message).shapes ?? [])
            : [];
          return { conflict: true, version: currentVersion, shapes: currentShapes };
        }
      }

      const created = await tx.chat.create({
        data: { roomId, message, userId },
      });
      return { conflict: false, version: created.id };
    });

    if (result.conflict) {
      return corsResponse(
        { message: "Conflict — shapes changed", version: result.version, shapes: result.shapes },
        { status: 409 },
        req,
      );
    }
    return corsResponse({ ok: true, version: result.version }, {}, req);
  } catch {
    return corsResponse({ message: "Failed to save shapes" }, { status: 500 }, req);
  }
}

/**
 * GET /shapes/:roomId
 * Retrieve the latest full-state snapshot for a room.
 * Public — anyone who has joined the room can load the canvas.
 */
export async function getShapesHandler(url: URL, req: Request) {
  const roomId = Number(url.pathname.split("/")[2]);
  if (!roomId) {
    return corsResponse({ message: "Invalid roomId" }, { status: 400 }, req);
  }

  // Guests (no user) are rate-limited by IP so they can't share one bucket
  const userId = middleware(req);
  const limiterKey = userId ?? `guest:${getClientIp(req)}`;

  if (!rateLimit(`read:${limiterKey}`, READ_RATE_LIMIT, READ_RATE_WINDOW)) {
    return corsResponse(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
      req,
    );
  }

  const room = await requireRoom(roomId);
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
  }

  try {
    const msg = await prismaClient.chat.findFirst({
      where: {
        roomId,
        message: { startsWith: '{"type":"full-state"' },
      },
      orderBy: { id: "desc" },
    });
    if (!msg) {
      return corsResponse({ shapes: [], version: 0 }, {}, req);
    }
    let parsed: { shapes?: unknown[] };
    try {
      parsed = JSON.parse(msg.message);
    } catch {
      return corsResponse({ shapes: [], version: 0 }, {}, req);
    }
    return corsResponse({ shapes: parsed.shapes ?? [], version: msg.id }, {}, req);
  } catch {
    return corsResponse({ message: "Failed to load shapes" }, { status: 500 }, req);
  }
}
