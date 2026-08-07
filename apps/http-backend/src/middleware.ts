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

import jwt from "jsonwebtoken";
import { getJwtSecret } from "@repo/common/env";

/** Shared JWT secret used across HTTP and WS backends */
const JWT_SECRET = getJwtSecret();

/**
 * Extract and verify the JWT from the Authorization header.
 * Accepts both raw token and "Bearer <token>" format.
 * Returns the userId on success, or null if the header is missing or the token is invalid.
 *
 * @param req - The incoming HTTP request to extract the Authorization header from
 * @returns The userId string on success, or null on any auth failure
 */
export function middleware(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  // Support both "Bearer <token>" and raw token formats
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;
    return (decoded as jwt.JwtPayload).userId as string;
  } catch {
    return null;
  }
}
