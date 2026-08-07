/**
 * HTTP backend URL used for REST API requests (signin, signup, room creation).
 *
 * Defaults to `http://localhost:3001` if `NEXT_PUBLIC_HTTP_BACKEND` is not set.
 *
 * @example
 * ```ts
 * await axios.get(`${HTTP_BACKEND}/room/my-room`, { withCredentials: true });
 * ```
 */
export const HTTP_BACKEND =
  process.env.NEXT_PUBLIC_HTTP_BACKEND || "http://localhost:3001";

/**
 * WebSocket server URL for real-time collaboration.
 *
 * Defaults to `ws://localhost:8080` if `NEXT_PUBLIC_WS_URL` is not set.
 * The JWT is passed as a sub-protocol: `["token", jwt]`.
 *
 * @example
 * ```ts
 * const ws = new WebSocket(WS_URL, ["token", jwt]);
 * ```
 */
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";
