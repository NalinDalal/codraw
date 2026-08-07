/**
 * Network utilities shared between HTTP and WS backends.
 *
 * @module network
 */

/**
 * Extract the client IP address from a request.
 * Handles X-Forwarded-For for reverse-proxy deployments.
 *
 * Uses the **last** IP in the X-Forwarded-For chain, which is the one
 * appended by the closest trusted proxy. The first IP is client-controlled
 * and trivially spoofable.
 *
 * @param req - The incoming HTTP request
 * @returns The client's IP address, or `"127.0.0.1"` if no forwarding header is present
 *
 * @example
 * ```ts
 * const app = new Hono();
 * app.get("/ip", (c) => {
 *   const ip = getClientIp(c.req.raw);
 *   return c.json({ ip });
 * });
 * ```
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "127.0.0.1";
}
