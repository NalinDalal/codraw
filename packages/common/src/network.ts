/**
 * Network utilities shared between HTTP and WS backends.
 *
 * @module network
 */

/**
 * Extract the client IP address from a request.
 * Handles X-Forwarded-For for reverse-proxy deployments.
 *
 * @param req - The incoming HTTP request
 * @returns The client's IP address (defaults to `"127.0.0.1"`)
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "127.0.0.1";
  return "127.0.0.1";
}
