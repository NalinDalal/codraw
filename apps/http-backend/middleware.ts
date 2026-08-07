/**
 * JWT authentication middleware for the HTTP backend.
 *
 * Extracts and verifies a JWT from the `Authorization` header.
 * Supports both `Bearer <token>` and raw token formats.
 *
 * Returns the `userId` on success, or `null` on any failure
 * (missing header, invalid token, expired token).
 *
 * @module middleware
 */

import { getJwtSecret } from "@repo/common/env";

/** Shared JWT secret used across HTTP and WS backends */
const JWT_SECRET = getJwtSecret();

/**
 * Extract and verify the JWT from the httpOnly cookie or Authorization header.
 * Cookie is preferred (XSS-safe). Authorization header is a fallback for
 * tools like curl or WebSocket upgrades.
 *
 * @param req - The incoming HTTP request
 * @returns The userId string on success, or null on any auth failure
 */
export function middleware(req: Request): string | null {
  let token: string | null = null;

  // Prefer httpOnly cookie
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)token=([^;]*)/);
    if (match)     token = match[1]!;
  }

  // Fall back to Authorization header
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    }
  }

  if (!token) return null;

  try {
    const decoded = Bun.jwt.verify(token, JWT_SECRET, "HS256");
    if (!decoded || typeof decoded === "string") return null;
    return (decoded as any).userId as string;
  } catch {
    return null;
  }
}
