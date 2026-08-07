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

/** Store the JWT in memory (call on signin) */
export function setAuthToken(token: string) {
  authToken = token;
}

/** Retrieve the JWT from memory (for WebSocket auth) */
export function getAuthToken(): string | null {
  return authToken;
}

/** Clear the JWT from memory (call on signout) */
export function clearAuthToken() {
  authToken = null;
}
