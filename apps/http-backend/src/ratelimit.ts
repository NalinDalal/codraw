/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks request counts per key (typically IP address) within a time window.
 * Expired entries are pruned every 60 seconds to prevent memory leaks.
 *
 * Used on auth endpoints (10 req/min) and shape saves (10 req/min).
 *
 * @module ratelimit
 */

/** Internal tracking entry for a rate-limit bucket */
type RateLimitEntry = { count: number; resetAt: number };

const buckets = new Map<string, RateLimitEntry>();

/**
 * Sliding-window rate limiter (in-memory).
 * Returns true if the request is allowed, false if rate-limited.
 *
 * @param key       Unique key (e.g. IP address)
 * @param limit     Max requests per window
 * @param windowMs  Window duration in milliseconds
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

/** Prune expired entries periodically to prevent memory leaks */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 60_000);

/**
 * Extract a rate-limit key from a request (IP address).
 * Handles X-Forwarded-For for reverse-proxy deployments.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}
