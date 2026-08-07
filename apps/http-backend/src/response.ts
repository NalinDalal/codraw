/**
 * CORS-aware response builder.
 *
 * Wraps every API response with appropriate CORS headers so the frontend
 * (deployed on a different origin) can make cross-origin requests.
 *
 * Allowed origins are configured via the `ALLOWED_ORIGINS` env var
 * (comma-separated). Defaults to `*` in development.
 *
 * @module response
 */

/**
 * Resolve the allowed CORS origin for a given request.
 *
 * @param reqOrigin - The `Origin` header from the request (may be `null`)
 * @returns The allowed origin header value, or null to block the request
 */
function getAllowedOrigin(reqOrigin: string | null): string | null {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    return process.env.NODE_ENV === "production" ? null : "*";
  }

  const allowed = raw.split(",").map((o) => o.trim());
  if (reqOrigin && allowed.includes(reqOrigin)) return reqOrigin;
  return null;
}

/**
 * Wrap an API response with CORS headers.
 * Supports preflight OPTIONS, JSON bodies, and null bodies (204).
 *
 * @param body - The response body (will be JSON-stringified, or null for 204)
 * @param init - Optional ResponseInit (status, headers, etc.)
 * @param req - The original request (used to read the Origin header for CORS)
 * @returns A new Response with CORS headers applied
 */
export function corsResponse(
  body: unknown,
  init: ResponseInit = {},
  req?: Request,
): Response {
  const headers = new Headers(init.headers);
  const origin = req?.headers.get("origin") ?? null;
  const allowedOrigin = getAllowedOrigin(origin);
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
  if (body !== null) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(body !== null ? JSON.stringify(body) : null, {
    ...init,
    headers,
  });
}
