/**
 * In-memory auth token storage for WebSocket connections.
 *
 * HTTP requests use httpOnly cookies (set by the server on signin).
 * This module stores the JWT in memory only for WebSocket auth,
 * which cannot use httpOnly cookies.
 *
 * The token is NOT persisted to localStorage or sessionStorage.
 * It is lost on page refresh — the user must rejoin the room.
 *
 * @module auth
 */

let authToken: string | null = null;

/**
 * Store the JWT in memory for WebSocket authentication.
 *
 * @param token - The JWT string to store
 * @example
 * ```ts
 * const token = await fetchWsToken();
 * setAuthToken(token);
 * ```
 */
export function setAuthToken(token: string) {
  authToken = token;
}

/**
 * Retrieve the JWT from memory.
 *
 * @returns The stored JWT, or `null` if no token has been set
 * @example
 * ```ts
 * const token = getAuthToken();
 * if (token) {
 *   ws = new WebSocket(url, ["token", token]);
 * }
 * ```
 */
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Clear the JWT from memory.
 *
 * Called on signout or when the token is invalid/expired.
 */
export function clearAuthToken() {
  authToken = null;
}
