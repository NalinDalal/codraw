/**
 * Startup environment validation.
 * Shared between HTTP and WS backends to ensure consistent checks.
 *
 * @module env
 */

/**
 * Validate that all required environment variables are set and meet security constraints.
 *
 * Checks that every variable in `requiredVars` is present in `Bun.env`, that
 * `JWT_SECRET` is not the default placeholder, and that `JWT_SECRET` is at least
 * 32 characters long. If any check fails the process exits with code 1.
 *
 * @param requiredVars - Environment variable names that must be set (defaults to `["JWT_SECRET", "DATABASE_URL"]`)
 * @throws Exits the process if any required variable is missing or `JWT_SECRET` is insecure.
 *
 * @example
 * ```ts
 * // Validate with default required vars
 * validateEnv();
 *
 * // Validate with custom required vars
 * validateEnv(["JWT_SECRET", "DATABASE_URL", "REDIS_URL"]);
 * ```
 */
export function validateEnv(requiredVars: string[] = ["JWT_SECRET", "DATABASE_URL"]) {
  const missing = requiredVars.filter((k) => !Bun.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (Bun.env.JWT_SECRET === "your-secret-key-change-me") {
    console.error("JWT_SECRET must be changed from the default value");
    process.exit(1);
  }
  if (Bun.env.JWT_SECRET && Bun.env.JWT_SECRET.length < 32) {
    console.error("JWT_SECRET must be at least 32 characters long");
    process.exit(1);
  }
}

/**
 * Get the validated JWT secret.
 * Must be called after `validateEnv()` has run.
 *
 * @returns The JWT_SECRET environment variable value (non-null assertion)
 *
 * @example
 * ```ts
 * validateEnv();
 * const secret = getJwtSecret();
 * const token = jwt.sign({ userId: 1 }, secret, { expiresIn: "7d" });
 * ```
 */
export function getJwtSecret(): string {
  return Bun.env.JWT_SECRET!;
}
