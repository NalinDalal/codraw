/**
 * HTTP backend URL used for REST API requests (signin, signup, room creation).
 *
 * Defaults to `/api`, which Next.js rewrites to the HTTP backend
 * (`http://localhost:3001`), keeping the request same-origin so the auth
 * cookie always works. Set `NEXT_PUBLIC_HTTP_BACKEND` to override (e.g. a
 * fully-qualified URL) — used when the API is not proxied behind the site.
 *
 * @example
 * ```ts
 * await axios.get(`${HTTP_BACKEND}/room/my-room`, { withCredentials: true });
 * ```
 */
export const HTTP_BACKEND =
  process.env.NEXT_PUBLIC_HTTP_BACKEND || "/api";

/**
 * Absolute URL for server-side (SSR) fetches to the backend.
 * The browser never sees this value. In dev the backend is localhost; on EC2
 * it can point at the public API if `NEXT_PUBLIC_HTTP_BACKEND` is set.
 */
export const INTERNAL_HTTP_BACKEND =
  process.env.NEXT_PUBLIC_HTTP_BACKEND || "http://localhost:3001";

/**
 * WebSocket server URL for real-time collaboration.
 *
 * Defaults to a same-origin `/ws` (Next rewrites it to the WS backend) so the
 * connection and the auth cookie stay on one host. Set `NEXT_PUBLIC_WS_URL`
 * to override.
 *
 * @example
 * ```ts
 * const ws = new WebSocket(WS_URL, ["token", jwt]);
 * ```
 */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  `${typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"}://${
    typeof window !== "undefined" ? window.location.host : "localhost:3000"
  }/ws`;
