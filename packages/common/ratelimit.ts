/**
 * In-memory sliding-window rate limiter.
 * Shared between HTTP and WS backends.
 *
 * @module ratelimit
 */

/**
 * A single entry in the rate-limit bucket, tracking request count and window expiry.
 */
type RateLimitEntry = {
  /** Number of requests made within the current window */
  count: number;
  /** Unix timestamp (ms) when the current window expires */
  resetAt: number;
};

/**
 * In-memory store of rate-limit buckets keyed by identifier (e.g. IP address).
 * Entries are automatically pruned by the cleanup interval defined at module scope.
 */
const buckets = new Map<string, RateLimitEntry>();

/**
 * Sliding-window rate limiter (in-memory).
 * Returns true if the request is allowed, false if rate-limited.
 *
 * On the first call for a given `key`, a new window is started. Subsequent calls
 * within the window increment the counter until `limit` is reached. Once the
 * window expires, a fresh window is created on the next call.
 *
 * @param key       Unique key (e.g. IP address)
 * @param limit     Max requests per window (default: 10)
 * @param windowMs  Window duration in milliseconds (default: 60 000)
 * @returns `true` if the request is allowed, `false` if the limit has been exceeded
 *
 * @example
 * ```ts
 * // Allow at most 100 requests per minute per IP
 * app.use("*", async (c, next) => {
 *   const ip = getClientIp(c.req.raw);
 *   if (!rateLimit(ip, 100, 60_000)) {
 *     return c.json({ error: "Too many requests" }, 429);
 *   }
 *   await next();
 * });
 * ```
 */
export function rateLimit(
  key: string,
  limit: number = 10,
  windowMs: number = 60_000,
): boolean {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}

/**
 * Periodic cleanup of expired rate-limit buckets.
 * Runs every 60 seconds to prevent unbounded memory growth from stale entries.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 60_000);
