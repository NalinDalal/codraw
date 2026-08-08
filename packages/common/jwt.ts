/**
 * JWT (HS256) sign/verify helpers.
 *
 * Drop-in replacement for the removed experimental `Bun.jwt` API:
 * `signJwt(payload, secret, ttlSeconds)` ~ `Bun.jwt.sign({...payload, exp}, secret, "HS256")`
 * `verifyJwt(token, secret)` ~ `Bun.jwt.verify(token, secret, "HS256")`
 *
 * Uses `node:crypto` (HMAC-SHA256) so it stays synchronous and works on any
 * Node/Bun runtime without native addons.
 *
 * @module jwt
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();

function base64urlEncode(input: string): string {
  return Buffer.from(encoder.encode(input)).toString("base64url");
}

function signToken(payload: Record<string, unknown>, secret: string): string {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Sign a JWT with the given secret, valid for `ttlSeconds`.
 */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return signToken({ ...payload, exp }, secret);
}

/**
 * Verify a JWT and return its payload, or `null` on any failure
 * (bad signature, malformed token, expired).
 */
export function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  try {
    const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
