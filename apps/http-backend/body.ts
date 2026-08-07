/**
 * JSON body parser with size limits.
 *
 * Reads the raw request body as an `ArrayBuffer`, validates the actual
 * byte size (not the Content-Length header), and parses as JSON.
 * Returns a discriminated union so callers can return the error
 * response immediately without throwing.
 *
 * @module body
 */

import { corsResponse } from "./response";

/** Maximum allowed request body size (1 MB) */
const MAX_BODY_SIZE = 1 * 1024 * 1024;

/**
 * Read and parse a JSON request body with a hard size limit.
 * Validates the *actual* bytes received, not the Content-Length header.
 * Returns the parsed object or a Response error (to return immediately).
 *
 * @param req - The incoming HTTP request to read the body from
 * @returns `{ data }` with the parsed JSON, or `{ error }` with a CORS-aware error Response
 */
export async function readJsonBody<T = unknown>(
  req: Request,
): Promise<{ data: T } | { error: Response }> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BODY_SIZE) {
    return {
      error: corsResponse(
        { error: "Request body too large" },
        { status: 413 },
        req,
      ),
    };
  }

  try {
    const text = new TextDecoder().decode(buf);
    const data = JSON.parse(text) as T;
    return { data };
  } catch {
    return {
      error: corsResponse({ error: "Invalid JSON" }, { status: 400 }, req),
    };
  }
}
