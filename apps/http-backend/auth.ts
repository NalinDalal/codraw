/**
 * Authentication handlers for sign-up and sign-in.
 *
 * - **POST /signup** — Creates a new user with bcrypt-hashed password.
 *   Returns the user ID. Rate-limited to 10 requests per IP per minute.
 * - **POST /signin** — Validates credentials and returns a JWT (7-day expiry).
 *   Rate-limited to 10 requests per IP per minute.
 *
 * Input validation is handled by Zod schemas. Duplicate email addresses
 * are silently accepted (returns 200) to prevent user enumeration.
 *
 * @module auth
 */

import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { corsResponse } from "./response";
import { readJsonBody } from "./body";
import { rateLimit, getClientIp } from "./ratelimit";
import { getJwtSecret } from "@repo/common/env";

/** Shared JWT secret matching middleware and WS backend */
const JWT_SECRET = getJwtSecret();

/** Max auth attempts per IP per minute */
const AUTH_RATE_LIMIT = 10;
const AUTH_RATE_WINDOW = 60_000;

/** Validation schema for POST /signup */
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(100),
});

/** Validation schema for POST /signin */
const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * POST /signup
 * Create a new user account. Password is hashed with bcrypt before storing.
 * Returns the new user's id.
 */
export async function signupHandler(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimit(`signup:${ip}`, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW)) {
    return corsResponse(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
      req,
    );
  }

  const parsed = await readJsonBody<{ email: string; password: string; name: string }>(req);
  if ("error" in parsed) return parsed.error;
  const parsedData = CreateUserSchema.safeParse(parsed.data);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 }, req);
  }

  try {
    const hashedPassword = await Bun.password.hash(parsedData.data.password, {
      algorithm: "bcrypt",
      cost: 10,
    });
    const user = await prismaClient.user.create({
      data: {
        email: parsedData.data.email,
        password: hashedPassword,
        name: parsedData.data.name,
      },
    });
    return corsResponse({ userId: user.id }, {}, req);
  } catch (e: any) {
    // P2002 = unique constraint violation (email already taken).
    // Return the same message for duplicates and successes to prevent user enumeration.
    if (e?.code === "P2002") {
      return corsResponse(
        { message: "If this email is available, your account has been created" },
        { status: 200 },
        req,
      );
    }
    return corsResponse(
      { message: "Failed to create account" },
      { status: 500 },
      req,
    );
  }
}

/**
 * POST /signin
 * Authenticate with email + password. Returns a JWT token on success.
 */
export async function signinHandler(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimit(`signin:${ip}`, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW)) {
    return corsResponse(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
      req,
    );
  }

  const parsed = await readJsonBody<{ email: string; password: string }>(req);
  if ("error" in parsed) return parsed.error;
  const parsedData = SigninSchema.safeParse(parsed.data);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 }, req);
  }

  const user = await prismaClient.user.findUnique({
    where: { email: parsedData.data.email },
  });

  if (!user) {
    return corsResponse({ message: "Not authorized" }, { status: 403 }, req);
  }

  const valid = await Bun.password.verify(
    parsedData.data.password,
    user.password,
  );
  if (!valid) {
    return corsResponse({ message: "Not authorized" }, { status: 403 }, req);
  }

  const token = Bun.jwt.sign(
    { userId: user.id, exp: Math.floor(Date.now() / 1000) + 604800 },
    JWT_SECRET,
    "HS256",
  );

  const isProd = Bun.env.NODE_ENV === "production";
  const cookie = [
    `token=${token}`,
    "HttpOnly",
    "Path=/",
    isProd ? "Secure" : "",
    "SameSite=Lax",
    "Max-Age=604800",
  ].filter(Boolean).join("; ");

  const res = corsResponse({ token }, {}, req);
  res.headers.append("Set-Cookie", cookie);
  return res;
}
