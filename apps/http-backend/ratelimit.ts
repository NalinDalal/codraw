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

export { rateLimit } from "@repo/common/ratelimit";
export { getClientIp } from "@repo/common/network";
